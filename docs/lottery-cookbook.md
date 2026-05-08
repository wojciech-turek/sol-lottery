# sol-lottery cookbook

Practical recipes for operating the lottery program. Each recipe is a sequence of TypeScript calls using the typed client from `@sol-lottery/sdk`.

> Conventions: every snippet assumes you've already done
> ```ts
> import * as anchor from '@coral-xyz/anchor';
> import { LAMPORTS_PER_SOL, PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
> import {
>   createProgram, globalConfigPda, lotteryPda, roundPda, ticketShardPda,
>   entrantPda, vrfRequestPda, packAsciiBytes,
> } from '@sol-lottery/sdk';
>
> const provider = anchor.AnchorProvider.env();
> anchor.setProvider(provider);
> const program = createProgram(provider.connection, provider.wallet);
> const admin = (provider.wallet as anchor.Wallet).payer;
> ```

---

## 1. First-time bootstrap

```ts
await program.methods
  .initializeGlobal(/* vrf_program */ PublicKey.default, /* vrf_treasury */ PublicKey.default)
  .accounts({
    globalConfig: globalConfigPda(),
    admin: admin.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .signers([admin])
  .rpc();
```

`PublicKey.default` is a placeholder for the ORAO VRF program/treasury until that wiring lands; replace with real cluster addresses once ORAO CPI is enabled.

---

## 2. Create a 24-hour SOL-prize lottery

```ts
const dev = new PublicKey('...');         // already has lamports
const treasury = new PublicKey('...');    // already has lamports

const splits = [
  { label: packAsciiBytes('pool', 16),     destination: PublicKey.default, bps: 8000, isPool: true },
  { label: packAsciiBytes('dev', 16),      destination: dev,               bps: 1500, isPool: false },
  { label: packAsciiBytes('treasury', 16), destination: treasury,          bps: 500,  isPool: false },
];

const cfg = await program.account.globalConfig.fetch(globalConfigPda());
const lotteryId = BigInt(cfg.nextLotteryId.toString());

await program.methods
  .createLottery(
    packAsciiBytes('Daily SOL Jackpot', 32),
    new anchor.BN(24 * 60 * 60),       // 24 hours
    new anchor.BN(0.1 * LAMPORTS_PER_SOL),
    { sol: {} },                        // PrizeKind::Sol
    true,                               // auto_rollover
    splits,
  )
  .accounts({
    globalConfig: globalConfigPda(),
    lottery: lotteryPda(lotteryId),
    admin: admin.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .signers([admin])
  .rpc();
```

Validation rules (enforced on-chain):
- 1 ≤ `splits.length` ≤ 8
- Σ`bps` = 10_000 (== 100%)
- Every `bps % 100 == 0` (1% increments)
- Exactly one split with `isPool: true` for `PrizeKind::Sol`

---

## 3. Create a physical-prize lottery

```ts
const team = new PublicKey('...');

const splits = [
  { label: packAsciiBytes('team', 16), destination: team, bps: 10000, isPool: false },
  // 100% to the team; the winner's address is recorded for off-chain delivery
];

await program.methods
  .createLottery(
    packAsciiBytes('Limited Sneakers', 32),
    new anchor.BN(7 * 24 * 60 * 60),
    new anchor.BN(0.5 * LAMPORTS_PER_SOL),
    { physical: {} },
    false,
    splits,
  )
  .accounts({ /* … */ })
  .signers([admin])
  .rpc();
```

For physical prizes:
- **No** split may have `isPool: true`.
- After resolution, `Round.winner` is set to the winning ticket holder's pubkey. Off-chain ops contacts them for delivery.

---

## 4. Open round 1 and sell tickets

```ts
const lottery = lotteryPda(lotteryId);
const round = roundPda(lottery, 1n);
const shard0 = ticketShardPda(round, 0);

await program.methods
  .openRound(new anchor.BN(1))
  .accounts({
    globalConfig: globalConfigPda(),
    lottery,
    round,
    shardZero: shard0,
    admin: admin.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .signers([admin])
  .rpc();

// Anyone can buy:
await program.methods
  .buyTickets(new anchor.BN(5))
  .accounts({
    lottery,
    round,
    currentShard: shard0,
    entrant: entrantPda(round, buyer.publicKey),
    buyer: buyer.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .signers([buyer])
  .rpc();
```

