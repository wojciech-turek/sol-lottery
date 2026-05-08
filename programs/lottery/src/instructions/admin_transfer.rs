//! Two-step admin handover: `propose_admin` then `accept_admin`.
//!
//! We use a two-step flow so a typo in the new admin's pubkey can't brick the
//! program — the new admin must actively sign to take over.

use anchor_lang::prelude::*;

use crate::errors::LotteryError;
use crate::events::{AdminTransferAccepted, AdminTransferProposed};
use crate::state::GlobalConfig;

#[derive(Accounts)]
pub struct ProposeAdmin<'info> {
    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump = global_config.bump,
        has_one = admin @ LotteryError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    pub admin: Signer<'info>,
}

pub fn propose_admin_handler(ctx: Context<ProposeAdmin>, new_admin: Pubkey) -> Result<()> {
    let cfg = &mut ctx.accounts.global_config;
    cfg.pending_admin = Some(new_admin);
    emit!(AdminTransferProposed {
        current_admin: cfg.admin,
        pending_admin: new_admin,
        at: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct AcceptAdmin<'info> {
    #[account(
        mut,
        seeds = [GlobalConfig::SEED],
        bump = global_config.bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    /// The pubkey proposed in `propose_admin`, signing to confirm.
    pub new_admin: Signer<'info>,
}

pub fn accept_admin_handler(ctx: Context<AcceptAdmin>) -> Result<()> {
    let cfg = &mut ctx.accounts.global_config;
    let pending = cfg.pending_admin.ok_or(LotteryError::NoPendingAdmin)?;
    require_keys_eq!(
        pending,
        ctx.accounts.new_admin.key(),
        LotteryError::NotPendingAdmin
    );
    let previous = cfg.admin;
    cfg.admin = ctx.accounts.new_admin.key();
    cfg.pending_admin = None;
    emit!(AdminTransferAccepted {
        previous_admin: previous,
        new_admin: cfg.admin,
        at: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
