/**
 * Server-side Solana RPC helpers. Use these from RSCs and route handlers.
 *
 * The "wallet" passed into `createProgram` is a no-op stub — we only do
 * reads on the server; the actual signing always happens client-side
 * with a real wallet adapter.
 */
import 'server-only';

import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  createProgram,
  unpackAsciiBytes,
  type LotteryProgram,
} from '@sol-lottery/sdk';

import { clientEnv } from '../env';

const STUB_WALLET: Wallet = {
  publicKey: new PublicKey('11111111111111111111111111111111'),
  signTransaction: async (tx) => tx,
  signAllTransactions: async (txs) => txs,
  payer: Keypair.generate(),
};

let cached: { connection: Connection; program: LotteryProgram } | null = null;

export const getServerProgram = (): {
  connection: Connection;
  program: LotteryProgram;
} => {
  if (cached) return cached;
  const connection = new Connection(clientEnv.NEXT_PUBLIC_SOLANA_RPC, 'confirmed');
  const program = createProgram(connection, STUB_WALLET);
  cached = { connection, program };
  return cached;
};

export interface CurrentLotterySnapshot {
  lottery: PublicKey;
  lotteryIndex: bigint;
  name: string;
  state: 'active' | 'paused' | 'pendingDisable' | 'disabled';
  prizeKind: 'sol' | 'physical';
  ticketPriceLamports: bigint;
  durationSeconds: bigint;
  autoRollover: boolean;
  splits: Array<{
    label: string;
    destination: string;
    bps: number;
    isPool: boolean;
  }>;
  currentRoundIndex: bigint;
  totalRoundsResolved: bigint;
  totalTicketsSold: bigint;
}

export interface CurrentRoundSnapshot {
  round: PublicKey;
  index: bigint;
  state: 'open' | 'closed' | 'awaitingVrf' | 'resolved';
  startedAt: number;
  durationSeconds: number;
  pausedTotalSeconds: number;
  effectiveEndUnix: number;
  ticketPriceLamports: bigint;
  ticketsSold: bigint;
  donatedLamports: bigint;
  currentShardIndex: number;
  poolLamports: bigint;
  rentReserveLamports: bigint;
}

const enumKey = (raw: object): string => Object.keys(raw)[0];

export interface LotteryListItem {
  lottery: CurrentLotterySnapshot;
  round: CurrentRoundSnapshot | null;
}

// In-process snapshot cache. Server components fire on every navigation,
// the snapshot watcher polls every 5s, and the admin page joins on a
// chain read too — without this we hammer devnet's public RPC into a
// 429 spiral. TTL is short enough that admin actions (pause/resume) feel
// snappy and long enough that polling is cheap.
const SNAPSHOT_CACHE_TTL_MS = 4_000;
const lotteryFetchCache = new Map<
  string,
  { at: number; data: LotteryListItem | null }
>();

const lotteryItemFromAccount = (
  publicKey: PublicKey,
  account: any,
): CurrentLotterySnapshot => {
  const splits = (account.splits as any[]).map((s) => ({
    label: unpackAsciiBytes(s.label),
    destination: (s.destination as PublicKey).toBase58(),
    bps: s.bps as number,
    isPool: s.isPool as boolean,
  }));
  return {
    lottery: publicKey,
    lotteryIndex: BigInt(account.id.toString()),
    name: unpackAsciiBytes(account.name),
    state: enumKey(account.state) as CurrentLotterySnapshot['state'],
    prizeKind: enumKey(account.prizeKind) as CurrentLotterySnapshot['prizeKind'],
    ticketPriceLamports: BigInt(account.ticketPriceLamports.toString()),
    durationSeconds: BigInt(account.roundDurationSeconds.toString()),
    autoRollover: !!account.autoRollover,
    splits,
    currentRoundIndex: BigInt(account.currentRoundIndex.toString()),
    totalRoundsResolved: BigInt(account.totalRoundsResolved.toString()),
    totalTicketsSold: BigInt(account.totalTicketsSold.toString()),
  };
};

