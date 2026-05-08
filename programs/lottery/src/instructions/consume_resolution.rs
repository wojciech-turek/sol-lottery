//! Public step 3 of resolution: anyone can call this once the VrfRequest
//! has been fulfilled. It uses the stored randomness as a seed, then
//! delegates to the same lamport-distribution helper as `resolve_round`.

use anchor_lang::prelude::*;

use crate::errors::LotteryError;
use crate::events::RoundResolved;
use crate::instructions::resolve_round::distribute_lamports;
use crate::instructions::shared::try_atomic_rollover;
use crate::state::{
    GlobalConfig, Lottery, LotteryState, Round, RoundState, TicketShard, VrfRequest,
};

#[derive(Accounts)]
pub struct ConsumeResolution<'info> {
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        mut,
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
        seeds = [VrfRequest::SEED, round.key().as_ref()],
        bump = vrf_request.bump,
        constraint = vrf_request.round == round.key(),
    )]
    pub vrf_request: Account<'info, VrfRequest>,

    #[account(
        seeds = [TicketShard::SEED, round.key().as_ref(), &winner_shard.shard_index.to_le_bytes()],
        bump = winner_shard.bump,
        constraint = winner_shard.round == round.key() @ LotteryError::WrongTicketShard,
    )]
    pub winner_shard: Account<'info, TicketShard>,

    #[account(mut)]
    pub caller: Signer<'info>,

    /// Optional rollover target — see `resolve_round.rs` for semantics.
    /// CHECK: validated and initialized inside `try_atomic_rollover`.
    #[account(mut)]
    pub next_round: Option<UncheckedAccount<'info>>,

    /// CHECK: validated and initialized inside `try_atomic_rollover`.
    #[account(mut)]
    pub next_shard: Option<UncheckedAccount<'info>>,

    pub system_program: Option<Program<'info, System>>,
}

pub fn consume_resolution_handler<'info>(
    ctx: Context<'_, '_, '_, 'info, ConsumeResolution<'info>>,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let lottery_key = ctx.accounts.lottery.key();
    let round_key = ctx.accounts.round.key();
    let tickets_sold = ctx.accounts.round.tickets_sold;
    let ticket_price = ctx.accounts.round.ticket_price_lamports;

    require!(
        ctx.accounts.round.state == RoundState::AwaitingVrf,
        LotteryError::RoundAlreadyResolved
    );
    require!(
        ctx.accounts.vrf_request.fulfilled,
        LotteryError::VrfNotFulfilled
    );

    // Seed = first 32 bytes of the 64-byte randomness.
    let mut idx_bytes = [0u8; 8];
    idx_bytes.copy_from_slice(&ctx.accounts.vrf_request.randomness[0..8]);
    let winner_index = u64::from_le_bytes(idx_bytes) % tickets_sold;
    let expected_shard = (winner_index / TicketShard::CAPACITY as u64) as u32;
    let offset = (winner_index % TicketShard::CAPACITY as u64) as usize;

    let shard = &ctx.accounts.winner_shard;
    require!(
        shard.shard_index == expected_shard,
        LotteryError::WrongTicketShard
    );
    require!((offset as u32) < shard.len, LotteryError::WrongTicketShard);
    let winner = shard.buyers[offset];

    let splits = ctx.accounts.round.splits.clone();
    require!(
        ctx.remaining_accounts.len() == splits.len(),
        LotteryError::WrongSplitDestination
    );

    let gross = ticket_price
        .checked_mul(tickets_sold)
        .ok_or(LotteryError::MathOverflow)?;
    let donated = ctx.accounts.round.donated_lamports;

    let (pool_amount, total_distributed) = distribute_lamports(
        &ctx.accounts.round,
        ctx.remaining_accounts,
        &splits,
        gross,
        donated,
        winner,
    )?;

    let round = &mut ctx.accounts.round;
    round.state = RoundState::Resolved;
    round.winner = Some(winner);
    round.vrf_request = None;

    let lottery = &mut ctx.accounts.lottery;
    lottery.total_rounds_resolved = lottery
        .total_rounds_resolved
        .checked_add(1)
        .ok_or(LotteryError::MathOverflow)?;
    lottery.total_tickets_sold = lottery
        .total_tickets_sold
        .checked_add(tickets_sold)
        .ok_or(LotteryError::MathOverflow)?;
    if lottery.state == LotteryState::PendingDisable {
        lottery.state = LotteryState::Disabled;
    }

    emit!(RoundResolved {
        lottery: lottery_key,
        round: round_key,
        winner: Some(winner),
        winning_ticket_index: Some(winner_index),
        pool_amount_lamports: pool_amount,
        total_distributed_lamports: total_distributed,
        at: now,
    });

    if let Some(sys) = ctx.accounts.system_program.as_ref() {
        try_atomic_rollover(
            &mut ctx.accounts.lottery,
            &ctx.accounts.next_round,
            &ctx.accounts.next_shard,
            ctx.accounts.caller.to_account_info(),
            sys.to_account_info(),
        )?;
    }
    Ok(())
}