Per-call cap: `quantity ≤ 320` (Solana CPI realloc limit). For larger purchases, split into multiple `buyTickets` ix in the same tx, or multiple txs.

When a shard fills (8192 tickets), prepend `allocateShard(currentShard + 1)` before the next `buyTickets`.

---

## 5. Update price / duration / splits mid-stream

These edits apply to the **next** round only. The current in-flight round keeps its snapshot.

```ts
await program.methods.updateLotteryPrice(new anchor.BN(0.2 * LAMPORTS_PER_SOL))
  .accounts({ globalConfig: globalConfigPda(), lottery, admin: admin.publicKey })
  .signers([admin]).rpc();

await program.methods.updateLotteryDuration(new anchor.BN(48 * 60 * 60))
  .accounts({ globalConfig: globalConfigPda(), lottery, admin: admin.publicKey })
  .signers([admin]).rpc();

await program.methods.updateLotterySplits(newSplits)
  .accounts({ globalConfig: globalConfigPda(), lottery, admin: admin.publicKey })
  .signers([admin]).rpc();
```

---

## 6. Pause and resume

Pausing freezes the round's timer (`paused_at` is set, `effective_end` extends as time passes). Buys are rejected while paused.

```ts
await program.methods.pauseLottery()
  .accounts({
    globalConfig: globalConfigPda(),
    lottery,
    round,                          // pass the round if one is open
    admin: admin.publicKey,
  })
  .signers([admin]).rpc();

// later …
await program.methods.resumeLottery()
  .accounts({ globalConfig: globalConfigPda(), lottery, round, admin: admin.publicKey })
  .signers([admin]).rpc();
```

If no round is open, pass `round: null`.

---

## 7. Resolve a round

### 7a. Admin path — supply your own seed

```ts
const seed = new Uint8Array(32);
crypto.getRandomValues(seed);

const round = await program.account.round.fetch(roundPda(lottery, 1n));
const winnerIndex = Number(BigInt(`0x${Buffer.from(seed.slice(0, 8)).reverse().toString('hex')}`) % round.ticketsSold.toBigInt());
const shardIndex = Math.floor(winnerIndex / 8192);
const offsetInShard = winnerIndex % 8192;

const winnerShard = ticketShardPda(roundPda(lottery, 1n), shardIndex);
const shardData = await program.account.ticketShard.fetch(winnerShard);
const winner = shardData.buyers[offsetInShard];

await program.methods
  .resolveRound(Array.from(seed))
  .accounts({
    globalConfig: globalConfigPda(),
    lottery,
    round: roundPda(lottery, 1n),
    winnerShard,
    admin: admin.publicKey,
  })
  .remainingAccounts(
    round.splits.map(s => ({
      pubkey: s.isPool ? winner : s.destination,
      isWritable: true,
      isSigner: false,
    })),
  )
  .signers([admin])
  .rpc();
```

### 7b. Public path — ORAO VRF (production cron)

Anyone (cron job) can drive the resolve once the timer elapses:

```ts
const ORAO_PROGRAM_ID = new PublicKey('VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y');
const oraoNetworkState = PublicKey.findProgramAddressSync(
  [Buffer.from('orao-vrf-network-configuration')],
  ORAO_PROGRAM_ID,
)[0];
const oraoVrfRequest = PublicKey.findProgramAddressSync(
  [Buffer.from('orao-vrf-randomness-request'), round.toBuffer()],
  ORAO_PROGRAM_ID,
)[0];
const treasury = /* read from oraoNetworkState.config.treasury */;

// Step 1: kicks off ORAO randomness fetch.
await program.methods.requestOraoResolution()
  .accounts({
    globalConfig: globalConfigPda(),
    lottery, round,
    vrfRequest: oraoVrfRequest,
    vrfTreasury: treasury,
    vrfNetworkState: oraoNetworkState,
    vrfProgram: ORAO_PROGRAM_ID,
    caller: cron.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .signers([cron]).rpc();

// Step 2: ORAO oracles fulfill off-chain (~seconds).

// Step 3: anyone resolves once fulfilled.
await program.methods.consumeOraoResolution()
  .accounts({
    globalConfig: globalConfigPda(),
    lottery, round,
    vrfRequest: oraoVrfRequest,
    winnerShard,
    caller: cron.publicKey,
  })
  .remainingAccounts(/* same as 7a */)
  .signers([cron]).rpc();
```

