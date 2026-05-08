use anchor_lang::prelude::*;

/// One page of the round's ticket book.
///
/// We shard tickets across multiple PDAs because:
/// 1. Solana account allocation is bounded per instruction.
/// 2. Capping shard size simplifies error recovery and reasoning about gas.
///
/// **PDA seeds:** `[b"shard", round.key(), shard_index.to_le_bytes()]`
/// **Created by:** the first `buy_tickets` that needs a fresh shard.
/// **Rent payer:** that buyer.
///
/// Drawing math:
///   `winner_index = randomness % round.tickets_sold`
///   `shard_index  = winner_index / CAPACITY`
///   `offset       = winner_index % CAPACITY`
/// → read `shard_index`'s `buyers[offset]`.
#[account]
#[derive(InitSpace)]
pub struct TicketShard {
    /// The round this shard belongs to.
    pub round: Pubkey,
    /// 0-based index of this shard within the round.
    pub shard_index: u32,
    /// Number of tickets currently stored. Always ≤ `CAPACITY`.
    pub len: u32,
    /// Buyers, indexed by ticket number within the shard. Pre-allocated to
    /// `CAPACITY` so individual buys never have to realloc.
    #[max_len(8192)]
    pub buyers: Vec<Pubkey>,
    pub bump: u8,
}

impl TicketShard {
    pub const SEED: &'static [u8] = b"shard";
    /// Maximum number of ticket entries per shard.
    pub const CAPACITY: u32 = 8192;
    /// Account size at creation: header only, no buyers preallocated.
    /// Lays out as: 8 (Anchor disc) + 32 (round) + 4 (shard_index) +
    /// 4 (len) + 4 (Vec<Pubkey> length prefix, zero entries) + 1 (bump).
    pub const HEADER_SIZE: usize = 8 + 32 + 4 + 4 + 4 + 1;
    /// Per-instruction cap on tickets bought. We pick 128 (= 4 KB of realloc)
    /// rather than the absolute 320-ticket realloc ceiling so we leave heap
    /// headroom for Borsh (de)serialization inside the BPF VM's small heap.
    /// Buyers wanting more split into multiple transactions.
    pub const MAX_BUYERS_PER_CALL: u64 = 128;
}
