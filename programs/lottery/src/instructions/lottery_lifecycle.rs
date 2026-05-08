//! Pause / resume / disable / close — the Lottery lifecycle transitions.
//!
//! Pause and resume also touch the in-flight Round (if any) so the round's
//! timer accurately reflects suspended time. We model that with an
//! `Option<Account<'info, Round>>` in the Accounts struct: callers pass the
//! round PDA when one is open, otherwise `None`.

use anchor_lang::prelude::*;

use crate::errors::LotteryError;
use crate::events::LotteryStateChanged;
use crate::state::{GlobalConfig, Lottery, LotteryState, Round, RoundState};

/// Shared `Accounts` for state-only transitions (no Round touched). Used by
/// `begin_disable_lottery`, `finalize_disable_lottery`.
#[derive(Accounts)]
pub struct LotteryStateOnly<'info> {
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

    pub admin: Signer<'info>,
}

/// Pause / resume — may need to touch the in-flight round to freeze its
/// `paused_at` timestamp. The optional account is validated only when Some.
#[derive(Accounts)]
pub struct LotteryWithMaybeRound<'info> {
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

    /// In-flight round; pass `None` when no round is open.
    #[account(
        mut,
        seeds = [Round::SEED, lottery.key().as_ref(), &lottery.current_round_index.to_le_bytes()],
        bump = round.bump,
        constraint = round.lottery == lottery.key(),
    )]
    pub round: Option<Account<'info, Round>>,

    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseLottery<'info> {
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
        close = admin,
        constraint = lottery.state == LotteryState::Disabled @ LotteryError::LotteryNotDisabled,
    )]
    pub lottery: Account<'info, Lottery>,

    #[account(mut)]
    pub admin: Signer<'info>,
}

pub fn pause_lottery_handler(ctx: Context<LotteryWithMaybeRound>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let lottery = &mut ctx.accounts.lottery;

    require!(
        lottery.state == LotteryState::Active,
        LotteryError::PauseRequiresActive
    );

    let prev = lottery.state;
    lottery.state = LotteryState::Paused;

    if let Some(round) = ctx.accounts.round.as_mut() {
        if matches!(round.state, RoundState::Open | RoundState::Closed) && round.paused_at.is_none()
        {
            round.paused_at = Some(now);
        }
    }

    emit!(LotteryStateChanged {
        lottery: lottery.key(),
        previous_state: prev as u8,
        new_state: lottery.state as u8,
        at: now,
    });
    Ok(())
}

pub fn resume_lottery_handler(ctx: Context<LotteryWithMaybeRound>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let lottery = &mut ctx.accounts.lottery;

    require!(
        lottery.state == LotteryState::Paused,
        LotteryError::ResumeRequiresPaused
    );

    let prev = lottery.state;
    lottery.state = LotteryState::Active;

    if let Some(round) = ctx.accounts.round.as_mut() {
        if let Some(started) = round.paused_at.take() {
            let delta = now.saturating_sub(started);
            round.paused_total_seconds = round
                .paused_total_seconds
                .checked_add(delta)
                .ok_or(LotteryError::MathOverflow)?;
        }
    }

    emit!(LotteryStateChanged {
        lottery: lottery.key(),
        previous_state: prev as u8,
        new_state: lottery.state as u8,
        at: now,
    });
    Ok(())
}

pub fn begin_disable_lottery_handler(ctx: Context<LotteryStateOnly>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let lottery = &mut ctx.accounts.lottery;

    require!(
        matches!(lottery.state, LotteryState::Active | LotteryState::Paused),
        LotteryError::LotteryNotActive
    );
    let prev = lottery.state;
    lottery.state = LotteryState::PendingDisable;

    emit!(LotteryStateChanged {
        lottery: lottery.key(),
        previous_state: prev as u8,
        new_state: lottery.state as u8,
        at: now,
    });
    Ok(())
}

/// Transitions `PendingDisable -> Disabled`. Caller must ensure no in-flight
/// round exists; we enforce this by requiring the optional round account to
/// be either `None` or in a terminal state.
pub fn finalize_disable_lottery_handler(ctx: Context<LotteryWithMaybeRound>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let lottery = &mut ctx.accounts.lottery;

    require!(
        lottery.state == LotteryState::PendingDisable,
        LotteryError::LotteryNotPendingDisable
    );

    if let Some(round) = ctx.accounts.round.as_ref() {
        require!(
            round.state == RoundState::Resolved,
            LotteryError::OpenRoundPreventsClose
        );
    }

    let prev = lottery.state;
    lottery.state = LotteryState::Disabled;

    emit!(LotteryStateChanged {
        lottery: lottery.key(),
        previous_state: prev as u8,
        new_state: lottery.state as u8,
        at: now,
    });
    Ok(())
}

pub fn close_lottery_handler(_ctx: Context<CloseLottery>) -> Result<()> {
    // Anchor's `close = admin` attribute moves rent automatically.
    Ok(())
}
