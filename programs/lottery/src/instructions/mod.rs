//! All instruction handlers, grouped by lifecycle stage.

pub mod admin_transfer;
pub mod allocate_shard;
pub mod buy_tickets;
pub mod close_shard;
pub mod consume_orao;
pub mod consume_resolution;
pub mod fulfill_resolution;
pub mod initialize_global;
pub mod lottery_create;
pub mod lottery_lifecycle;
pub mod lottery_update;
pub mod request_orao;
pub mod request_resolution;
pub mod resolve_empty;
pub mod resolve_round;
pub mod round_open;

pub use admin_transfer::*;
pub use allocate_shard::*;
pub use buy_tickets::*;
pub use close_shard::*;
pub use consume_orao::*;
pub use consume_resolution::*;
pub use fulfill_resolution::*;
pub use initialize_global::*;
pub use lottery_create::*;
pub use lottery_lifecycle::*;
pub use lottery_update::*;
pub use request_orao::*;
pub use request_resolution::*;
pub use resolve_empty::*;
pub use resolve_round::*;
pub use round_open::*;
