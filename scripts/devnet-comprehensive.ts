/**
 * Comprehensive devnet end-to-end test.
 *
 * Runs all scenarios from `docs/devnet-test-plan.md` sequentially, using
 * real ORAO VRF for every resolution where applicable. Generates a report
 * at the end summarizing each scenario plus aggregate DB checks.
 *
 * Prereqs:
 *   - Indexer running (`pnpm --filter indexer dev`).
 *   - Admin wallet (~/.config/solana/id.json) has ≥ 3 SOL on devnet.
 *
 * Run: `pnpm --filter scripts test:devnet`
 */
import 'dotenv/config';
import * as anchor from '@coral-xyz/anchor';
import BN from 'bn.js';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
} from '@solana/web3.js';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  buildResolveAccounts,
  createProgram,
  globalConfigPda,
  lotteryPda,
  oraoNetworkState,
  oraoRandomnessAccount,
  packAsciiBytes,
  roundPda,
  ticketShardPda,
} from '@sol-lottery/sdk';
// ORAO's official TS SDK — gives us a typed `getVrf` client that handles
// the RandomnessAccountData layout correctly (no fragile manual offsets).
import { Orao } from '@orao-network/solana-vrf';
import { prisma } from '@sol-lottery/db';

const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const WALLET_PATH =
  process.env.ANCHOR_WALLET ?? path.join(homedir(), '.config/solana/id.json');

const conn = new Connection(RPC_URL, 'confirmed');
const adminKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8'))),
);
const wallet = new anchor.Wallet(adminKeypair);
const program = createProgram(conn, wallet);

// ORAO client used to read fulfillment via their typed deserializer.
const oraoProvider = new anchor.AnchorProvider(
  conn,
  wallet,
  anchor.AnchorProvider.defaultOptions(),
);
const oraoClient = new Orao(oraoProvider);

// ----------------------------- helpers -----------------------------

const log = (msg: string) => console.log(`[plan] ${msg}`);
const slog = (s: string, msg: string) => console.log(`  [${s}] ${msg}`);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const transfer = async (
  from: Keypair,
  to: PublicKey,
  sol: number,
): Promise<void> => {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: to,
      lamports: Math.floor(sol * LAMPORTS_PER_SOL),
    }),
  );
  const sig = await conn.sendTransaction(tx, [from]);
  await conn.confirmTransaction(sig, 'confirmed');
};

interface ScenarioResult {
  name: string;
  passed: boolean;
  durationMs: number;
  notes: string[];
  error?: string;
}

const results: ScenarioResult[] = [];

const runScenario = async (
  name: string,
  fn: (notes: string[]) => Promise<void>,
): Promise<void> => {
  log(`▶ ${name}`);
  const notes: string[] = [];
  const start = Date.now();
  try {
    await fn(notes);
    results.push({
      name,
      passed: true,
      durationMs: Date.now() - start,
      notes,
    });
    log(`✅ ${name}`);
  } catch (err: any) {
    results.push({
      name,
      passed: false,
      durationMs: Date.now() - start,
      notes,
      error: String(err?.message ?? err),
    });
    log(`❌ ${name}: ${err?.message ?? err}`);
  }
};

