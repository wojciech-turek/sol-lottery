//! All error variants returned by the lottery program.

use anchor_lang::prelude::*;

#[error_code]
pub enum LotteryError {
    // --- Splits validation ---
    #[msg("Splits must contain between 1 and 8 entries.")]
    SplitsCountOutOfRange,
    #[msg("Splits must sum to exactly 10000 basis points (100%).")]
    SplitsMustSumTo100Percent,
    #[msg("Each split bps must be a multiple of 100 (1% increments).")]
    BpsNotMultipleOf100,
    #[msg("Sol-prize lotteries must have exactly one split marked is_pool=true.")]
    MissingPoolSplitForSolPrize,
    #[msg("Physical-prize lotteries must not have any is_pool=true split.")]
    UnexpectedPoolSplitForPhysicalPrize,
    #[msg("Lottery name exceeds 32 bytes.")]
    NameTooLong,
    #[msg("Split label exceeds 16 bytes.")]
    LabelTooLong,
    #[msg("Round duration must be greater than zero.")]
    DurationMustBePositive,
    #[msg("Ticket price must be greater than zero.")]
    PriceMustBePositive,

    // --- Lottery state guards ---
    #[msg("Lottery is not in Active state.")]
    LotteryNotActive,
    #[msg("Lottery is not in PendingDisable state.")]
    LotteryNotPendingDisable,
    #[msg("Lottery is not in Disabled state.")]
    LotteryNotDisabled,
    #[msg("Cannot pause: lottery is not Active.")]
    PauseRequiresActive,
    #[msg("Cannot resume: lottery is not Paused.")]
    ResumeRequiresPaused,
    #[msg("Cannot close lottery: an open or unresolved round exists.")]
    OpenRoundPreventsClose,

    // --- Round state guards ---
    #[msg("Round is not Open.")]
    RoundNotOpen,
    #[msg("Round is not Closed; cannot request resolution yet.")]
    RoundNotClosed,
    #[msg("Round is not Resolved.")]
    RoundNotResolved,
    #[msg("Round is already resolved.")]
    RoundAlreadyResolved,
    #[msg("Round duration has not elapsed; only admin can force-resolve early.")]
    RoundStillRunning,
    #[msg("Round duration has elapsed; ticket sales closed.")]
    RoundExpired,
    #[msg("Lottery is paused; ticket sales suspended.")]
    LotteryPaused,
    #[msg("Round is already in flight; cannot open a new one.")]
    RoundAlreadyOpen,
    #[msg("Round has zero tickets; nothing to draw.")]
    RoundHasNoTickets,
    #[msg("Auto-rollover requires the previous round to be passed and Resolved.")]
    PreviousRoundNotResolved,

    // --- Ticketing ---
    #[msg("Ticket shard is full; allocate the next shard.")]
    TicketShardFull,
    #[msg("Cannot allocate the next shard until the current one is full.")]
    TicketShardNotFull,
    #[msg("Wrong ticket shard supplied for current state.")]
    WrongTicketShard,
    #[msg("Quantity must be greater than zero.")]
    QuantityZero,
    #[msg("Quantity exceeds the per-call cap (320). Split the purchase across multiple calls.")]
    QuantityTooLarge,
    #[msg("Insufficient funds to purchase that many tickets.")]
    InsufficientFunds,

    // --- Authority ---
    #[msg("Caller is not the admin.")]
    Unauthorized,
    #[msg("No pending admin to accept.")]
    NoPendingAdmin,
    #[msg("Caller is not the pending admin.")]
    NotPendingAdmin,

    // --- Resolution ---
    #[msg("VRF request not yet fulfilled.")]
    VrfNotFulfilled,
    #[msg("VRF request already in flight.")]
    VrfAlreadyRequested,
    #[msg("Wrong destination pubkey for split at this index.")]
    WrongSplitDestination,

    // --- Math ---
    #[msg("Arithmetic overflow.")]
    MathOverflow,
}
