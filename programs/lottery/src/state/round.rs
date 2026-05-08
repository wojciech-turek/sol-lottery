use anchor_lang::prelude::*;

use super::lottery::Split;

/// Round-level lifecycle.
///
/// ```text
///   Open  --(timer expires OR admin force)--> Closed
///   Closed --(request_resolution)--> AwaitingVrf
///   AwaitingVrf --(consume_resolution)--> Resolved
/// ```
/// `Resolved` is terminal. There is no cancel/refund path: ticket sales
/// are non-refundable by design.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum RoundState {
    Open,
    Closed,
    AwaitingVrf,
    Resolved,
}

/// One in-flight or historical lottery round.
///
/// **PDA seeds:** `[b"round", lottery.key(), index.to_le_bytes()]`
/// **Created by:** `open_round`.
/// **Rent payer:** the caller of `open_round` (admin always for round 1;
/// admin or anyone with `auto_rollover` enabled for subsequent rounds).
///
/// The Round PDA also holds the SOL escrow for ticket sales:
/// `buy_tickets` `system::transfer`s lamports onto this account; on resolve
/// the program drains them back out via direct lamport mutation (allowed
/// because the program owns the Round account). The rent-exempt minimum is
/// preserved across all transitions.
#[account]
#[derive(InitSpace)]
pub struct Round {
    /// The Lottery this round belongs to.
    pub lottery: Pubkey,
    /// 1-based index within its Lottery.
    pub index: u64,

    pub state: RoundState,

    /// Unix seconds at which `open_round` ran.
    pub started_at: i64,
    /// Snapshot of `Lottery.round_duration_seconds` at open time.
    pub duration_seconds: i64,
    /// Snapshot of `Lottery.ticket_price_lamports` at open time.
    pub ticket_price_lamports: u64,

    /// Snapshot of `Lottery.splits` at open time. Frozen for the life of the
    /// round so mid-round config edits never affect existing buyers.
    #[max_len(8)]
    pub splits: Vec<Split>,

    /// `Some(timestamp)` while the round is paused; `None` otherwise.
    pub paused_at: Option<i64>,
    /// Total seconds the round has been paused for, accumulated across
    /// pause/resume cycles. Used to extend `effective_end`.
    pub paused_total_seconds: i64,

    /// Lifetime ticket count for this round.
    pub tickets_sold: u64,
    /// Index of the active TicketShard PDA receiving new ticket writes.
    /// Advanced by `allocate_shard` when the previous shard fills.
    pub current_shard: u32,
    /// Highest shard index ever allocated for this round (== `current_shard`
    /// when no rollover has happened, otherwise greater). Used by
    /// `close_shard` to know how many shards exist after resolve.
    pub max_shard: u32,

    /// Set on resolution. `None` for empty rounds (zero tickets).
    pub winner: Option<Pubkey>,
    /// VRF request PDA while in `AwaitingVrf`; cleared after resolve.
    pub vrf_request: Option<Pubkey>,

    pub bump: u8,
}

impl Round {
    pub const SEED: &'static [u8] = b"round";
}
