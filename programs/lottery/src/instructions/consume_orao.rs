//! Reads the fulfilled randomness from ORAO's account and resolves the
//! round using the same `distribute_lamports` helper as `resolve_round`.

use anchor_lang::prelude::*;
use orao_solana_vrf::state::RandomnessAccountData;
use orao_solana_vrf::RANDOMNESS_ACCOUNT_SEED;

use crate::errors::LotteryError;
use crate::events::RoundResolved;
use crate::instructions::resolve_round::distribute_lamports;
use crate::state::{GlobalConfig, Lottery, LotteryState, Round, RoundState, TicketShard};

#[derive(Accounts)]
pub struct ConsumeOraoResolution<'info> {
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

    /// ORAO's randomness account; we deserialize it manually.
    /// CHECK: address verified via ORAO PDA derivation; data parsed in handler.
    #[account(
        seeds = [RANDOMNESS_ACCOUNT_SEED, round.key().as_ref()],
        bump,
        seeds::program = orao_solana_vrf::ID,
    )]
    pub vrf_request: AccountInfo<'info>,

    #[account(
        seeds = [TicketShard::SEED, round.key().as_ref(), &winner_shard.shard_index.to_le_bytes()],
        bump = winner_shard.bump,
        constraint = winner_shard.round == round.key() @ LotteryError::WrongTicketShard,
    )]
    pub winner_shard: Account<'info, TicketShard>,

    pub caller: Signer<'info>,
}

pub fn consume_orao_resolution_handler<'info>(
    ctx: Context<'_, '_, '_, 'info, ConsumeOraoResolution<'info>>,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let lottery_key = ctx.accounts.lottery.key();
    let round_key = ctx.accounts.round.key();
    let tickets_sold = ctx.accounts.round.tickets_sold;
    let ticket_price = ctx.accounts.round.ticket_price_lamports;

    require!(
        ctx.accounts.round.state == RoundState::AwaitingVrf,
        LotteryError::RoundAlreadyResolved
    );

    // Read ORAO's randomness account.
    let randomness_bytes: [u8; 64] = {
        let data = ctx.accounts.vrf_request.try_borrow_data()?;
        let account = RandomnessAccountData::try_deserialize(&mut data.as_ref())?;
        *account
            .fulfilled_randomness()
            .ok_or(LotteryError::VrfNotFulfilled)?
    };

    let mut idx_bytes = [0u8; 8];
    idx_bytes.copy_from_slice(&randomness_bytes[0..8]);
    let winner_index = u64::from_le_bytes(idx_bytes) % tickets_sold;
    let expected_shard = (winner_index / TicketShard::CAPACITY as u64) as u32;
    let offset = (winner_index % TicketShard::CAPACITY as u64) as usize;

    let shard = &ctx.accounts.winner_shard;
    require!(
        shard.shard_index == expected_shard,
        LotteryError::WrongTicketShard
    );
    require!((offset as u32) < shard.len, LotteryError::WrongTicketShard);
    let winner = shard.buyers[offset];

    let splits = ctx.accounts.round.splits.clone();
    require!(
        ctx.remaining_accounts.len() == splits.len(),
        LotteryError::WrongSplitDestination
    );

    let gross = ticket_price
        .checked_mul(tickets_sold)
        .ok_or(LotteryError::MathOverflow)?;

    let (pool_amount, total_distributed) = distribute_lamports(
        &ctx.accounts.round,
        ctx.remaining_accounts,
        &splits,
        gross,
        winner,
    )?;

    let round = &mut ctx.accounts.round;
    round.state = RoundState::Resolved;
    round.winner = Some(winner);
    round.vrf_request = None;

    let lottery = &mut ctx.accounts.lottery;
    lottery.total_rounds_resolved = lottery
        .total_rounds_resolved
        .checked_add(1)
        .ok_or(LotteryError::MathOverflow)?;
    lottery.total_tickets_sold = lottery
        .total_tickets_sold
        .checked_add(tickets_sold)
        .ok_or(LotteryError::MathOverflow)?;
    if lottery.state == LotteryState::PendingDisable {
        lottery.state = LotteryState::Disabled;
    }

    emit!(RoundResolved {
        lottery: lottery_key,
        round: round_key,
        winner: Some(winner),
        winning_ticket_index: Some(winner_index),
        pool_amount_lamports: pool_amount,
        total_distributed_lamports: total_distributed,
        at: now,
    });
    Ok(())
}
