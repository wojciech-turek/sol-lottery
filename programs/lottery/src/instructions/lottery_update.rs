//! Admin updates to a lottery's mutable config.
//!
//! All three updates affect only the **next** round opened. The current
//! round (if any) keeps its snapshotted price/duration/splits — this
//! protects buyers who already paid under the old terms.

use anchor_lang::prelude::*;

use crate::errors::LotteryError;
use crate::events::LotteryConfigUpdated;
use crate::state::{GlobalConfig, Lottery, PrizeKind, Split};

/// Common Accounts struct shared by every `update_*` handler. We keep it
/// minimal — the lottery PDA + the admin signer + the global config (to
/// authorize `admin`).
#[derive(Accounts)]
pub struct UpdateLottery<'info> {
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

pub fn update_price_handler(ctx: Context<UpdateLottery>, new_price: u64) -> Result<()> {
    require!(new_price > 0, LotteryError::PriceMustBePositive);
    let lottery = &mut ctx.accounts.lottery;
    lottery.ticket_price_lamports = new_price;
    emit_field_changed(lottery.key(), b"price")?;
    Ok(())
}

pub fn update_duration_handler(
    ctx: Context<UpdateLottery>,
    new_duration_seconds: i64,
) -> Result<()> {
    require!(
        new_duration_seconds > 0,
        LotteryError::DurationMustBePositive
    );
    let lottery = &mut ctx.accounts.lottery;
    lottery.round_duration_seconds = new_duration_seconds;
    emit_field_changed(lottery.key(), b"duration")?;
    Ok(())
}

pub fn update_splits_handler(ctx: Context<UpdateLottery>, new_splits: Vec<Split>) -> Result<()> {
    let prize_kind: PrizeKind = ctx.accounts.lottery.prize_kind;
    Split::validate_collection(&new_splits, prize_kind)?;
    let lottery = &mut ctx.accounts.lottery;
    lottery.splits = new_splits;
    emit_field_changed(lottery.key(), b"splits")?;
    Ok(())
}

fn emit_field_changed(lottery: Pubkey, field: &[u8]) -> Result<()> {
    let mut tag = [0u8; 16];
    let n = field.len().min(16);
    tag[..n].copy_from_slice(&field[..n]);
    emit!(LotteryConfigUpdated {
        lottery,
        field: tag,
        at: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
