use anchor_lang::prelude::*;

use crate::errors::LotteryError;

/// Lifecycle of a lottery configuration.
///
/// ```text
///   Active  <->  Paused
///       \         /
///        v       v
///     PendingDisable  --(current round resolves)-->  Disabled
/// ```
///
/// * **Active**: rounds can run, tickets sell.
/// * **Paused**: no sales; the in-flight round's timer freezes.
/// * **PendingDisable**: in-flight round will finish; no new round opens after.
/// * **Disabled**: terminal. The Lottery PDA may be closed by the admin to
///   reclaim rent.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum LotteryState {
    Active,
    Paused,
    PendingDisable,
    Disabled,
}

/// What kind of prize a lottery awards.
///
/// * **Sol** — winner is paid SOL out of the round's pool split.
/// * **Physical** — off-chain prize delivery. The contract still picks and
///   records a winner pubkey, but pays them no SOL. The full ticket revenue
///   is split among the configured (non-pool) destinations.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum PrizeKind {
    Sol,
    Physical,
}

/// One slice of ticket-sale revenue.
///
/// Per-collection rules (validated on `create_lottery` / `update_splits`):
/// * 1 ≤ `splits.len()` ≤ 8.
/// * `sum(bps) == 10_000`  (100.00%).
/// * Each `bps` is a multiple of 100 (1% increments only).
/// * `PrizeKind::Sol` ⇒ exactly one Split has `is_pool == true`.
/// * `PrizeKind::Physical` ⇒ no Split has `is_pool == true`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub struct Split {
    /// Human label, ASCII, zero-padded. Used by UIs; not interpreted on-chain.
    pub label: [u8; 16],

    /// Destination wallet for this slice. Ignored for `is_pool` splits — the
    /// pool is paid to the round's winner (computed at resolve time).
    pub destination: Pubkey,

    /// Basis points of the round's gross sales. `100 bps == 1%`.
    /// Constrained to multiples of 100.
    pub bps: u16,

    /// Marks the prize-pool slice. At most one per Lottery.
    pub is_pool: bool,
}

/// A configurable lottery. One Lottery has at most one active Round at a time.
///
/// **PDA seeds:** `[b"lottery", id.to_le_bytes()]`
/// **Created by:** `create_lottery` (admin).
/// **Rent payer:** admin. Reclaimed on `close_lottery` once Disabled.
#[account]
#[derive(InitSpace)]
pub struct Lottery {
    /// Stable id, assigned from `GlobalConfig.next_lottery_id`. Used as a
    /// PDA seed so we don't need a global lookup table.
    pub id: u64,

    /// Human label, ASCII, zero-padded.
    pub name: [u8; 32],

    pub state: LotteryState,
    pub prize_kind: PrizeKind,

    /// Price per ticket. Editable any time; the change applies to the NEXT
    /// round only (each Round snapshots its price on open).
    pub ticket_price_lamports: u64,

    /// Round duration in seconds (e.g. 86_400 for 24h). Same edit semantics.
    pub round_duration_seconds: i64,

    /// If true, `resolve_round` immediately opens round N+1.
    pub auto_rollover: bool,

    /// Revenue splits for new rounds. Edited via `update_splits`. The current
    /// round's snapshot is what governs payouts for that round.
    #[max_len(8)]
    pub splits: Vec<Split>,

    /// `0` until the first `open_round`; thereafter the index of the
    /// most-recently-opened round.
    pub current_round_index: u64,

    /// Lifetime counter incremented in `resolve_round`.
    pub total_rounds_resolved: u64,

    /// Lifetime counter incremented on every successful `buy_tickets`.
    pub total_tickets_sold: u64,

    pub created_at: i64,
    pub bump: u8,
}

impl Lottery {
    pub const SEED: &'static [u8] = b"lottery";
}

impl Split {
    /// Validates a `Vec<Split>` collection against the rules documented above.
    /// Called from `create_lottery` and `update_splits`.
    pub fn validate_collection(splits: &[Split], prize_kind: PrizeKind) -> Result<()> {
        require!(
            (1..=8).contains(&splits.len()),
            LotteryError::SplitsCountOutOfRange
        );
        let mut sum: u32 = 0;
        let mut pool_count: u8 = 0;
        for s in splits.iter() {
            require!(s.bps % 100 == 0, LotteryError::BpsNotMultipleOf100);
            sum = sum
                .checked_add(s.bps as u32)
                .ok_or(LotteryError::MathOverflow)?;
            if s.is_pool {
                pool_count = pool_count.saturating_add(1);
            }
        }
        require!(sum == 10_000, LotteryError::SplitsMustSumTo100Percent);
        match prize_kind {
            PrizeKind::Sol => {
                require!(pool_count == 1, LotteryError::MissingPoolSplitForSolPrize);
            }
            PrizeKind::Physical => {
                require!(
                    pool_count == 0,
                    LotteryError::UnexpectedPoolSplitForPhysicalPrize
                );
            }
        }
        Ok(())
    }
}
