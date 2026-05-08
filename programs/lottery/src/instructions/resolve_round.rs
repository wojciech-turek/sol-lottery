//! Phase 5a: admin-supplied randomness path. Phase 5b will add the public
//! ORAO VRF path; both will share the `distribute_and_finalize` helper below.
//!
//! Lamport flow:
//!   * The Round account itself holds the ticket-sale lamports (paid in via
//!     `system_program::transfer` during `buy_tickets`).
//!   * On resolve we mutate `round.lamports` directly (allowed because the
//!     program owns the account) and credit each split's destination.
//!   * Rent-exempt minimum stays on the Round so the account survives.
//!
//! Caller responsibilities:
//!   * The caller (admin in Phase 5a) computes the winner off-chain from the
//!     seed and the round's ticket book, and passes:
//!       - `winner_shard`: the shard containing the winning ticket
//!       - `remaining_accounts[i]`: the destination wallet for `splits[i]`,
//!         or the winner for the pool split
//!   * On-chain we recompute the winner index and validate every passed
//!     account matches the expected destination — bad inputs are rejected.

use anchor_lang::prelude::*;

use crate::errors::LotteryError;
use crate::events::RoundResolved;
use crate::state::{
    GlobalConfig, Lottery, LotteryState, Round, RoundState, Split, TicketShard,
};

#[derive(Accounts)]
pub struct ResolveRound<'info> {
    #[account(
        seeds = [GlobalConfig::SEED],
        bump = global_config.bump,
        has_one = admin @ LotteryError::Unauthorized,
    )]
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

    /// Shard containing the winning ticket. Its `shard_index` must match
    /// what we derive from the seed; otherwise the resolve aborts.
    #[account(
        seeds = [TicketShard::SEED, round.key().as_ref(), &winner_shard.shard_index.to_le_bytes()],
        bump = winner_shard.bump,
        constraint = winner_shard.round == round.key() @ LotteryError::WrongTicketShard,
    )]
    pub winner_shard: Account<'info, TicketShard>,

    pub admin: Signer<'info>,
}

pub fn resolve_round_handler<'info>(
    ctx: Context<'_, '_, '_, 'info, ResolveRound<'info>>,
    seed: [u8; 32],
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    // Read once, mutate later — keeps the borrow checker happy.
    let lottery_key = ctx.accounts.lottery.key();
    let round_key = ctx.accounts.round.key();
    let tickets_sold = ctx.accounts.round.tickets_sold;
    let ticket_price = ctx.accounts.round.ticket_price_lamports;

    require!(
        matches!(
            ctx.accounts.round.state,
            RoundState::Open | RoundState::Closed
        ),
        LotteryError::RoundAlreadyResolved
    );
    require!(tickets_sold > 0, LotteryError::RoundHasNoTickets);

    // Pick the winner from the first 8 seed bytes.
    let mut idx_bytes = [0u8; 8];
    idx_bytes.copy_from_slice(&seed[0..8]);
    let winner_index = u64::from_le_bytes(idx_bytes) % tickets_sold;
    let expected_shard = (winner_index / TicketShard::CAPACITY as u64) as u32;
    let offset = (winner_index % TicketShard::CAPACITY as u64) as usize;

    let shard = &ctx.accounts.winner_shard;
    require!(
        shard.shard_index == expected_shard,
        LotteryError::WrongTicketShard
    );
    require!(
        (offset as u32) < shard.len,
        LotteryError::WrongTicketShard
    );
    let winner = shard.buyers[offset];

    // Validate remaining_accounts match the splits, then distribute.
    let splits = ctx.accounts.round.splits.clone();
    require!(
        ctx.remaining_accounts.len() == splits.len(),
        LotteryError::WrongSplitDestination
    );

    let gross = ticket_price
        .checked_mul(tickets_sold)
        .ok_or(LotteryError::MathOverflow)?;

    let (pool_amount, total_distributed) = distribute_lamports(
        &ctx.accounts.round,
        ctx.remaining_accounts,
        &splits,
        gross,
        winner,
    )?;

    // Mutate state once at the end to avoid juggling borrows.
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
    Ok(())
}

/// Iterates over `splits` in order, validating each destination against the
/// matching remaining_account, and transferring `gross * bps / 10_000` from
/// the Round account to that destination.
///
/// Returns `(pool_amount, total_distributed)` for event emission.
pub(crate) fn distribute_lamports<'info>(
    round: &Account<'info, Round>,
    accounts: &[AccountInfo<'info>],
    splits: &[Split],
    gross: u64,
    winner: Pubkey,
) -> Result<(u64, u64)> {
    let mut total: u64 = 0;
    let mut pool: u64 = 0;
    let round_info = round.to_account_info();

    for (i, split) in splits.iter().enumerate() {
        let dest = &accounts[i];
        let expected = if split.is_pool {
            winner
        } else {
            split.destination
        };
        require_keys_eq!(dest.key(), expected, LotteryError::WrongSplitDestination);

        let amount = ((gross as u128)
            .checked_mul(split.bps as u128)
            .ok_or(LotteryError::MathOverflow)?
            / 10_000u128) as u64;

        if amount == 0 {
            continue;
        }

        // Direct lamport mutation: round is owned by this program.
        **round_info.try_borrow_mut_lamports()? = round_info
            .lamports()
            .checked_sub(amount)
            .ok_or(LotteryError::InsufficientFunds)?;
        **dest.try_borrow_mut_lamports()? = dest
            .lamports()
            .checked_add(amount)
            .ok_or(LotteryError::MathOverflow)?;

        if split.is_pool {
            pool = amount;
        }
        total = total
            .checked_add(amount)
            .ok_or(LotteryError::MathOverflow)?;
    }

    Ok((pool, total))
}
