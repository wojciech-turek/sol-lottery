# sol-lottery — comprehensive devnet test plan

This is the plan a single end-to-end runner will execute against the deployed devnet program. **Every resolution uses real ORAO VRF** (no admin-seed shortcuts). All scenarios run sequentially in one process; the report at the end reflects the on-chain + indexed-DB state.

## Setup

| Component | Configuration |
|---|---|
| RPC | `https://api.devnet.solana.com` |
| Program | `HQ86E1qrGs7axPuNZKHsc23MUhL9SFKdygkNM8K95uop` |
| GlobalConfig | already initialized |
| Indexer | running locally, writing to Supabase Postgres |
| Admin wallet | `HMKg4259cwpfHhQDxWqeAP4GauJaEHZ68pCbfQkVWTTC` (existing, ≥ 3 SOL) |
| Cron operator wallet | newly generated, funded with 0.5 SOL from admin |
| Buyer wallets | 5 freshly generated, each funded with 0.1 SOL |
| Donor wallets | 3 freshly generated, each funded with 0.15 SOL |
| Split destinations | 2 freshly generated dev + treasury wallets, funded with 0.001 SOL (just enough so direct lamport credits land) |

Round duration is kept short (3 s in most scenarios) to keep the run within ~12 min.

## Scenarios

### A. Multi-round auto-rollover (the headline test)
- Create lottery with `auto_rollover = true`, 3 s duration, 0.005 SOL ticket price.
- Splits: pool 75%, dev 15%, treasury 10%.
- Admin opens **round 1**.
- For rounds 1 → 10:
  - 2–4 random buyer wallets buy 1–3 tickets each.
  - Wait for timer to elapse.
  - Cron calls `requestOraoResolution`.
  - Cron calls `consumeOraoResolution` with `nextRound` + `nextShard` so round N+1 opens atomically.
  - Verify on chain: round N is `Resolved`, round N+1 is `Open`, lottery's `currentRoundIndex == N+1`, winner is one of the buyers, pool was paid.
- After round 10 resolves, admin disables and closes lottery.

**Pass criteria:** 10 rounds resolved, 10 distinct winners-from-buyers chosen by ORAO, lottery final state `Disabled`, all 10 rounds present in `lottery_round` DB table.

### B. Pause / resume timer math
- Create lottery, 10 s duration, no auto-rollover.
- Admin opens round 1, buyer A buys 1 ticket.
- Wait 3 s → admin pauses.
- Try to buy → must fail with `LotteryNotActive` or `LotteryPaused`.
- Wait 5 s (paused).
- Admin resumes.
- Try to buy → succeeds.
- Wait for round to expire (deadline shifted by ~5 s).
- Cron resolves via ORAO.

**Pass criteria:** paused buy rejects, post-resume buy lands, round resolves with the expected pool.

### C. Donations on top of the pool
- Create lottery, 5 s duration, splits: pool 50%, dev 50%.
- Admin opens round 1, 3 buyer wallets each buy 1 ticket (0.005 × 3 = 0.015 SOL gross).
- Each donor wallet donates 0.05 SOL to round → 3 × 0.05 = 0.15 SOL donated.
- Wait, ORAO-resolve.

**Pass criteria:** pool paid to winner = `0.015 × 0.5 + 0.15 = 0.1575 SOL`, dev paid `0.015 × 0.5 = 0.0075 SOL`, donations recorded in `donation` table.

### D. Disable lifecycle
- Create lottery, 4 s duration, no auto-rollover.
- Admin opens round 1, 2 buyers buy a ticket each.
- Admin calls `beginDisableLottery`.
- Try `openRound(2)` after disable started → should fail.
- Wait, ORAO-resolve. Lottery transitions to `Disabled`.
- Admin calls `closeLottery`. Account is removed.

**Pass criteria:** lottery account is `null` on chain after close.

### E. Physical-prize lottery
- Create lottery with `PrizeKind::Physical`, splits: team 100% (no `is_pool`).
- Buyer purchases 2 tickets.
- ORAO-resolve.

**Pass criteria:** winner pubkey recorded; winner's SOL balance unchanged; team gets the full ticket revenue.

### F. Empty round
- Create lottery, 3 s duration, no buyers.
- Wait for timer to expire.
- Admin calls `resolveEmptyRound` (this path bypasses ORAO — there's nothing to draw).

**Pass criteria:** round state `Resolved`, winner is null, `lottery.totalRoundsResolved` incremented by 1.

### G. Donations on a Physical lottery should be rejected
- Reuse the lottery from E (it has a resolved round) — actually create a fresh one.
- Donor tries `donateToRound`.

**Pass criteria:** transaction reverts with `DonationRequiresPoolSplit`.

## Aggregate assertions at the end

- Every successful instruction is reflected in the indexer DB:
  - `lottery` rows for each created lottery
  - `lottery_round` rows for each round opened
  - `lottery_state_log` rows for every state transition
  - `ticket_purchase` rows for every buy
  - `donation` rows for every donation
- Sum of pool payouts across all rounds matches sum of (ticket gross × pool_bps / 10000 + donations).
- ORAO fulfilled every randomness request (no scenario stalled on `VrfNotFulfilled` past the 60 s timeout).

## Output

The runner prints a structured report at the end with one row per scenario: `name | passed | duration | notes` plus aggregate assertions and final SOL balances of the runner wallets.
