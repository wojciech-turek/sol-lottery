use anchor_lang::prelude::*;

/// One VRF request bridging `request_resolution` to `vrf_callback`.
///
/// The request lifecycle:
///   1. `request_resolution` creates this PDA, sets `seed`, leaves
///      `fulfilled = false`.
///   2. ORAO's fulfillment quorum invokes `vrf_callback` (signed by ORAO's
///      callback authority); we write the 64-byte randomness and flip
///      `fulfilled = true`.
///   3. The same callback (or `force_resolve` after a timeout) reads
///      `randomness` and resolves the round.
///
/// **PDA seeds:** `[b"vrf", round.key()]`
/// **Created by:** `request_resolution`.
/// **Rent payer:** the resolver (admin or cron caller).
#[account]
#[derive(InitSpace)]
pub struct VrfRequest {
    /// The round this request fulfills.
    pub round: Pubkey,
    /// Seed sent to ORAO. Must be unique per request to avoid collisions
    /// (we use the round's pubkey + slot at request time).
    pub seed: [u8; 32],
    /// Set to true once `vrf_callback` writes the randomness.
    pub fulfilled: bool,
    /// 64-byte VRF output. Only the first 8 bytes are used to derive the
    /// winner index; the rest is stored for auditability.
    pub randomness: [u8; 64],
    /// Unix-seconds time of the request, used by `force_resolve` to enforce
    /// the 1-hour timeout.
    pub requested_at: i64,
    pub bump: u8,
}

impl VrfRequest {
    pub const SEED: &'static [u8] = b"vrf";
}
