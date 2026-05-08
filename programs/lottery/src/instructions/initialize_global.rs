use anchor_lang::prelude::*;

use crate::state::GlobalConfig;

/// One-time bootstrap: creates the singleton `GlobalConfig` and assigns
/// the signer as the initial admin.
///
/// **Accounts**
/// * `global_config` *(init, PDA `[b"config"]`)* — the singleton.
/// * `admin` *(signer, payer)* — pays rent; becomes the admin.
/// * `system_program`.
///
/// **Args**
/// * `vrf_program` — ORAO program id for this cluster.
/// * `vrf_treasury` — ORAO treasury (paid for fulfillment fees).
///
/// **Errors:** none beyond Anchor's init checks.
#[derive(Accounts)]
pub struct InitializeGlobal<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + GlobalConfig::INIT_SPACE,
        seeds = [GlobalConfig::SEED],
        bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_global_handler(
    ctx: Context<InitializeGlobal>,
    vrf_program: Pubkey,
    vrf_treasury: Pubkey,
) -> Result<()> {
    let cfg = &mut ctx.accounts.global_config;
    cfg.admin = ctx.accounts.admin.key();
    cfg.pending_admin = None;
    cfg.vrf_program = vrf_program;
    cfg.vrf_treasury = vrf_treasury;
    cfg.next_lottery_id = 1;
    cfg.bump = ctx.bumps.global_config;
    Ok(())
}
