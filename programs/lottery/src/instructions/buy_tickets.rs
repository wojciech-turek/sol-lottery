//! Buy one or more tickets in the current round.

use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::errors::LotteryError;
use crate::events::TicketBought;
use crate::state::{Lottery, LotteryState, Round, RoundState, TicketShard};

/// **Accounts**
/// * `lottery` — read; must be Active.
/// * `round` *(mut)* — Open, not paused, not expired. Receives the ticket
///   payment as lamports (program-owned account, drained at resolve).
/// * `current_shard` *(mut, realloc)* — must match `round.current_shard`.
///   Reallocs by `quantity * 32` bytes to make room for the new ticket
///   entries. Buyer pays the rent on that growth.
/// * `buyer` *(signer, payer)*.
/// * `system_program`.
///
/// **Args**
/// * `quantity` — > 0, ≤ `TicketShard::MAX_BUYERS_PER_CALL` (320), and
///   ≤ remaining capacity in `current_shard`.
#[derive(Accounts)]
#[instruction(quantity: u64)]
pub struct BuyTickets<'info> {
    #[account(
        seeds = [Lottery::SEED, &lottery.id.to_le_bytes()],
        bump = lottery.bump,
    )]
    pub lottery: Account<'info, Lottery>,

    #[account(
        mut,
        seeds = [Round::SEED, lottery.key().as_ref(), &round.index.to_le_bytes()],
        bump = round.bump,
        constraint = round.lottery == lottery.key(),
    )]
    pub round: Account<'info, Round>,

    #[account(
        mut,
        seeds = [TicketShard::SEED, round.key().as_ref(), &round.current_shard.to_le_bytes()],
        bump = current_shard.bump,
        constraint = current_shard.round == round.key() @ LotteryError::WrongTicketShard,
        realloc = TicketShard::HEADER_SIZE + (current_shard.len as usize + quantity as usize) * 32,
        realloc::payer = buyer,
        realloc::zero = false,
    )]
    pub current_shard: Account<'info, TicketShard>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn buy_tickets_handler(ctx: Context<BuyTickets>, quantity: u64) -> Result<()> {
    require!(quantity > 0, LotteryError::QuantityZero);
    require!(
        quantity <= TicketShard::MAX_BUYERS_PER_CALL,
        LotteryError::QuantityTooLarge
    );

    let now = Clock::get()?.unix_timestamp;
    let buyer_key = ctx.accounts.buyer.key();

    let lottery = &ctx.accounts.lottery;
    let round = &mut ctx.accounts.round;
    let shard = &mut ctx.accounts.current_shard;

    require!(
        lottery.state == LotteryState::Active,
        LotteryError::LotteryNotActive
    );
    require!(round.state == RoundState::Open, LotteryError::RoundNotOpen);
    require!(round.paused_at.is_none(), LotteryError::LotteryPaused);

    let effective_end = round
        .started_at
        .checked_add(round.duration_seconds)
        .and_then(|x| x.checked_add(round.paused_total_seconds))
        .ok_or(LotteryError::MathOverflow)?;
    require!(now < effective_end, LotteryError::RoundExpired);

    let q_u32 = quantity as u32;
    require!(
        shard
            .len
            .checked_add(q_u32)
            .ok_or(LotteryError::MathOverflow)?
            <= TicketShard::CAPACITY,
        LotteryError::TicketShardFull
    );

    // Charge the buyer; lamports flow onto the Round account itself.
    let total = round
        .ticket_price_lamports
        .checked_mul(quantity)
        .ok_or(LotteryError::MathOverflow)?;
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: round.to_account_info(),
            },
        ),
        total,
    )?;

    // Append `quantity` copies of the buyer's pubkey to the shard. Reserve
    // first so the underlying Vec only allocates once instead of doubling
    // its way up to the new capacity (heap pressure is real in BPF).
    shard.buyers.reserve(quantity as usize);
    for _ in 0..quantity {
        shard.buyers.push(buyer_key);
    }
    shard.len = shard
        .len
        .checked_add(q_u32)
        .ok_or(LotteryError::MathOverflow)?;

    // Round counters.
    round.tickets_sold = round
        .tickets_sold
        .checked_add(quantity)
        .ok_or(LotteryError::MathOverflow)?;

    emit!(TicketBought {
        round: round.key(),
        buyer: buyer_key,
        quantity,
        total_paid_lamports: total,
        running_total: round.tickets_sold,
        at: now,
    });
    Ok(())
}