const fetchSingleLottery = async (
  pubkey: string,
): Promise<LotteryListItem | null> => {
  const cached = lotteryFetchCache.get(pubkey);
  if (cached && Date.now() - cached.at < SNAPSHOT_CACHE_TTL_MS) {
    return cached.data;
  }
  const { program, connection } = getServerProgram();
  const { roundPda } = await import('@sol-lottery/sdk');
  const lotteryKey = new PublicKey(pubkey);
  try {
    const account: any = await program.account.lottery.fetch(lotteryKey);
    const lottery = lotteryItemFromAccount(lotteryKey, account);
    let round: CurrentRoundSnapshot | null = null;
    if (lottery.currentRoundIndex > 0n) {
      const roundPubkey = roundPda(lotteryKey, lottery.currentRoundIndex);
      try {
        const roundAccount: any = await program.account.round.fetch(roundPubkey);
        const startedAt = Number(roundAccount.startedAt);
        const durationSeconds = Number(roundAccount.durationSeconds);
        const pausedTotalSeconds = Number(roundAccount.pausedTotalSeconds);
        const accountInfo = await connection.getAccountInfo(roundPubkey);
        const totalLamports = accountInfo?.lamports ?? 0;
        const rentReserve = accountInfo
          ? await connection.getMinimumBalanceForRentExemption(accountInfo.data.length)
          : 0;
        round = {
          round: roundPubkey,
          index: BigInt(roundAccount.index.toString()),
          state: enumKey(roundAccount.state) as CurrentRoundSnapshot['state'],
          startedAt,
          durationSeconds,
          pausedTotalSeconds,
          effectiveEndUnix: startedAt + durationSeconds + pausedTotalSeconds,
          ticketPriceLamports: BigInt(roundAccount.ticketPriceLamports.toString()),
          ticketsSold: BigInt(roundAccount.ticketsSold.toString()),
          donatedLamports: BigInt(roundAccount.donatedLamports.toString()),
          currentShardIndex: Number(roundAccount.currentShard ?? 0),
          poolLamports: BigInt(Math.max(0, totalLamports - rentReserve)),
          rentReserveLamports: BigInt(rentReserve),
        };
      } catch {
        /* round may not exist yet */
      }
    }
    const item: LotteryListItem = { lottery, round };
    lotteryFetchCache.set(pubkey, { at: Date.now(), data: item });
    return item;
  } catch {
    lotteryFetchCache.set(pubkey, { at: Date.now(), data: null });
    return null;
  }
};

/**
 * Variant that only reads the lotteries the DB knows about. Cheap
 * (one `getAccountInfo` per pubkey, cached) compared to a program-wide
 * `getProgramAccounts` scan. The admin page passes its known pubkeys.
 */
export async function fetchLotteriesByPubkey(
  pubkeys: string[],
): Promise<LotteryListItem[]> {
  if (pubkeys.length === 0) return [];
  const results = await Promise.all(pubkeys.map((pk) => fetchSingleLottery(pk)));
  return results
    .filter((x): x is LotteryListItem => x !== null)
    .sort((a, b) => Number(b.lottery.lotteryIndex - a.lottery.lotteryIndex));
}

/**
 * Fetches every lottery on chain (any state) and, for each, the current
 * round snapshot. Heavy — only call from admin contexts that don't
 * already have a DB-derived pubkey list.
 */
