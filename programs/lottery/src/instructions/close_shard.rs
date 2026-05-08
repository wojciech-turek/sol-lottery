//! Closes a TicketShard PDA after the round has resolved, returning the
//! shard's rent (~the realloc cost paid by buyers and the initial allocator)
//! to the configured admin.
//!
//! Anyone may call this — closing shards is bookkeeping that nobody benefits
//! from gatekeeping. Doing it via cron after each resolve keeps long-running
//! lotteries from accumulating dead 256 KB accounts.

use anchor_lang::prelude::*;

use crate::errors::LotteryError;
use crate::events::ShardClosed;
use crate::state::{GlobalConfig, Lottery, Round, RoundState, TicketShard};

#[derive(Accounts)]
pub struct CloseShard<'info> {
    #[account(
        seeds = [GlobalConfig::SEED],
        bump = global_config.bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        seeds = [Lottery::SEED, &lottery.id.to_le_bytes()],
        bump = lottery.bump,
    )]
    pub lottery: Account<'info, Lottery>,

    #[account(
        seeds = [Round::SEED, lottery.key().as_ref(), &round.index.to_le_bytes()],
        bump = round.bump,
        constraint = round.lottery == lottery.key(),
    )]
    pub round: Account<'info, Round>,

    /// The shard to close.
    #[account(
        mut,
        seeds = [TicketShard::SEED, round.key().as_ref(), &shard.shard_index.to_le_bytes()],
        bump = shard.bump,
        constraint = shard.round == round.key() @ LotteryError::WrongTicketShard,
        close = rent_recipient,
    )]
    pub shard: Account<'info, TicketShard>,

    /// Where the shard's rent goes. Pinned to the program admin so the rent
    /// is reclaimable but no random caller can redirect it.
    #[account(
        mut,
        address = global_config.admin @ LotteryError::Unauthorized,
    )]
    pub rent_recipient: SystemAccount<'info>,

    pub caller: Signer<'info>,
}

pub fn close_shard_handler(ctx: Context<CloseShard>) -> Result<()> {
    require!(
        ctx.accounts.round.state == RoundState::Resolved,
        LotteryError::RoundNotResolved
    );

    emit!(ShardClosed {
        round: ctx.accounts.round.key(),
        shard_index: ctx.accounts.shard.shard_index,
        rent_returned_to: ctx.accounts.rent_recipient.key(),
        at: Clock::get()?.unix_timestamp,
    });
    // Anchor's `close = rent_recipient` does the actual lamport transfer.
    Ok(())
}
