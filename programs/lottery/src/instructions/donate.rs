//! Top-up the round's prize pool. Anyone can donate SOL to a round that
//! still accepts funds (Open or Closed, not yet Resolved). The donated
//! lamports flow onto the Round PDA itself (just like ticket payments) and
//! are paid out to the **winner** at resolve time — they bypass the
//! per-destination split percentages.
//!
//! Physical-prize lotteries (no `is_pool` split) reject donations: there's
//! no winner-pool slot to top up.

use anchor_lang::prelude::*;
use anchor_lang::system_program;

use crate::errors::LotteryError;
use crate::events::DonationReceived;
use crate::state::{Lottery, Round, RoundState};

#[derive(Accounts)]
pub struct DonateToRound<'info> {
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

    #[account(mut)]
    pub donor: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn donate_to_round_handler(
    ctx: Context<DonateToRound>,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, LotteryError::QuantityZero);

    let now = Clock::get()?.unix_timestamp;
    let donor_key = ctx.accounts.donor.key();
    let round = &mut ctx.accounts.round;

    require!(
        matches!(round.state, RoundState::Open | RoundState::Closed),
        LotteryError::DonationRoundNotAcceptingFunds
    );
    require!(
        round.splits.iter().any(|s| s.is_pool),
        LotteryError::DonationRequiresPoolSplit
    );

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.donor.to_account_info(),
                to: round.to_account_info(),
            },
        ),
        amount,
    )?;

    round.donated_lamports = round
        .donated_lamports
        .checked_add(amount)
        .ok_or(LotteryError::MathOverflow)?;

    emit!(DonationReceived {
        round: round.key(),
        donor: donor_key,
        amount_lamports: amount,
        running_total_lamports: round.donated_lamports,
        at: now,
    });
    Ok(())
}