### 7c. Public path — manual fulfill (testing fallback)

Step 1 (any time the timer has elapsed):
```ts
await program.methods.requestResolution()
  .accounts({
    globalConfig: globalConfigPda(),
    lottery,
    round: roundPda(lottery, 1n),
    vrfRequest: vrfRequestPda(roundPda(lottery, 1n)),
    caller: cron.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .signers([cron]).rpc();
```

Step 2 (admin or oracle authority writes the randomness):
```ts
const randomness = new Uint8Array(64);
// In production, ORAO will fill this; for now, the admin signs it in.
await program.methods.fulfillResolution(Array.from(randomness))
  .accounts({
    globalConfig: globalConfigPda(),
    vrfRequest: vrfRequestPda(round),
    admin: admin.publicKey,
  })
  .signers([admin]).rpc();
```

Step 3 (anyone can finalize):
```ts
await program.methods.consumeResolution()
  .accounts({
    globalConfig: globalConfigPda(),
    lottery,
    round,
    vrfRequest: vrfRequestPda(round),
    winnerShard,
    caller: cron.publicKey,
  })
  .remainingAccounts(/* same as 7a */)
  .signers([cron]).rpc();
```

---

## 8. Close shards after resolve (reclaim rent)

After a round resolves, its shards are dead weight (they were only needed for the random draw). Close them to recover the rent paid by buyers/admin:

```ts
await program.methods.closeShard()
  .accounts({
    globalConfig: globalConfigPda(),
    lottery, round,
    shard: ticketShardPda(round, shardIndex),
    rentRecipient: admin.publicKey, // pinned to GlobalConfig.admin
    caller: anyone.publicKey,
  })
  .signers([anyone]).rpc();
```

Loop over `round.maxShard` to close every shard. Anyone can call this (it's mechanical bookkeeping).

> There is **no cancel/refund path** — tickets are non-refundable. The admin's escape hatch for an unresolvable round is `resolveRound(seed)` with any seed they choose.

---

## 9. Wind down a lottery

```ts
// Stop opening new rounds; current round runs to completion.
await program.methods.beginDisableLottery()
  .accounts({ globalConfig: globalConfigPda(), lottery, admin: admin.publicKey })
  .signers([admin]).rpc();

// Resolve the in-flight round normally — lottery transitions to Disabled automatically.

// Once Disabled, reclaim the Lottery PDA's rent:
await program.methods.closeLottery()
  .accounts({ globalConfig: globalConfigPda(), lottery, admin: admin.publicKey })
  .signers([admin]).rpc();
```

---

## 10. Admin handover (two-step)

```ts
// Old admin proposes:
await program.methods.proposeAdmin(newAdmin.publicKey)
  .accounts({ globalConfig: globalConfigPda(), admin: oldAdmin.publicKey })
  .signers([oldAdmin]).rpc();

// New admin accepts (must sign):
await program.methods.acceptAdmin()
  .accounts({ globalConfig: globalConfigPda(), newAdmin: newAdmin.publicKey })
  .signers([newAdmin]).rpc();
```

A typo in `proposeAdmin` is recoverable — just call `proposeAdmin` again with the correct key. The new admin doesn't gain any authority until they call `acceptAdmin`.

---

## 11. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `RoundExpired` on a buy | The round's timer has elapsed; resolve it instead. |
| `LotteryPaused` on a buy | The lottery is paused. Resume first. |
| `TicketShardFull` on a buy | Run `allocateShard(round.currentShard + 1)` first. |
| `QuantityTooLarge` on a buy | More than 128 tickets per call. Split into multiple ix. |
| Resolve fails with a low-level transfer error | A split destination wallet doesn't exist on-chain. Fund it with at least 1 lamport once. |
| `Account data size realloc limited to 10240` | Either the buy quantity is too large, or you tried to allocate a shard with the full max-len up-front (it's now lazy — see Phase 7 in `programs/lottery/README.md`). |
| `MissingPoolSplitForSolPrize` | A SOL-prize lottery needs exactly one `is_pool: true` split. |
| `UnexpectedPoolSplitForPhysicalPrize` | A Physical-prize lottery must not have any `is_pool: true` split. |
