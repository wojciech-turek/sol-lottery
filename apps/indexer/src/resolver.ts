/**
 * Auto-resolver loop.
 *
 * Every `RESOLVER_TICK_MS` (default 15s):
 *   1. Read every Lottery in DB with state ∈ {ACTIVE, PENDING_DISABLE} and
 *      manualResolution=false.
 *   2. For each, fetch the current Round on chain. If `effectiveEnd <= now`
 *      and the round still has tickets sold:
 *        a. If state == Open: send `request_orao_resolution`.
 *        b. Poll the ORAO randomness account for ≤ 120s.
 *        c. Send `consume_orao_resolution` with rollover accounts.
 *
 * Designed to be safe to run repeatedly: every step is idempotent
 * (program rejects with `VrfAlreadyRequested` / `RoundAlreadyResolved`
 * if the work is already done, which we swallow).
 */
import 'dotenv/config';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';
import { Orao } from '@orao-network/solana-vrf';
import {
  buildResolveAccounts,
  createProgram,
  globalConfigPda,
  oraoNetworkState,
  oraoRandomnessAccount,
  ORAO_PROGRAM_ID,
  roundPda,
  type LotteryProgram,
} from '@sol-lottery/sdk';
import { prisma } from '@sol-lottery/db';

const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const RESOLVER_KEYPAIR_PATH =
  process.env.RESOLVER_KEYPAIR_PATH ??
  path.join(homedir(), '.config/solana/id.json');
const TICK_MS = Number(process.env.RESOLVER_TICK_MS ?? 15_000);
const FULFILLMENT_TIMEOUT_MS = 120_000;

const enumKey = (raw: object): string => Object.keys(raw)[0] ?? '';

const oraoTreasury = async (conn: Connection): Promise<PublicKey> => {
  const networkAcct = await conn.getAccountInfo(oraoNetworkState());
  if (!networkAcct)
    throw new Error('ORAO network_state missing on this cluster');
  // NetworkState: discriminator(8) | authority(32) | treasury(32) | …
  return new PublicKey(networkAcct.data.subarray(40, 72));
};

async function tick(
  conn: Connection,
  program: LotteryProgram,
  oraoClient: Orao,
  resolver: Keypair,
  treasury: PublicKey,
): Promise<void> {
  const candidates = await prisma.lottery.findMany({
    where: {
      state: { in: ['ACTIVE', 'PENDING_DISABLE'] },
      manualResolution: false,
    },
    select: { pubkey: true, name: true },
  });

  const now = Math.floor(Date.now() / 1000);
  for (const row of candidates) {
    try {
      await resolveIfDue(conn, program, oraoClient, resolver, treasury, row, now);
    } catch (err) {
      console.error(`[resolver] ${row.pubkey} failed`, (err as Error).message);
    }
  }
}

