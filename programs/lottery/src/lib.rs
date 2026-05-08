//! # sol-lottery program
//!
//! On-chain lottery for Solana, written with Anchor 0.32.
//!
//! ## A short Rust + Anchor primer (because the author is not a Rust dev)
//!
//! - **Program** — what other ecosystems call a "smart contract". A single
//!   compiled binary that lives on-chain at a fixed address (the `program id`).
//! - **Account** — a chunk of on-chain storage. Every piece of mutable state
//!   (balances, configs, rounds, tickets) lives in an Account. Accounts are
//!   owned by exactly one program; only that program can mutate them.
//! - **PDA (Program-Derived Address)** — an address derived deterministically
//!   from a tuple of "seeds" plus the program id. Used as account addresses
//!   when we want the program (not a user) to be the only signer for that
//!   account. Seeds are how we name things: e.g. `["lottery", id]`.
//! - **Instruction** — a function on the program that mutates accounts. Each
//!   instruction declares which accounts it reads/writes via an `Accounts`
//!   struct (Anchor takes care of the boilerplate).
//! - **CPI (Cross-Program Invocation)** — calling another program from within
//!   our program. We use CPI to talk to ORAO VRF and to the system program
//!   (for transferring SOL).
//! - **Lamport** — `1 SOL == 1_000_000_000 lamports`. All on-chain SOL math
//!   is in lamports.
//! - **Discriminator** — Anchor stores an 8-byte type tag at the start of
//!   every account so the runtime can tell `Lottery` from `Round` etc.
//!
//! ## Tickets are non-refundable
//!
//! There is no cancel/refund path. Once SOL flows into a round it stays
//! there until the round is resolved and the splits route it out. The admin
//! can always force-resolve via `resolve_round(seed)` so funds never get
//! stranded.

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

pub use instructions::*;
use state::{PrizeKind, Split};

declare_id!("HQ86E1qrGs7axPuNZKHsc23MUhL9SFKdygkNM8K95uop");

#[program]
pub mod lottery {
    use super::*;

    // --- One-time bootstrap ---

    pub fn initialize_global(
        ctx: Context<InitializeGlobal>,
        vrf_program: Pubkey,
        vrf_treasury: Pubkey,
    ) -> Result<()> {
        initialize_global_handler(ctx, vrf_program, vrf_treasury)
    }

    // --- Admin handover ---

    pub fn propose_admin(ctx: Context<ProposeAdmin>, new_admin: Pubkey) -> Result<()> {
        propose_admin_handler(ctx, new_admin)
    }

    pub fn accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
        accept_admin_handler(ctx)
    }

    // --- Lottery management ---

    pub fn create_lottery(
        ctx: Context<CreateLottery>,
        name: [u8; 32],
        duration_seconds: i64,
        ticket_price_lamports: u64,
        prize_kind: PrizeKind,
        auto_rollover: bool,
        splits: Vec<Split>,
    ) -> Result<()> {
        create_lottery_handler(
            ctx,
            name,
            duration_seconds,
            ticket_price_lamports,
            prize_kind,
            auto_rollover,
            splits,
        )
    }

    pub fn update_lottery_price(ctx: Context<UpdateLottery>, new_price: u64) -> Result<()> {
        update_price_handler(ctx, new_price)
    }

    pub fn update_lottery_duration(
        ctx: Context<UpdateLottery>,
        new_duration_seconds: i64,
    ) -> Result<()> {
        update_duration_handler(ctx, new_duration_seconds)
    }

    pub fn update_lottery_splits(
        ctx: Context<UpdateLottery>,
        new_splits: Vec<Split>,
    ) -> Result<()> {
        update_splits_handler(ctx, new_splits)
    }

    pub fn pause_lottery(ctx: Context<LotteryWithMaybeRound>) -> Result<()> {
        pause_lottery_handler(ctx)
    }

    pub fn resume_lottery(ctx: Context<LotteryWithMaybeRound>) -> Result<()> {
        resume_lottery_handler(ctx)
    }

    pub fn begin_disable_lottery(ctx: Context<LotteryStateOnly>) -> Result<()> {
        begin_disable_lottery_handler(ctx)
    }

    pub fn finalize_disable_lottery(ctx: Context<LotteryWithMaybeRound>) -> Result<()> {
        finalize_disable_lottery_handler(ctx)
    }

    pub fn close_lottery(ctx: Context<CloseLottery>) -> Result<()> {
        close_lottery_handler(ctx)
    }

    // --- Round lifecycle ---

    pub fn open_round(ctx: Context<OpenRound>, round_index: u64) -> Result<()> {
        open_round_handler(ctx, round_index)
    }

    pub fn buy_tickets(ctx: Context<BuyTickets>, quantity: u64) -> Result<()> {
        buy_tickets_handler(ctx, quantity)
    }

    pub fn allocate_shard(ctx: Context<AllocateShard>, new_shard_index: u32) -> Result<()> {
        allocate_shard_handler(ctx, new_shard_index)
    }

    pub fn close_shard(ctx: Context<CloseShard>) -> Result<()> {
        close_shard_handler(ctx)
    }

    pub fn resolve_empty_round(ctx: Context<ResolveEmptyRound>) -> Result<()> {
        resolve_empty_round_handler(ctx)
    }

    /// Admin-driven resolution. Admin supplies a 32-byte seed; the program
    /// derives the winner and distributes splits.
    pub fn resolve_round<'info>(
        ctx: Context<'_, '_, '_, 'info, ResolveRound<'info>>,
        seed: [u8; 32],
    ) -> Result<()> {
        resolve_round_handler(ctx, seed)
    }

    // --- Public 3-step resolution (cron / VRF) ---

    pub fn request_resolution(ctx: Context<RequestResolution>) -> Result<()> {
        request_resolution_handler(ctx)
    }

    pub fn fulfill_resolution(
        ctx: Context<FulfillResolution>,
        randomness: [u8; 64],
    ) -> Result<()> {
        fulfill_resolution_handler(ctx, randomness)
    }

    pub fn consume_resolution<'info>(
        ctx: Context<'_, '_, '_, 'info, ConsumeResolution<'info>>,
    ) -> Result<()> {
        consume_resolution_handler(ctx)
    }

    // --- ORAO VRF (production cron path) ---

    /// Public resolution backed by ORAO VRF. Anyone may call this once the
    /// round timer has elapsed (admin may call any time). It CPIs into the
    /// ORAO program to request verifiable randomness — ORAO oracles fulfill
    /// off-chain, then anyone calls `consume_orao_resolution` to draw.
    pub fn request_orao_resolution(ctx: Context<RequestOraoResolution>) -> Result<()> {
        request_orao_resolution_handler(ctx)
    }

    pub fn consume_orao_resolution<'info>(
        ctx: Context<'_, '_, '_, 'info, ConsumeOraoResolution<'info>>,
    ) -> Result<()> {
        consume_orao_resolution_handler(ctx)
    }
}
