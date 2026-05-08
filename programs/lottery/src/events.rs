//! On-chain events emitted by the program.

use anchor_lang::prelude::*;

#[event]
pub struct LotteryCreated {
    pub lottery: Pubkey,
    pub id: u64,
    pub admin: Pubkey,
    pub name: [u8; 32],
    pub created_at: i64,
}

#[event]
pub struct LotteryStateChanged {
    pub lottery: Pubkey,
    pub previous_state: u8,
    pub new_state: u8,
    pub at: i64,
}

#[event]
pub struct LotteryConfigUpdated {
    pub lottery: Pubkey,
    /// ASCII tag for which field changed: "price", "duration", "splits".
    pub field: [u8; 16],
    pub at: i64,
}

#[event]
pub struct RoundOpened {
    pub lottery: Pubkey,
    pub round: Pubkey,
    pub index: u64,
    pub started_at: i64,
    pub effective_end: i64,
    pub ticket_price_lamports: u64,
}

#[event]
pub struct TicketBought {
    pub round: Pubkey,
    pub buyer: Pubkey,
    pub quantity: u64,
    pub total_paid_lamports: u64,
    /// Cumulative ticket count for the round after this purchase.
    pub running_total: u64,
    pub at: i64,
}

#[event]
pub struct ResolutionRequested {
    pub round: Pubkey,
    pub vrf_request: Pubkey,
    pub by: Pubkey,
    pub at: i64,
}

#[event]
pub struct RoundResolved {
    pub lottery: Pubkey,
    pub round: Pubkey,
    /// `None` for empty rounds (zero tickets).
    pub winner: Option<Pubkey>,
    /// `None` for empty rounds.
    pub winning_ticket_index: Option<u64>,
    /// Lamports paid to the winner (0 if no pool split or empty round).
    pub pool_amount_lamports: u64,
    /// Sum of every transfer made by `resolve_round`.
    pub total_distributed_lamports: u64,
    pub at: i64,
}

#[event]
pub struct ShardClosed {
    pub round: Pubkey,
    pub shard_index: u32,
    pub rent_returned_to: Pubkey,
    pub at: i64,
}

#[event]
pub struct AdminTransferProposed {
    pub current_admin: Pubkey,
    pub pending_admin: Pubkey,
    pub at: i64,
}

#[event]
pub struct AdminTransferAccepted {
    pub previous_admin: Pubkey,
    pub new_admin: Pubkey,
    pub at: i64,
}