async function resolveIfDue(
  conn: Connection,
  program: LotteryProgram,
  oraoClient: Orao,
  resolver: Keypair,
  treasury: PublicKey,
  row: { pubkey: string; name: string },
  now: number,
): Promise<void> {
  const lottery = new PublicKey(row.pubkey);
  const lotteryAcct: any = await program.account.lottery.fetch(lottery);
  const currentRoundIndex = BigInt(lotteryAcct.currentRoundIndex.toString());
  if (currentRoundIndex === 0n) return;

  const round = roundPda(lottery, currentRoundIndex);
  const roundAcct: any = await program.account.round.fetch(round);
  const roundState = enumKey(roundAcct.state);
  if (roundState === 'resolved') return;
  const ticketsSold = Number(roundAcct.ticketsSold);
  if (ticketsSold === 0) return; // empty rounds need admin's resolve_empty

  const startedAt = Number(roundAcct.startedAt);
  const durationSec = Number(roundAcct.durationSeconds);
  const pausedTotalSec = Number(roundAcct.pausedTotalSeconds);
  const effectiveEnd = startedAt + durationSec + pausedTotalSec;
  // Open rounds that haven't aged out are still taking buys; skip them.
  // awaitingVrf means request_orao already landed — fall straight through
  // to the consume polling loop below.
  if (roundState === 'open' && effectiveEnd > now) return;
  if (roundAcct.pausedAt) return; // paused rounds are off-limits

  const cfg = globalConfigPda();
  const vrfRequest = oraoRandomnessAccount(round);

  // Step 1: request_orao_resolution (skip if already requested).
  if (roundState === 'open') {
    try {
      const sig = await program.methods
        .requestOraoResolution()
        .accountsPartial({
          globalConfig: cfg,
          lottery,
          round,
          vrfRequest,
          vrfTreasury: treasury,
          vrfNetworkState: oraoNetworkState(),
          vrfProgram: ORAO_PROGRAM_ID,
          caller: resolver.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([resolver])
        .rpc();
      console.log(
        `[resolver] ${row.name} request_orao_resolution → ${sig.slice(0, 12)}…`,
      );
    } catch (err) {
      const msg = String((err as Error).message);
      if (!msg.includes('VrfAlreadyRequested') && !msg.includes('already in use'))
        throw err;
    }
  }

  // Step 2: wait for ORAO fulfillment using their TS SDK (NOT raw bytes —
  // the on-chain handler reads via `RandomnessAccountData::try_deserialize
  // .fulfilled_randomness()`, which lives at a different Borsh offset).
  const seed = round.toBytes();
  const deadline = Date.now() + FULFILLMENT_TIMEOUT_MS;
  let randomness: Buffer | null = null;
  while (Date.now() < deadline) {
    try {
      const acct = await oraoClient.getRandomness(Buffer.from(seed));
      const fulfilled = (acct as any).getFulfilledRandomness?.();
      if (fulfilled && fulfilled.length === 64) {
        randomness = Buffer.from(fulfilled);
        break;
      }
    } catch {
      /* account may not exist yet */
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  if (!randomness) {
    console.warn(`[resolver] ${row.name} fulfillment timed out — retrying next tick`);
    return;
  }

  // Auto-rollover lotteries open the next round atomically inside consume.
  // For lotteries where the operator preferred manual round-by-round control,
  // they'd have set autoRollover=false at create time.
  const lotteryAcct2: any = await program.account.lottery.fetch(lottery);
  const wantRollover =
    !!lotteryAcct2.autoRollover && enumKey(lotteryAcct2.state) === 'active';
  const resolveAccts = await buildResolveAccounts(program, round, randomness, {
    rollover: wantRollover,
  });
  try {
    const sig = await program.methods
      .consumeOraoResolution()
      .accountsPartial({
        globalConfig: cfg,
        lottery,
        round,
        vrfRequest,
        winnerShard: resolveAccts.winnerShard,
        caller: resolver.publicKey,
        nextRound: resolveAccts.nextRound,
        nextShard: resolveAccts.nextShard,
        systemProgram: resolveAccts.systemProgram,
      })
      .remainingAccounts(resolveAccts.remainingAccounts)
      .signers([resolver])
      .rpc();
    console.log(
      `[resolver] ${row.name} resolved → winner ${resolveAccts.winner.toBase58().slice(0, 8)}… sig ${sig.slice(0, 12)}…`,
    );
  } catch (err) {
    const msg = String((err as Error).message);
    if (msg.includes('RoundAlreadyResolved')) return;
    throw err;
  }
}

export async function startResolver(): Promise<void> {
  if (process.env.RESOLVER_DISABLED === '1') {
    console.log('[resolver] disabled via RESOLVER_DISABLED=1');
    return;
  }
  if (!fs.existsSync(RESOLVER_KEYPAIR_PATH)) {
    console.warn(
      `[resolver] keypair not found at ${RESOLVER_KEYPAIR_PATH} — auto-resolve disabled`,
    );
    return;
  }
  const resolver = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(RESOLVER_KEYPAIR_PATH, 'utf-8'))),
  );
  const conn = new Connection(RPC_URL, 'confirmed');
  const wallet = new Wallet(resolver);
  const program = createProgram(conn, wallet);
  const oraoProvider = new AnchorProvider(conn, wallet, {
    commitment: 'confirmed',
  });
  const oraoClient = new Orao(oraoProvider);
  const treasury = await oraoTreasury(conn);
  console.log(
    `[resolver] running every ${TICK_MS}ms with wallet ${resolver.publicKey.toBase58()}`,
  );

  // Fire and forget — `tick` handles its own errors. We deliberately
  // don't await between ticks so a slow chain query can overlap with
  // the next interval; tick is internally serial across candidates.
  const loop = async () => {
    try {
      await tick(conn, program, oraoClient, resolver, treasury);
    } catch (err) {
      console.error('[resolver] tick crash', err);
    }
  };
  await loop();
  setInterval(loop, TICK_MS);
}
