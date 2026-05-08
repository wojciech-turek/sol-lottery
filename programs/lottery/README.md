# sol-lottery on-chain program

Anchor 0.32 Solana program implementing a configurable lottery: SOL or physical prizes, multi-destination revenue splits, pause/resume with timer freeze, admin-driven and cron-driven resolution paths, and per-buyer refunds on cancellation.

> **Reading this file is the fastest path to understanding what the program does.** Source comments cover the *how*; this file covers the *why* and the relationships between pieces.

---

## Glossary (Solana / Anchor cheatsheet for non-Rust devs)

| Term | Meaning |
|---|---|
| **Program** | Compiled bytecode living at a fixed address (the *program id*). Equivalent to a smart contract. Our id is in `lib.rs`'s `declare_id!`. |
| **Account** | A chunk of on-chain storage. Owned by exactly one program; only that program may mutate it. Each `#[account]` struct in `state/` is one. |
| **PDA** | *Program-Derived Address* — a deterministic address derived from "seeds" + program id. We use these so the program (not a user) is the only signer for an account. Seeds are how we name things, e.g. `[b"lottery", id]`. |
| **Instruction** | One callable function on the program. Each maps to one file under `instructions/`. |
| **CPI** | *Cross-Program Invocation* — calling another program from inside ours. Used here for `system_program::transfer` (SOL movement) and `init` (account allocation). |
| **Lamport** | `1 SOL == 1_000_000_000 lamports`. All on-chain math is in lamports. |
| **Discriminator** | The 8-byte type tag Anchor stores at the start of every account, so the runtime can tell `Lottery` from `Round`. |
| **Rent-exempt minimum** | Lamports an account must hold to avoid being garbage-collected. Always preserved on our `Round` PDA, even after distributing the pool. |

---

## Domain model

```
GlobalConfig (singleton)        ← admin authority + VRF wiring
   │
   └── Lottery (one per logical lottery)   ← config + lifecycle state
         │
         └── Round (current + historical)  ← timing + ticket counters + SOL escrow
               ├── TicketShard 0..N        ← buyer pubkeys, indexed for the draw
               ├── Entrant per buyer       ← per-buyer ticket count (refund lookup)
               └── VrfRequest (optional)   ← pending randomness fetch
```