export async function fetchAllLotteries(): Promise<LotteryListItem[]> {
  const { program, connection } = getServerProgram();
  const all = await program.account.lottery.all();
  const { roundPda } = await import('@sol-lottery/sdk');
  const items: LotteryListItem[] = [];
  for (const entry of all) {
    const account: any = entry.account;
    const splits = (account.splits as any[]).map((s) => ({
      label: unpackAsciiBytes(s.label),
      destination: (s.destination as PublicKey).toBase58(),
      bps: s.bps as number,
      isPool: s.isPool as boolean,
    }));
    const lottery: CurrentLotterySnapshot = {
      lottery: entry.publicKey,
      lotteryIndex: BigInt(account.id.toString()),
      name: unpackAsciiBytes(account.name),
      state: enumKey(account.state) as CurrentLotterySnapshot['state'],
      prizeKind: enumKey(account.prizeKind) as CurrentLotterySnapshot['prizeKind'],
      ticketPriceLamports: BigInt(account.ticketPriceLamports.toString()),
      durationSeconds: BigInt(account.roundDurationSeconds.toString()),
      autoRollover: !!account.autoRollover,
      splits,
      currentRoundIndex: BigInt(account.currentRoundIndex.toString()),
      totalRoundsResolved: BigInt(account.totalRoundsResolved.toString()),
      totalTicketsSold: BigInt(account.totalTicketsSold.toString()),
    };
    let round: CurrentRoundSnapshot | null = null;
    if (lottery.currentRoundIndex > 0n) {
      try {
        const roundPubkey = roundPda(entry.publicKey, lottery.currentRoundIndex);
        const roundAccount: any = await program.account.round.fetch(roundPubkey);
        const startedAt = Number(roundAccount.startedAt);
        const durationSeconds = Number(roundAccount.durationSeconds);
        const pausedTotalSeconds = Number(roundAccount.pausedTotalSeconds);
        const accountInfo = await connection.getAccountInfo(roundPubkey);
        const totalLamports = accountInfo?.lamports ?? 0;
        const rentReserve = accountInfo
          ? await connection.getMinimumBalanceForRentExemption(
              accountInfo.data.length,
            )
          : 0;
        round = {
          round: roundPubkey,
          index: BigInt(roundAccount.index.toString()),
          state: enumKey(roundAccount.state) as CurrentRoundSnapshot['state'],
          startedAt,
          durationSeconds,
          pausedTotalSeconds,
          effectiveEndUnix: startedAt + durationSeconds + pausedTotalSeconds,
          ticketPriceLamports: BigInt(roundAccount.ticketPriceLamports.toString()),
          ticketsSold: BigInt(roundAccount.ticketsSold.toString()),
          donatedLamports: BigInt(roundAccount.donatedLamports.toString()),
          currentShardIndex: Number(roundAccount.currentShard ?? 0),
          poolLamports: BigInt(Math.max(0, totalLamports - rentReserve)),
          rentReserveLamports: BigInt(rentReserve),
        };
      } catch {
        // Round account may have been closed.
      }
    }
    items.push({ lottery, round });
  }
  // Sort by id desc — newest first.
  items.sort((a, b) => Number(b.lottery.lotteryIndex - a.lottery.lotteryIndex));
  return items;
}

/**
 * Returns the single most-recent lottery whose state is Active or
 * PendingDisable (i.e. still has an in-flight round). Returns null when
 * no such lottery exists.
 *
 * Gated on the lottery also being present in our Postgres index, so
 * leftover chain accounts from earlier test runs (which we may have
 * wiped from the DB) don't surface on the landing page.
 */
export async function fetchActiveLottery(): Promise<{
  lottery: CurrentLotterySnapshot;
  round: CurrentRoundSnapshot;
} | null> {
  const { prisma } = await import('@sol-lottery/db');
  // Paused / pendingDisable still represent a "current" lottery — only
  // DISABLED falls through to the empty state. DB is authoritative for
  // which lotteries we know about, so we ask it for the most recent
  // candidate and then make a single, cached, per-pubkey chain fetch.
  const rows = await prisma.lottery.findMany({
    where: { state: { in: ['ACTIVE', 'PAUSED', 'PENDING_DISABLE'] } },
    orderBy: { lotteryIndex: 'desc' },
    select: { pubkey: true },
  });
  for (const row of rows) {
    const item = await fetchSingleLottery(row.pubkey);
    if (
      item &&
      item.round &&
      (item.lottery.state === 'active' ||
        item.lottery.state === 'paused' ||
        item.lottery.state === 'pendingDisable')
    ) {
      return { lottery: item.lottery, round: item.round };
    }
  }
  return null;
}
