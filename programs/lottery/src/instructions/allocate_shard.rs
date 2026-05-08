//! Allocates the next ticket shard for a round whose current shard is full.
//!
//! Anyone can call this — there's no admin gate because the work it does
//! (init a fresh shard PDA, advance `round.current_shard`) is purely
//! mechanical and the caller pays the rent.

use anchor_lang::prelude::*;

use crate::errors::LotteryError;
use crate::state::{Lottery, Round, TicketShard};

#[derive(Accounts)]
#[instruction(new_shard_index: u32)]
pub struct AllocateShard<'info> {
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

    /// The shard that's currently active (and full).
    #[account(
        seeds = [TicketShard::SEED, round.key().as_ref(), &round.current_shard.to_le_bytes()],
        bump = previous_shard.bump,
        constraint = previous_shard.round == round.key() @ LotteryError::WrongTicketShard,
    )]
    pub previous_shard: Account<'info, TicketShard>,

    /// The new shard being allocated; must equal `round.current_shard + 1`.
    #[account(
        init,
        payer = payer,
        space = TicketShard::HEADER_SIZE,
        seeds = [TicketShard::SEED, round.key().as_ref(), &new_shard_index.to_le_bytes()],
        bump,
    )]
    pub new_shard: Account<'info, TicketShard>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn allocate_shard_handler(ctx: Context<AllocateShard>, new_shard_index: u32) -> Result<()> {
    let round = &mut ctx.accounts.round;
    let prev = &ctx.accounts.previous_shard;

    // The previous shard is "full" once it has reached CAPACITY entries.
    require!(
        prev.len >= TicketShard::CAPACITY,
        LotteryError::TicketShardNotFull
    );
    require!(
        new_shard_index
            == round
                .current_shard
                .checked_add(1)
                .ok_or(LotteryError::MathOverflow)?,
        LotteryError::WrongTicketShard
    );

    let new_shard = &mut ctx.accounts.new_shard;
    new_shard.round = round.key();
    new_shard.shard_index = new_shard_index;
    new_shard.len = 0;
    new_shard.bump = ctx.bumps.new_shard;

    round.current_shard = new_shard_index;
    round.max_shard = new_shard_index;
    Ok(())
}
