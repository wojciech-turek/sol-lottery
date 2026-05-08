//! Admin-only fast path for resolving a round with zero tickets sold.
//!
//! There's nothing for VRF to draw, so we skip the request and mark the
//! round Resolved with no winner. The round vault never received any SOL,
//! so no distribution is needed.

use anchor_lang::prelude::*;

use crate::errors::LotteryError;
use crate::events::RoundResolved;
use crate::state::{GlobalConfig, Lottery, LotteryState, Round, RoundState};

#[derive(Accounts)]
pub struct ResolveEmptyRound<'info> {
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

    pub admin: Signer<'info>,
}

pub fn resolve_empty_round_handler(ctx: Context<ResolveEmptyRound>) -> Result<()> {
    let lottery = &mut ctx.accounts.lottery;
    let round = &mut ctx.accounts.round;

    require!(
        matches!(round.state, RoundState::Open | RoundState::Closed),
        LotteryError::RoundAlreadyResolved
    );
    require!(round.tickets_sold == 0, LotteryError::RoundHasNoTickets);

    let now = Clock::get()?.unix_timestamp;
    round.state = RoundState::Resolved;
    round.winner = None;
    round.vrf_request = None;

    lottery.total_rounds_resolved = lottery
        .total_rounds_resolved
        .checked_add(1)
        .ok_or(LotteryError::MathOverflow)?;

    // If lottery is being wound down, this becomes the final round.
    if lottery.state == LotteryState::PendingDisable {
        lottery.state = LotteryState::Disabled;
    }

    emit!(RoundResolved {
        lottery: lottery.key(),
        round: round.key(),
        winner: None,
        winning_ticket_index: None,
        pool_amount_lamports: 0,
        total_distributed_lamports: 0,
        at: now,
    });
    Ok(())
}