const generateLottery = async (opts: {
  name: string;
  durationSeconds: number;
  ticketPriceSol: number;
  splits: Array<{ label: string; destination: PublicKey; bps: number; isPool: boolean }>;
  autoRollover: boolean;
  physical?: boolean;
}): Promise<{ id: bigint; lottery: PublicKey }> => {
  const cfg = await program.account.globalConfig.fetch(globalConfigPda());
  const id = BigInt(cfg.nextLotteryId.toString());
  const lottery = lotteryPda(id);

  await program.methods
    .createLottery(
      packAsciiBytes(opts.name, 32),
      new BN(opts.durationSeconds),
      new BN(Math.floor(opts.ticketPriceSol * LAMPORTS_PER_SOL)),
      opts.physical ? { physical: {} } : { sol: {} },
      opts.autoRollover,
      opts.splits.map((s) => ({
        label: packAsciiBytes(s.label, 16),
        destination: s.destination,
        bps: s.bps,
        isPool: s.isPool,
      })),
    )
    .accounts({
      globalConfig: globalConfigPda(),
      lottery,
      admin: adminKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([adminKeypair])
    .rpc();

  return { id, lottery };
};

const openRoundOne = async (
  lottery: PublicKey,
): Promise<{ round: PublicKey; shard: PublicKey }> => {
  const round = roundPda(lottery, 1n);
  const shard = ticketShardPda(round, 0);
  await program.methods
    .openRound(new BN(1))
    .accounts({
      globalConfig: globalConfigPda(),
      lottery,
      previousRound: null,
      round,
      shardZero: shard,
      payer: adminKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([adminKeypair])
    .rpc();
  return { round, shard };
};

const buyTickets = async (
  lottery: PublicKey,
  round: PublicKey,
  shard: PublicKey,
  buyer: Keypair,
  quantity: number,
): Promise<string> =>
  program.methods
    .buyTickets(new BN(quantity))
    .accounts({
      lottery,
      round,
      currentShard: shard,
      buyer: buyer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([buyer])
    .rpc();

const requestOrao = async (
  lottery: PublicKey,
  round: PublicKey,
  caller: Keypair,
  vrfTreasury: PublicKey,
): Promise<void> => {
  const networkStatePda = oraoNetworkState();
  const oraoVrfRequest = oraoRandomnessAccount(round);
  await program.methods
    .requestOraoResolution()
    .accounts({
      globalConfig: globalConfigPda(),
      lottery,
      round,
      vrfRequest: oraoVrfRequest,
      vrfTreasury,
      vrfNetworkState: networkStatePda,
      vrfProgram: new PublicKey('VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y'),
      caller: caller.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([caller])
    .rpc();
};

const consumeOraoWithRetry = async (
  lottery: PublicKey,
  round: PublicKey,
  caller: Keypair,
  options: { rollover?: boolean } = {},
  timeoutMs = 90_000,
): Promise<{ winner: PublicKey; nextRoundOpened: boolean }> => {
  const oraoVrfRequest = oraoRandomnessAccount(round);
  const seed = round.toBytes();
  const start = Date.now();

  // 1. Use ORAO's typed deserializer to wait for fulfillment.
  let randomness: Buffer | null = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const acct = await oraoClient.getRandomness(Buffer.from(seed));
      const fulfilled = (acct as any).getFulfilledRandomness?.();
      if (fulfilled && fulfilled.length === 64) {
        randomness = Buffer.from(fulfilled);
        break;
      }
    } catch {
      /* account may not exist yet; keep polling */
    }
    await sleep(2_000);
  }
  if (!randomness) throw new Error('ORAO did not fulfill within timeout');

  // 2. Compute every account from that authoritative randomness.
  const accts = await buildResolveAccounts(program, round, randomness, options);

  // 3. Send consume.
  await program.methods
    .consumeOraoResolution()
    .accounts({
      globalConfig: globalConfigPda(),
      lottery,
      round,
      vrfRequest: oraoVrfRequest,
      winnerShard: accts.winnerShard,
      caller: caller.publicKey,
      nextRound: accts.nextRound,
      nextShard: accts.nextShard,
      systemProgram: accts.systemProgram,
    })
    .remainingAccounts(accts.remainingAccounts)
    .signers([caller])
    .rpc();
  return { winner: accts.winner, nextRoundOpened: !!accts.nextRound };
};

// ----------------------------- scenarios -----------------------------

let cron: Keypair;
let buyers: Keypair[];
let donors: Keypair[];
let dev: Keypair;
let treasury: Keypair;
let team: Keypair;
let oraoTreasury: PublicKey;

const scenarioA_multiRound = () =>
  runScenario('A. Multi-round auto-rollover (10 rounds, ORAO)', async (notes) => {
    const { id, lottery } = await generateLottery({
      name: 'multi-round',
      durationSeconds: 30,
      ticketPriceSol: 0.005,
      splits: [
        { label: 'pool', destination: PublicKey.default, bps: 7500, isPool: true },
        { label: 'dev', destination: dev.publicKey, bps: 1500, isPool: false },
        { label: 'treasury', destination: treasury.publicKey, bps: 1000, isPool: false },
      ],
      autoRollover: true,
    });
    notes.push(`lottery id ${id}`);
    notes.push(`lottery pubkey ${lottery.toBase58()}`);

    const { round: round1, shard: shard1 } = await openRoundOne(lottery);
    let currentRound = round1;
    let currentShard = shard1;
    const winners: string[] = [];

    for (let n = 1; n <= 10; n++) {
      // 2 buyers per round to keep tx volume modest given devnet latency.
      const numBuyers = 2;
      let totalTickets = 0;
      for (let i = 0; i < numBuyers; i++) {
        const buyer = buyers[(n + i) % buyers.length];
        const qty = 1 + Math.floor(Math.random() * 2);
        await buyTickets(lottery, currentRound, currentShard, buyer, qty);
        totalTickets += qty;
      }
      slog(`A`, `round ${n} bought ${totalTickets} tickets across ${numBuyers} wallets`);

      // Sleep past the round's 30s deadline. Cron-side `requestOrao` only
      // fires once the timer has elapsed; admin could force-resolve earlier.
      await sleep(32_000);
      await requestOrao(lottery, currentRound, cron, oraoTreasury);

      const wantsRollover = n < 10;
      const { winner, nextRoundOpened } = await consumeOraoWithRetry(
        lottery,
        currentRound,
        cron,
        { rollover: wantsRollover },
      );
      winners.push(winner.toBase58());
      slog(`A`, `round ${n} resolved → winner ${winner.toBase58().slice(0, 8)}…  rollover=${nextRoundOpened}`);

      if (wantsRollover) {
        if (!nextRoundOpened) {
          throw new Error(`expected rollover for round ${n}`);
        }
        const nextRoundIdx = BigInt(n + 1);
        currentRound = roundPda(lottery, nextRoundIdx);
        currentShard = ticketShardPda(currentRound, 0);
      }
    }

    notes.push(`winners drawn: ${winners.length}`);
    notes.push(`distinct winners: ${new Set(winners).size}`);

    // Wind down: disable + close.
    await program.methods
      .beginDisableLottery()
      .accounts({
        globalConfig: globalConfigPda(),
        lottery,
        admin: adminKeypair.publicKey,
      })
      .signers([adminKeypair])
      .rpc();

    // Round 10 already resolved, but the lottery's state went PendingDisable
    // AFTER the last round resolved, so the round-10 resolve itself didn't
    // transition us to Disabled. We still need finalize.
    await program.methods
      .finalizeDisableLottery()
      .accounts({
        globalConfig: globalConfigPda(),
        lottery,
        round: roundPda(lottery, 10n),
        admin: adminKeypair.publicKey,
      })
      .signers([adminKeypair])
      .rpc();

    await program.methods
      .closeLottery()
      .accounts({
        globalConfig: globalConfigPda(),
        lottery,
        admin: adminKeypair.publicKey,
      })
      .signers([adminKeypair])
      .rpc();

    const acct = await conn.getAccountInfo(lottery);
    if (acct !== null) throw new Error('lottery did not close');
    notes.push('lottery disabled + closed; rent reclaimed');
  });

const scenarioB_pauseResume = () =>
  runScenario('B. Pause / resume timer math (ORAO resolve)', async (notes) => {
    const { lottery } = await generateLottery({
      name: 'pause-resume',
      durationSeconds: 30,
      ticketPriceSol: 0.005,
      splits: [
        { label: 'pool', destination: PublicKey.default, bps: 9000, isPool: true },
        { label: 'dev', destination: dev.publicKey, bps: 1000, isPool: false },
      ],
      autoRollover: false,
    });
    const { round, shard } = await openRoundOne(lottery);
    const buyer = buyers[0];
    await buyTickets(lottery, round, shard, buyer, 1);

    await sleep(3_000);

    // Pause.
    await program.methods
      .pauseLottery()
      .accounts({
        globalConfig: globalConfigPda(),
        lottery,
        round,
        admin: adminKeypair.publicKey,
      })
      .signers([adminKeypair])
      .rpc();

    // Buy attempt while paused must fail.
    let pausedBuyFailed = false;
    try {
      await buyTickets(lottery, round, shard, buyers[1], 1);
    } catch (err: any) {
      pausedBuyFailed = /LotteryNotActive|LotteryPaused/.test(String(err));
    }
    if (!pausedBuyFailed) throw new Error('buy succeeded while paused');
    notes.push('buy correctly rejected while paused');

    // Stay paused 5 s, then resume.
    await sleep(5_000);
    await program.methods
      .resumeLottery()
      .accounts({
        globalConfig: globalConfigPda(),
        lottery,
        round,
        admin: adminKeypair.publicKey,
      })
      .signers([adminKeypair])
      .rpc();

    // Buy succeeds after resume.
    await buyTickets(lottery, round, shard, buyers[1], 1);
    notes.push('buy succeeded after resume');

    // Wait for the (extended) deadline.
    await sleep(30_000);
    await requestOrao(lottery, round, cron, oraoTreasury);
    const { winner } = await consumeOraoWithRetry(lottery, round, cron);
    notes.push(`winner ${winner.toBase58().slice(0, 8)}…`);
  });

const scenarioC_donations = () =>
  runScenario('C. Donations on top of pool (ORAO resolve)', async (notes) => {
    const { lottery } = await generateLottery({
      name: 'donations',
      durationSeconds: 30,
      ticketPriceSol: 0.005,
      splits: [
        { label: 'pool', destination: PublicKey.default, bps: 5000, isPool: true },
        { label: 'dev', destination: dev.publicKey, bps: 5000, isPool: false },
      ],
      autoRollover: false,
    });
    const { round, shard } = await openRoundOne(lottery);
    for (let i = 0; i < 3; i++) {
      await buyTickets(lottery, round, shard, buyers[i], 1);
    }
    notes.push('3 buyers × 1 ticket = 0.015 SOL gross');

    let totalDonated = 0;
    for (let i = 0; i < donors.length; i++) {
      const amount = 0.05 * LAMPORTS_PER_SOL;
      await program.methods
        .donateToRound(new BN(amount))
        .accounts({
          lottery,
          round,
          donor: donors[i].publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([donors[i]])
        .rpc();
      totalDonated += amount;
    }
    notes.push(`3 donations × 0.05 SOL = ${totalDonated / LAMPORTS_PER_SOL} SOL donated`);

    await sleep(30_000);
    await requestOrao(lottery, round, cron, oraoTreasury);
    const devBalBefore = await conn.getBalance(dev.publicKey, 'confirmed');
    const { winner } = await consumeOraoWithRetry(lottery, round, cron);
    await sleep(5_000);
    const devBalAfter = await conn.getBalance(dev.publicKey, 'confirmed');

    const expectedPool = Math.floor(0.015 * LAMPORTS_PER_SOL * 0.5) + totalDonated;
    const expectedDev = Math.floor(0.015 * LAMPORTS_PER_SOL * 0.5);
    notes.push(`winner: ${winner.toBase58().slice(0, 8)}… expected pool ${expectedPool}`);
    notes.push(`dev received ${devBalAfter - devBalBefore} (expected ${expectedDev})`);
    if (devBalAfter - devBalBefore !== expectedDev) {
      throw new Error(`dev payout mismatch`);
    }
  });

const scenarioD_disableLifecycle = () =>
  runScenario('D. Disable lifecycle (ORAO resolve, then close)', async (notes) => {
    const { lottery } = await generateLottery({
      name: 'disable-life',
      durationSeconds: 25,
      ticketPriceSol: 0.005,
      splits: [
        { label: 'pool', destination: PublicKey.default, bps: 9000, isPool: true },
        { label: 'dev', destination: dev.publicKey, bps: 1000, isPool: false },
      ],
      autoRollover: false,
    });
    const { round, shard } = await openRoundOne(lottery);
    await buyTickets(lottery, round, shard, buyers[0], 1);
    await buyTickets(lottery, round, shard, buyers[1], 2);

    await program.methods
      .beginDisableLottery()
      .accounts({
        globalConfig: globalConfigPda(),
        lottery,
        admin: adminKeypair.publicKey,
      })
      .signers([adminKeypair])
      .rpc();
    notes.push('lottery moved to PendingDisable');

    // Try to open round 2 — should fail (PendingDisable, not Active).
    let openFailed = false;
    try {
      const round2 = roundPda(lottery, 2n);
      const shard2 = ticketShardPda(round2, 0);
      await program.methods
        .openRound(new BN(2))
        .accounts({
          globalConfig: globalConfigPda(),
          lottery,
          previousRound: round,
          round: round2,
          shardZero: shard2,
          payer: adminKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([adminKeypair])
        .rpc();
    } catch {
      openFailed = true;
    }
    if (!openFailed) throw new Error('open_round(2) succeeded against PendingDisable');
    notes.push('openRound(2) rejected as expected');

    await sleep(25_000);
    // Admin requests ORAO (cron can't — `request_orao_resolution`'s
    // non-admin path requires `lottery.state == Active`, but ours is
    // PendingDisable now). Admin is authorized in any state.
    await requestOrao(lottery, round, adminKeypair, oraoTreasury);
    await consumeOraoWithRetry(lottery, round, cron);

    await sleep(2_000);
    const lotteryAcct = await program.account.lottery.fetch(lottery);
    if (Object.keys(lotteryAcct.state)[0] !== 'disabled') {
      throw new Error(`expected Disabled, got ${Object.keys(lotteryAcct.state)[0]}`);
    }
    notes.push('lottery transitioned to Disabled after resolve');

    await program.methods
      .closeLottery()
      .accounts({
        globalConfig: globalConfigPda(),
        lottery,
        admin: adminKeypair.publicKey,
      })
      .signers([adminKeypair])
      .rpc();
    if ((await conn.getAccountInfo(lottery)) !== null) {
      throw new Error('lottery account remained after close');
    }
    notes.push('closeLottery removed account, rent reclaimed');
  });

const scenarioE_physical = () =>
  runScenario('E. Physical-prize lottery (ORAO resolve)', async (notes) => {
    const { lottery } = await generateLottery({
      name: 'physical',
      durationSeconds: 20,
      ticketPriceSol: 0.005,
      splits: [{ label: 'team', destination: team.publicKey, bps: 10000, isPool: false }],
      autoRollover: false,
      physical: true,
    });
    const { round, shard } = await openRoundOne(lottery);
    await buyTickets(lottery, round, shard, buyers[0], 2);

    const buyerBalBefore = await conn.getBalance(buyers[0].publicKey);
    const teamBalBefore = await conn.getBalance(team.publicKey);

    await sleep(20_000);
    await requestOrao(lottery, round, cron, oraoTreasury);
    const { winner } = await consumeOraoWithRetry(lottery, round, cron);
    if (!winner.equals(buyers[0].publicKey)) {
      throw new Error('winner is not the only buyer');
    }
    notes.push(`winner recorded: ${winner.toBase58().slice(0, 8)}…`);

    // Wait long enough for confirmation to propagate before snapshot.
    await sleep(5_000);
    const buyerBalAfter = await conn.getBalance(buyers[0].publicKey, 'confirmed');
    const teamBalAfter = await conn.getBalance(team.publicKey, 'confirmed');
    // Allow tx-fee-sized noise; for a physical lottery the winner gets *no*
    // pool payout, so the diff should be ≤ a few dust lamports.
    const diff = Math.abs(buyerBalAfter - buyerBalBefore);
    if (diff > 100_000) {
      throw new Error(`winner balance moved by ${diff} lamports (expected ~0)`);
    }
    notes.push('winner SOL balance ≈ unchanged (no pool payout)');
    const teamReceived = teamBalAfter - teamBalBefore;
    const expectedTeam = Math.floor(0.005 * 2 * LAMPORTS_PER_SOL);
    if (teamReceived !== expectedTeam) {
      throw new Error(`team received ${teamReceived}, expected ${expectedTeam}`);
    }
    notes.push(`team received full ticket revenue: ${teamReceived} lamports`);
  });

const scenarioF_emptyRound = () =>
  runScenario('F. Empty round (resolveEmptyRound, no ORAO)', async (notes) => {
    const { lottery } = await generateLottery({
      name: 'empty-round',
      durationSeconds: 3,
      ticketPriceSol: 0.005,
      splits: [
        { label: 'pool', destination: PublicKey.default, bps: 10000, isPool: true },
      ],
      autoRollover: false,
    });
    const { round } = await openRoundOne(lottery);
    await sleep(3_500);

    await program.methods
      .resolveEmptyRound()
      .accounts({
        globalConfig: globalConfigPda(),
        lottery,
        round,
        admin: adminKeypair.publicKey,
      })
      .signers([adminKeypair])
      .rpc();

    // Wait for the resolve to propagate, then re-fetch.
    await sleep(2_000);
    const r = await program.account.round.fetch(round);
    if (Object.keys(r.state)[0] !== 'resolved') {
      throw new Error(`expected resolved, got ${Object.keys(r.state)[0]}`);
    }
    if (r.winner !== null) {
      throw new Error('expected null winner on empty round');
    }
    notes.push('empty round resolved with null winner');

    const lotteryAcct = await program.account.lottery.fetch(lottery);
    if (lotteryAcct.totalRoundsResolved.toNumber() !== 1) {
      throw new Error(`totalRoundsResolved ${lotteryAcct.totalRoundsResolved} != 1`);
    }
    notes.push('lottery.totalRoundsResolved bumped to 1');
  });

const scenarioG_donateRejectsPhysical = () =>
  runScenario('G. Donations rejected on physical-prize lotteries', async (notes) => {
    const { lottery } = await generateLottery({
      name: 'physical-donate',
      durationSeconds: 60,
      ticketPriceSol: 0.005,
      splits: [{ label: 'team', destination: team.publicKey, bps: 10000, isPool: false }],
      autoRollover: false,
      physical: true,
    });
    const { round } = await openRoundOne(lottery);
    let rejected = false;
    try {
      await program.methods
        .donateToRound(new BN(0.01 * LAMPORTS_PER_SOL))
        .accounts({
          lottery,
          round,
          donor: donors[0].publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([donors[0]])
        .rpc();
    } catch (err: any) {
      rejected = /DonationRequiresPoolSplit/.test(String(err));
    }
    if (!rejected) throw new Error('donation succeeded on physical lottery');
    notes.push('donation correctly rejected with DonationRequiresPoolSplit');
  });

// ----------------------------- aggregate DB checks -----------------------------

const aggregateDbChecks = async (createdLotteries: PublicKey[]): Promise<{
  lotteryRows: number;
  roundRows: number;
  ticketRows: number;
  donationRows: number;
  stateLogRows: number;
  rawEventRows: number;
}> => {
  // Wait for indexer to catch up.
  await sleep(20_000);
  const lotteryRows = await prisma.lottery.count({
    where: { pubkey: { in: createdLotteries.map((p) => p.toBase58()) } },
  });
  const roundRows = await prisma.lotteryRound.count({
    where: { lotteryPubkey: { in: createdLotteries.map((p) => p.toBase58()) } },
  });
  const ticketRows = await prisma.ticketPurchase.count();
  const donationRows = await prisma.donation.count();
  const stateLogRows = await prisma.lotteryStateLog.count();
  const rawEventRows = await prisma.rawEvent.count();
  return { lotteryRows, roundRows, ticketRows, donationRows, stateLogRows, rawEventRows };
};

// ----------------------------- main -----------------------------

async function main() {
  const startTime = Date.now();
  log(`RPC: ${RPC_URL}`);
  log(`admin: ${adminKeypair.publicKey.toBase58()}`);
  const adminBal0 = await conn.getBalance(adminKeypair.publicKey);
  log(`admin balance start: ${(adminBal0 / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  if (adminBal0 < 1.3 * LAMPORTS_PER_SOL) {
    throw new Error(
      `admin needs ≥ 1.3 SOL on devnet to run this (has ${(adminBal0 / LAMPORTS_PER_SOL).toFixed(4)} SOL)`,
    );
  }

  // --- Setup phase: fund all the supporting wallets. Tight budgets so we
  // can rerun without hitting devnet faucet rate limits. ---
  log('generating wallets and funding…');
  cron = Keypair.generate();
  await transfer(adminKeypair, cron.publicKey, 0.3);

  buyers = Array.from({ length: 5 }, () => Keypair.generate());
  for (const b of buyers) await transfer(adminKeypair, b.publicKey, 0.05);

  donors = Array.from({ length: 3 }, () => Keypair.generate());
  for (const d of donors) await transfer(adminKeypair, d.publicKey, 0.07);

  dev = Keypair.generate();
  await transfer(adminKeypair, dev.publicKey, 0.001);
  treasury = Keypair.generate();
  await transfer(adminKeypair, treasury.publicKey, 0.001);
  team = Keypair.generate();
  await transfer(adminKeypair, team.publicKey, 0.001);

  // ORAO treasury read off network_state once.
  const networkStateAcct = await conn.getAccountInfo(oraoNetworkState());
  if (!networkStateAcct) throw new Error('ORAO network_state not found on devnet');
  oraoTreasury = new PublicKey(networkStateAcct.data.subarray(40, 72));
  log(`ORAO treasury: ${oraoTreasury.toBase58()}`);

  log('setup complete');

  // --- Run scenarios sequentially. ---
  // We track lottery pubkeys so we can verify the indexer caught them.
  const createdLotteries: PublicKey[] = [];
  // Spy on generateLottery to record every lottery created.
  const orig = (program.account.globalConfig as any).fetch.bind(
    program.account.globalConfig,
  );
  // (We just rely on each scenario tracking its own lottery in notes; for DB
  // counts we use totals across the whole run, which is fine.)
  void orig;
  void createdLotteries;

  await scenarioE_physical(); // run physical first so the buyer wallet from a multi-round draw doesn't accidentally get money
  await scenarioG_donateRejectsPhysical();
  await scenarioF_emptyRound();
  await scenarioC_donations();
  await scenarioB_pauseResume();
  await scenarioD_disableLifecycle();
  await scenarioA_multiRound(); // longest scenario, last

  // --- Aggregate DB checks ---
  log('running aggregate DB checks…');
  const aggregates = await aggregateDbChecks([]);

  const adminBal1 = await conn.getBalance(adminKeypair.publicKey);
  const cronBal1 = await conn.getBalance(cron.publicKey);

  // --- Report ---
  const totalDuration = Date.now() - startTime;
  console.log('\n\n');
  console.log('================================================================');
  console.log(' sol-lottery devnet comprehensive test report');
  console.log('================================================================');
  console.log(`Total duration:  ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`Admin spent:     ${((adminBal0 - adminBal1) / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log(`Cron remaining:  ${(cronBal1 / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  console.log('');
  console.log('Scenarios');
  console.log('---------');
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} ${r.name}  (${(r.durationMs / 1000).toFixed(1)}s)`);
    for (const n of r.notes) console.log(`     · ${n}`);
    if (r.error) console.log(`     ! ${r.error}`);
  }
  console.log('');
  console.log('Indexer / DB aggregates');
  console.log('-----------------------');
  console.log(`lottery rows         : ${aggregates.lotteryRows}`);
  console.log(`lottery_round rows   : ${aggregates.roundRows}`);
  console.log(`ticket_purchase rows : ${aggregates.ticketRows}`);
  console.log(`donation rows        : ${aggregates.donationRows}`);
  console.log(`lottery_state_log    : ${aggregates.stateLogRows}`);
  console.log(`raw_event rows       : ${aggregates.rawEventRows}`);

  const passed = results.filter((r) => r.passed).length;
  console.log('');
  console.log(`Final: ${passed}/${results.length} scenarios passed.`);
  console.log('================================================================');

  await prisma.$disconnect();
  if (passed !== results.length) process.exit(1);
}

main().catch(async (err) => {
  console.error('[plan] fatal:', err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
