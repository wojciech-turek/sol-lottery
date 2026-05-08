//! Public step 1 of resolution: anyone can call this once the round's
//! timer has expired (or the admin can call it any time). It creates a
//! `VrfRequest` PDA capturing the seed for the upcoming randomness.
//!
//! In Phase 5c, this same handler will additionally CPI into the ORAO VRF
//! program, kicking off off-chain fulfillment. For now we only set up the
//! request; an authorized caller writes the randomness via
//! `fulfill_resolution`.

use anchor_lang::prelude::*;

use crate::errors::LotteryError;
use crate::events::ResolutionRequested;
use crate::state::{GlobalConfig, Lottery, LotteryState, Round, RoundState, VrfRequest};

#[derive(Accounts)]
pub struct RequestResolution<'info> {
    pub global_config: Account<'info, GlobalConfig>,

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
        init,
        payer = caller,
        space = 8 + VrfRequest::INIT_SPACE,
        seeds = [VrfRequest::SEED, round.key().as_ref()],
        bump,
    )]
    pub vrf_request: Account<'info, VrfRequest>,

    #[account(mut)]
    pub caller: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn request_resolution_handler(ctx: Context<RequestResolution>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let caller = ctx.accounts.caller.key();
    let admin = ctx.accounts.global_config.admin;

    let lottery = &ctx.accounts.lottery;
    let round = &mut ctx.accounts.round;

    require!(
        matches!(round.state, RoundState::Open | RoundState::Closed),
        LotteryError::RoundAlreadyResolved
    );
    require!(round.tickets_sold > 0, LotteryError::RoundHasNoTickets);

    let is_admin = caller == admin;
    if !is_admin {
        // Public callers (cron) can only request after the timer elapsed and
        // while the lottery is not paused.
        require!(
            lottery.state == LotteryState::Active,
            LotteryError::LotteryNotActive
        );
        require!(round.paused_at.is_none(), LotteryError::LotteryPaused);
        let effective_end = round
            .started_at
            .checked_add(round.duration_seconds)
            .and_then(|x| x.checked_add(round.paused_total_seconds))
            .ok_or(LotteryError::MathOverflow)?;
        require!(now >= effective_end, LotteryError::RoundStillRunning);
    }

    // Seed: round pubkey is unique per round and is sufficient as a
    // deterministic identifier. ORAO will mix in slot/blockhash on its side.
    let seed = round.key().to_bytes();

    let req = &mut ctx.accounts.vrf_request;
    req.round = round.key();
    req.seed = seed;
    req.fulfilled = false;
    req.randomness = [0u8; 64];
    req.requested_at = now;
    req.bump = ctx.bumps.vrf_request;

    round.state = RoundState::AwaitingVrf;
    round.vrf_request = Some(req.key());

    emit!(ResolutionRequested {
        round: round.key(),
        vrf_request: req.key(),
        by: caller,
        at: now,
    });
    Ok(())
}
