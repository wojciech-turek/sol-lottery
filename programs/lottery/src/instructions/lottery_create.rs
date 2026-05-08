use anchor_lang::prelude::*;

use crate::errors::LotteryError;
use crate::events::LotteryCreated;
use crate::state::{GlobalConfig, Lottery, LotteryState, PrizeKind, Split};

/// Creates a new lottery configuration. The lottery starts `Active` with no
/// rounds; admin must call `open_round` (Phase 4) to actually start selling.
///
/// **Accounts**
/// * `global_config` *(mut)* — bumps `next_lottery_id`.
/// * `lottery` *(init, PDA `[b"lottery", id]`)* — newly created.
/// * `admin` *(signer, payer)* — must equal `global_config.admin`.
/// * `system_program`.
///
/// **Args**
/// * `name` — ASCII, zero-padded to 32 bytes.
/// * `duration_seconds` — must be > 0.
/// * `ticket_price_lamports` — must be > 0.
/// * `prize_kind` — `Sol` or `Physical`.
/// * `auto_rollover` — open the next round automatically on resolve?
/// * `splits` — see `Split` for the validation rules.
#[derive(Accounts)]
#[instruction(name: [u8; 32])]
pub struct CreateLottery<'info> {
    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump = global_config.bump,
        has_one = admin @ LotteryError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        init,
        payer = admin,
        space = 8 + Lottery::INIT_SPACE,
        seeds = [Lottery::SEED, &global_config.next_lottery_id.to_le_bytes()],
        bump,
    )]
    pub lottery: Account<'info, Lottery>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn create_lottery_handler(
    ctx: Context<CreateLottery>,
    name: [u8; 32],
    duration_seconds: i64,
    ticket_price_lamports: u64,
    prize_kind: PrizeKind,
    auto_rollover: bool,
    splits: Vec<Split>,
) -> Result<()> {
    require!(duration_seconds > 0, LotteryError::DurationMustBePositive);
    require!(ticket_price_lamports > 0, LotteryError::PriceMustBePositive);
    Split::validate_collection(&splits, prize_kind)?;

    let cfg = &mut ctx.accounts.global_config;
    let lottery = &mut ctx.accounts.lottery;
    let now = Clock::get()?.unix_timestamp;

    lottery.id = cfg.next_lottery_id;
    lottery.name = name;
    lottery.state = LotteryState::Active;
    lottery.prize_kind = prize_kind;
    lottery.ticket_price_lamports = ticket_price_lamports;
    lottery.round_duration_seconds = duration_seconds;
    lottery.auto_rollover = auto_rollover;
    lottery.splits = splits;
    lottery.current_round_index = 0;
    lottery.total_rounds_resolved = 0;
    lottery.total_tickets_sold = 0;
    lottery.created_at = now;
    lottery.bump = ctx.bumps.lottery;

    cfg.next_lottery_id = cfg
        .next_lottery_id
        .checked_add(1)
        .ok_or(LotteryError::MathOverflow)?;

    emit!(LotteryCreated {
        lottery: lottery.key(),
        id: lottery.id,
        admin: cfg.admin,
        name: lottery.name,
        created_at: now,
    });
    Ok(())
}