PDA seeds (everything in `state/*.rs`'s `SEED` const):

| Account | Seeds |
|---|---|
| `GlobalConfig` | `[b"config"]` |
| `Lottery` | `[b"lottery", id_le]` |
| `Round` | `[b"round", lottery, index_le]` |
| `TicketShard` | `[b"shard", round, shard_index_le]` |
| `Entrant` | `[b"entrant", round, buyer]` |
| `VrfRequest` | `[b"vrf", round]` |

---

## State machines

### Lottery

```
        ┌──────► Active ◄─────┐
        │           │         │
        │           ▼         │
   create_lottery  Paused ────┘
                   │
                   ▼
           PendingDisable ──(current round resolves)──► Disabled ──(close_lottery)──►  ✗
```

> **Tickets are non-refundable.** Once SOL is paid into a round, it stays
> there until the round is resolved. The admin can always force-resolve via
> `resolve_round(seed)` so funds never get stranded.

- **Active** ⇄ **Paused**: `pause_lottery` / `resume_lottery`. While paused: no ticket sales; the open round's timer freezes (we record `paused_at` and accumulate into `paused_total_seconds`).
- **PendingDisable**: `begin_disable_lottery`. Current round (if any) is allowed to finish; no new round may open. On resolve, the lottery transitions automatically to `Disabled`.
- **Disabled** is terminal. `close_lottery` reclaims rent and removes the PDA.

### Round

```
   open_round ──► Open ──(timer expires │ admin resolves)──► Closed
                                                              │
                                                              ▼
                                                       AwaitingVrf ──(callback)──► Resolved
                                                              │
                                                              ▼
                                                          Canceled ──(claim_refund)──► (lamports drained)
```

- `Open`: ticket sales accepted as long as `now < started_at + duration_seconds + paused_total_seconds` and lottery is `Active`.
- `Closed`: timer elapsed but resolution not yet requested. Sales rejected.
- `AwaitingVrf`: `request_resolution` was called; oracle randomness is pending.
- `Resolved`: terminal. Pool paid out (or recorded for physical prizes), splits routed, lottery counters bumped.

### Pause math

```
effective_end_ts = started_at + duration_seconds + paused_total_seconds
                 + (now - paused_at  if currently paused else 0)

is_open_for_sales = round.state == Open
                 && lottery.state == Active
                 && round.paused_at is None
                 && now < effective_end_ts
```

---

## Sequence diagrams

### Buying tickets

```
buyer ──► buy_tickets(quantity)
            │
            │  • validates state, timer, quantity ≤ 320, shard not full
            │  • system::transfer(buyer → round)         (SOL escrow)
            │  • round PDA reallocs by quantity*32 bytes (lazy growth)
            │  • appends `quantity` copies of buyer.key to current shard
            │  • init_if_needed Entrant; bumps tickets_bought
            │  • emit TicketBought
            ▼
        Round.tickets_sold += quantity
        Round.lamports     += quantity × ticket_price
```

If the shard fills (reaches `TicketShard::CAPACITY = 8192`), the next buy will fail with `TicketShardFull`. The caller (or SDK) prepends `allocate_shard(round.current_shard + 1)` to advance to a fresh shard.

Per-call max: `TicketShard::MAX_BUYERS_PER_CALL = 128` (constrained by Solana's per-CPI realloc cap of 10 KB plus headroom for the BPF VM's small heap).

### Public resolution (the cron path)

```
cron ──► request_resolution                        (anyone can call when timer elapsed)
            │  • init VrfRequest PDA, seed = round.key
            │  • round.state = AwaitingVrf
            ▼
        VrfRequest { fulfilled: false, randomness: 0 }

oracle/admin ──► fulfill_resolution(randomness)   (admin in Phase 5b; ORAO authority later)
            │  • writes randomness, fulfilled = true
            ▼

cron ──► consume_resolution                        (anyone, with shard + split destinations)
            │  • winner_index = u64(randomness[..8]) % tickets_sold
            │  • locate winner in winner_shard at offset
            │  • iterate splits, transfer lamports out of round
            │  • round.state = Resolved, round.winner = Some(...)
            │  • emit RoundResolved
            ▼
```

The admin path is identical except step 1+2 collapse into a single `resolve_round(seed)` call where the admin supplies the seed directly.

---

## Revenue splits

Every Lottery has 1–8 `Split` entries. Each split has:

- `label` (16 bytes ASCII, free-form, e.g. `pool`, `dev`, `treasury`).
- `destination` Pubkey — the wallet that receives this slice. Ignored for `is_pool` splits.
- `bps` — basis points (`100 bps == 1%`), multiple of 100.
- `is_pool` — exactly one Split must have this set for `PrizeKind::Sol`; none for `PrizeKind::Physical`.

On every round, the splits are **snapshotted** into `Round.splits` at `open_round` time. Edits via `update_lottery_splits` apply only to the next round, so an in-flight buyer always sees the same terms they bought into.

At `resolve_round`/`consume_resolution`, the program iterates the snapshot in order and transfers `gross × bps / 10_000` lamports to each destination. The `is_pool` slice goes to the winning ticket holder.

> **Precondition:** every split destination wallet must already exist on-chain (≥1 lamport). Direct lamport credits to non-existent accounts fail. Winners always exist (they bought tickets); jackpot/dev/treasury wallets must be funded once before being configured.

---

## File layout

```
programs/lottery/src/
├── lib.rs              ← program id, the #[program] module, primer
├── state/
│   ├── mod.rs
│   ├── global_config.rs
│   ├── lottery.rs       (Lottery + Split + LotteryState + PrizeKind)
│   ├── round.rs         (Round + RoundState)
│   ├── ticket_shard.rs
│   ├── entrant.rs
│   └── vrf_request.rs
├── instructions/
│   ├── mod.rs
│   ├── initialize_global.rs
│   ├── admin_transfer.rs   (propose_admin, accept_admin)
│   ├── lottery_create.rs
│   ├── lottery_update.rs   (price, duration, splits)
│   ├── lottery_lifecycle.rs (pause, resume, begin/finalize disable, close)
│   ├── round_open.rs
│   ├── buy_tickets.rs
│   ├── allocate_shard.rs
│   ├── close_shard.rs       (reclaim shard rent post-resolve)
│   ├── resolve_empty.rs     (zero-ticket fast path)
│   ├── resolve_round.rs     (admin path + shared distribute_lamports helper)
│   ├── request_resolution.rs (manual mock — public step 1)
│   ├── fulfill_resolution.rs (manual mock — public step 2)
│   ├── consume_resolution.rs (manual mock — public step 3)
│   ├── request_orao.rs      (ORAO VRF CPI)
│   └── consume_orao.rs      (read ORAO randomness + resolve)
├── errors.rs           ← LotteryError enum (40+ variants, all with messages)
└── events.rs           ← #[event] structs consumed by the indexer
```

---

## Where to look when…

| You want to … | Read … |
|---|---|
| change the per-shard ticket cap | `state/ticket_shard.rs` (`CAPACITY`, `MAX_BUYERS_PER_CALL`) |
| add a new split-validation rule | `state/lottery.rs::Split::validate_collection` |
| add a new lottery state | `state/lottery.rs::LotteryState` + `instructions/lottery_lifecycle.rs` |
| change the prize-pool math | `instructions/resolve_round.rs::distribute_lamports` |
| wire ORAO VRF for real | `instructions/request_resolution.rs` (CPI into ORAO) + `fulfill_resolution.rs` (relax authority gate) |
| add a new emitted event | `events.rs` + emit in the relevant instruction |
| add a new error variant | `errors.rs` |

---

## Toolchain & build

```
anchor build         # compiles, emits target/idl/lottery.json + target/types/lottery.ts
anchor test          # spins up solana-test-validator and runs tests/lottery.ts
anchor deploy        # deploys to the [provider] cluster in Anchor.toml
```

Pinned versions: Rust stable, Solana CLI 3.x (Agave), Anchor 0.32.1. ORAO VRF crates require `anchor-lang ^0.32.1`.

---

## Resolution paths

There are **two parallel paths** for resolving a round; pick one per round:

1. **Admin manual** (`resolve_round(seed)`) — admin supplies a 32-byte seed and the program draws+distributes immediately. Useful for emergency overrides and for local tests where no oracle is running.
2. **Public ORAO VRF** (`request_orao_resolution` → wait → `consume_orao_resolution`) — anyone with a wallet (typically a cron job) calls `request_orao_resolution`, which CPIs into the ORAO VRF v2 program. ORAO oracles fulfill off-chain. Anyone then calls `consume_orao_resolution`, which reads the randomness directly from ORAO's account and resolves the round.
3. **Manual mock** (`request_resolution` → `fulfill_resolution` → `consume_resolution`) — same shape as the ORAO path but the admin writes the randomness in `fulfill_resolution`. Used in local tests and as a break-glass when ORAO is unavailable.

## Auto-rollover

`Lottery.auto_rollover = true` opens the auth gate on `open_round` for round indices > 1: anyone (e.g. the same cron job that drove the resolve) may open the next round without admin signing, as long as the previous round is `Resolved`. With `auto_rollover = false`, only the admin can open subsequent rounds.

## Shard cleanup

`close_shard` reclaims a TicketShard PDA's rent (the lamports that paid for `buy_tickets`'s realloc growth) once the round is `Resolved`. The rent goes back to the admin. Anyone may call it. Closing all shards after each resolve is a normal cron-job step.

## Open follow-ups

- **Token-denominated tickets**: ticket price is SOL today; SPL/USDC support is structural (price → mint+amount, vault → ATA) but out of scope.
- **Pending-admin timeout**: `propose_admin` has no expiry; if you propose by mistake, just call `propose_admin` again with the right key.
- **Live ORAO test**: the ORAO CPI compiles against `orao-solana-vrf 0.7.0`, but the test that exercises it is `it.skip(...)` because it requires the ORAO program + state PDAs to be cloned into the local validator (see `tests/lottery.ts` for the unskip recipe) or run against devnet.
