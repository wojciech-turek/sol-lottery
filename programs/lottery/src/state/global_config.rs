use anchor_lang::prelude::*;

/// Singleton account holding the program's admin authority and VRF wiring.
///
/// **PDA seeds:** `[b"config"]`
/// **Created by:** `initialize_global` (once per deployment).
/// **Rent payer:** the deployer (becomes the initial admin).
#[account]
#[derive(InitSpace)]
pub struct GlobalConfig {
    /// The wallet authorized to administer every lottery (create, pause,
    /// disable, etc.). Single-sig today; we assume the user controls it via
    /// a hardware wallet or multisig at the wallet layer.
    pub admin: Pubkey,

    /// Two-step admin handover: when the current admin proposes a new admin,
    /// it lands here. The new admin must call `accept_admin` to take over.
    /// `None` means no transfer in flight.
    pub pending_admin: Option<Pubkey>,

    /// ORAO VRF program id. Varies between localnet/devnet/mainnet, so we
    /// store it on-chain rather than hardcoding it.
    pub vrf_program: Pubkey,

    /// ORAO treasury account used to pay fulfillment fees.
    pub vrf_treasury: Pubkey,

    /// Monotonically increasing counter; the next created Lottery uses this
    /// as its `id` (and as a seed for its PDA).
    pub next_lottery_id: u64,

    /// PDA bump for `[b"config"]`. Stored to avoid recomputing on every CPI.
    pub bump: u8,
}

impl GlobalConfig {
    pub const SEED: &'static [u8] = b"config";
}
