//! ORAO-backed resolution: request randomness via CPI into the ORAO VRF
//! program. This is the production path for public resolution.
//!
//! The seed we hand to ORAO is the Round PDA's bytes — unique per round, and
//! never zero (the system program rejects zero seeds). After fulfillment by
//! ORAO oracles, `consume_orao_resolution` reads the randomness directly out
//! of ORAO's randomness account.

use anchor_lang::prelude::*;
use orao_solana_vrf::cpi::accounts::RequestV2;
use orao_solana_vrf::program::OraoVrf;
use orao_solana_vrf::state::NetworkState;
use orao_solana_vrf::{CONFIG_ACCOUNT_SEED, RANDOMNESS_ACCOUNT_SEED};

use crate::errors::LotteryError;
use crate::events::ResolutionRequested;
use crate::state::{GlobalConfig, Lottery, LotteryState, Round, RoundState};

#[derive(Accounts)]
pub struct RequestOraoResolution<'info> {
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

    /// ORAO's randomness account, derived from the seed (= round pubkey).
    /// CHECK: validated by ORAO program; this CPI will create it.
    #[account(
        mut,
        seeds = [RANDOMNESS_ACCOUNT_SEED, round.key().as_ref()],
        bump,
        seeds::program = orao_solana_vrf::ID,
    )]
    pub vrf_request: AccountInfo<'info>,

    /// CHECK: ORAO treasury, must match `vrf_network_state.config.treasury`.
    #[account(mut)]
    pub vrf_treasury: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [CONFIG_ACCOUNT_SEED],
        bump,
        seeds::program = orao_solana_vrf::ID,
    )]
    pub vrf_network_state: Account<'info, NetworkState>,

    pub vrf_program: Program<'info, OraoVrf>,

    #[account(mut)]
    pub caller: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn request_orao_resolution_handler(ctx: Context<RequestOraoResolution>) -> Result<()> {
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

    // Seed ORAO with the round PDA bytes — guaranteed unique and non-zero.
    let seed = round.key().to_bytes();

    let cpi_accounts = RequestV2 {
        payer: ctx.accounts.caller.to_account_info(),
        network_state: ctx.accounts.vrf_network_state.to_account_info(),
        treasury: ctx.accounts.vrf_treasury.to_account_info(),
        request: ctx.accounts.vrf_request.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
    };
    orao_solana_vrf::cpi::request_v2(
        CpiContext::new(ctx.accounts.vrf_program.to_account_info(), cpi_accounts),
        seed,
    )?;

    round.state = RoundState::AwaitingVrf;
    round.vrf_request = Some(ctx.accounts.vrf_request.key());

    emit!(ResolutionRequested {
        round: round.key(),
        vrf_request: ctx.accounts.vrf_request.key(),
        by: caller,
        at: now,
    });
    Ok(())
}
