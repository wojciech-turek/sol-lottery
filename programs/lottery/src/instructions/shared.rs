//! Shared helpers used by multiple resolve instructions.
//!
//! `try_atomic_rollover` is the meat of the auto-rollover feature: when a
//! resolve handler finishes paying out the splits, it can optionally open
//! the next round in the same transaction by manually creating the
//! `Round` and `TicketShard` PDAs via system_program CPI.
//!
//! We do this by hand (rather than via Anchor's `init` constraint) because
//! `next_shard`'s seeds reference `next_round`'s pubkey — Anchor's macro
//! can't express that cross-account seed for *optional* accounts.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke_signed, system_instruction};

use crate::errors::LotteryError;
use crate::events::RoundOpened;
use crate::state::{Lottery, LotteryState, Round, RoundState, TicketShard};

/// Attempts an atomic rollover. Silently no-ops when:
/// - `lottery.auto_rollover == false`, or
/// - `lottery.state != Active` (paused / pending-disable / disabled), or
/// - the caller did not pass `next_round` and `next_shard` accounts.
///
/// When triggered, allocates `next_round` (the round at `current + 1`) and
/// shard 0 for it, snapshots the lottery's config, and bumps
/// `lottery.current_round_index`.
pub(crate) fn try_atomic_rollover<'info>(
    lottery: &mut Account<'info, Lottery>,
    next_round_opt: &Option<UncheckedAccount<'info>>,
    next_shard_opt: &Option<UncheckedAccount<'info>>,
    payer: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
) -> Result<()> {
    if !lottery.auto_rollover || lottery.state != LotteryState::Active {
        return Ok(());
    }
    let (next_round, next_shard) = match (next_round_opt, next_shard_opt) {
        (Some(r), Some(s)) => (r, s),
        _ => return Ok(()),
    };

    let now = Clock::get()?.unix_timestamp;
    let lottery_key = lottery.key();
    let next_index = lottery
        .current_round_index
        .checked_add(1)
        .ok_or(LotteryError::MathOverflow)?;

    // Validate next_round PDA.
    let next_index_bytes = next_index.to_le_bytes();
    let (expected_round_pda, round_bump) = Pubkey::find_program_address(
        &[Round::SEED, lottery_key.as_ref(), &next_index_bytes],
        &crate::ID,
    );
    require_keys_eq!(
        next_round.key(),
        expected_round_pda,
        LotteryError::WrongTicketShard
    );

    // Validate next_shard PDA (shard_index = 0 for the new round).
    let zero_shard_index = 0u32.to_le_bytes();
    let (expected_shard_pda, shard_bump) = Pubkey::find_program_address(
        &[TicketShard::SEED, expected_round_pda.as_ref(), &zero_shard_index],
        &crate::ID,
    );
    require_keys_eq!(
        next_shard.key(),
        expected_shard_pda,
        LotteryError::WrongTicketShard
    );

    // Allocate next_round via system_program::create_account.
    let round_space = 8 + Round::INIT_SPACE;
    let round_bump_bytes = [round_bump];
    create_program_account(
        &payer,
        &next_round.to_account_info(),
        &system_program,
        round_space,
        &[
            Round::SEED,
            lottery_key.as_ref(),
            &next_index_bytes,
            &round_bump_bytes,
        ],
    )?;

    // Snapshot the lottery's current config into the new Round.
    let new_round = Round {
        lottery: lottery_key,
        index: next_index,
        state: RoundState::Open,
        started_at: now,
        duration_seconds: lottery.round_duration_seconds,
        ticket_price_lamports: lottery.ticket_price_lamports,
        splits: lottery.splits.clone(),
        paused_at: None,
        paused_total_seconds: 0,
        tickets_sold: 0,
        donated_lamports: 0,
        current_shard: 0,
        max_shard: 0,
        winner: None,
        vrf_request: None,
        bump: round_bump,
    };
    {
        let mut data = next_round.try_borrow_mut_data()?;
        data[..8].copy_from_slice(&Round::DISCRIMINATOR);
        let mut writer: &mut [u8] = &mut data[8..];
        AnchorSerialize::serialize(&new_round, &mut writer)?;
    }

    // Allocate next_shard.
    let shard_bump_bytes = [shard_bump];
    create_program_account(
        &payer,
        &next_shard.to_account_info(),
        &system_program,
        TicketShard::HEADER_SIZE,
        &[
            TicketShard::SEED,
            expected_round_pda.as_ref(),
            &zero_shard_index,
            &shard_bump_bytes,
        ],
    )?;

    let new_shard = TicketShard {
        round: expected_round_pda,
        shard_index: 0,
        len: 0,
        buyers: vec![],
        bump: shard_bump,
    };
    {
        let mut data = next_shard.try_borrow_mut_data()?;
        data[..8].copy_from_slice(&TicketShard::DISCRIMINATOR);
        let mut writer: &mut [u8] = &mut data[8..];
        AnchorSerialize::serialize(&new_shard, &mut writer)?;
    }

    lottery.current_round_index = next_index;

    let effective_end = now
        .checked_add(lottery.round_duration_seconds)
        .ok_or(LotteryError::MathOverflow)?;
    emit!(RoundOpened {
        lottery: lottery_key,
        round: expected_round_pda,
        index: next_index,
        started_at: now,
        effective_end,
        ticket_price_lamports: lottery.ticket_price_lamports,
    });

    Ok(())
}

fn create_program_account<'info>(
    payer: &AccountInfo<'info>,
    new_account: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    space: usize,
    signer_seeds: &[&[u8]],
) -> Result<()> {
    let lamports = Rent::get()?.minimum_balance(space);
    let ix = system_instruction::create_account(
        payer.key,
        new_account.key,
        lamports,
        space as u64,
        &crate::ID,
    );
    invoke_signed(
        &ix,
        &[payer.clone(), new_account.clone(), system_program.clone()],
        &[signer_seeds],
    )?;
    Ok(())
}
