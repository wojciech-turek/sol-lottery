//! Public step 2 of resolution: an authorized fulfiller writes the 64-byte
//! randomness onto the VrfRequest. Callable by the program admin (which is
//! how Phase 5b runs); Phase 5c will additionally accept the ORAO callback
//! authority by relaxing the `has_one = admin` constraint to a custom check.

use anchor_lang::prelude::*;

use crate::errors::LotteryError;
use crate::state::{GlobalConfig, VrfRequest};

#[derive(Accounts)]
pub struct FulfillResolution<'info> {
    #[account(
        seeds = [GlobalConfig::SEED],
        bump = global_config.bump,
        has_one = admin @ LotteryError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [VrfRequest::SEED, vrf_request.round.as_ref()],
        bump = vrf_request.bump,
    )]
    pub vrf_request: Account<'info, VrfRequest>,

    pub admin: Signer<'info>,
}

pub fn fulfill_resolution_handler(
    ctx: Context<FulfillResolution>,
    randomness: [u8; 64],
) -> Result<()> {
    let req = &mut ctx.accounts.vrf_request;
    require!(!req.fulfilled, LotteryError::VrfAlreadyRequested);
    req.randomness = randomness;
    req.fulfilled = true;
    Ok(())
}
