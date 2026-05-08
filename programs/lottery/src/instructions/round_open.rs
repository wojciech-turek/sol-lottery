//! Opens a new round on a lottery, snapshotting current config and
//! pre-allocating shard 0.
//!
//! **Auth model:**
//! * Round 1 (first round of a lottery): admin only.
//! * Subsequent rounds (auto-rollover): the previous round must be `Resolved`
//!   and `lottery.auto_rollover == true`. Anyone (e.g. a cron job) may then
//!   open the next round and pay its rent.

use anchor_lang::prelude::*;

use crate::errors::LotteryError;
use crate::events::RoundOpened;
use crate::state::{GlobalConfig, Lottery, LotteryState, Round, RoundState, TicketShard};

#[derive(Accounts)]
#[instruction(round_index: u64)]
pub struct OpenRound<'info> {
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [Lottery::SEED, &lottery.id.to_le_bytes()],
        bump = lottery.bump,
    )]
    pub lottery: Account<'info, Lottery>,

    /// The previous round (must be Resolved) — required when `round_index > 1`.
    /// Pass `None` only for round 1.
    #[account(
        seeds = [
            Round::SEED,
            lottery.key().as_ref(),
            &round_index.checked_sub(1).unwrap_or(0).to_le_bytes(),
        ],
        bump = previous_round.bump,
        constraint = previous_round.lottery == lottery.key(),
    )]
    pub previous_round: Option<Account<'info, Round>>,

    #[account(
        init,
        payer = payer,
        space = 8 + Round::INIT_SPACE,
        seeds = [Round::SEED, lottery.key().as_ref(), &round_index.to_le_bytes()],
        bump,
    )]
    pub round: Account<'info, Round>,

    /// Header-only allocation; grows via `realloc` on each `buy_tickets`.
    #[account(
        init,
        payer = payer,
        space = TicketShard::HEADER_SIZE,
        seeds = [TicketShard::SEED, round.key().as_ref(), &0u32.to_le_bytes()],
        bump,
    )]
    pub shard_zero: Account<'info, TicketShard>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn open_round_handler(ctx: Context<OpenRound>, round_index: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let lottery = &mut ctx.accounts.lottery;
    let payer_key = ctx.accounts.payer.key();
    let admin = ctx.accounts.global_config.admin;
    let is_admin = payer_key == admin;

    require!(
        lottery.state == LotteryState::Active,
        LotteryError::LotteryNotActive
    );
    require!(
        round_index
            == lottery
                .current_round_index
                .checked_add(1)
                .ok_or(LotteryError::MathOverflow)?,
        LotteryError::RoundAlreadyOpen
    );

    if round_index == 1 {
        // First round must always be opened by the admin.
        require!(is_admin, LotteryError::Unauthorized);
    } else {
        let prev = ctx
            .accounts
            .previous_round
            .as_ref()
            .ok_or(LotteryError::PreviousRoundNotResolved)?;
        require!(
            prev.state == RoundState::Resolved,
            LotteryError::PreviousRoundNotResolved
        );
        // Either the admin opens it, or auto-rollover is enabled and anyone may.
        require!(
            is_admin || lottery.auto_rollover,
            LotteryError::Unauthorized
        );
    }

    // Snapshot config into the new round.
    let round = &mut ctx.accounts.round;
    round.lottery = lottery.key();
    round.index = round_index;
    round.state = RoundState::Open;
    round.started_at = now;
    round.duration_seconds = lottery.round_duration_seconds;
    round.ticket_price_lamports = lottery.ticket_price_lamports;
    round.splits = lottery.splits.clone();
    round.paused_at = None;
    round.paused_total_seconds = 0;
    round.tickets_sold = 0;
    round.current_shard = 0;
    round.max_shard = 0;
    round.winner = None;
    round.vrf_request = None;
    round.bump = ctx.bumps.round;

    // Initialize shard 0.
    let shard = &mut ctx.accounts.shard_zero;
    shard.round = round.key();
    shard.shard_index = 0;
    shard.len = 0;
    shard.bump = ctx.bumps.shard_zero;

    lottery.current_round_index = round_index;

    let effective_end = now
        .checked_add(round.duration_seconds)
        .ok_or(LotteryError::MathOverflow)?;
    emit!(RoundOpened {
        lottery: lottery.key(),
        round: round.key(),
        index: round_index,
        started_at: now,
        effective_end,
        ticket_price_lamports: round.ticket_price_lamports,
    });
    Ok(())
}
