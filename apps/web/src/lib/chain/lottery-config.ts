/**
 * Lazily reads immutable lottery config (splits, etc.) from the on-chain
 * account once per server process and caches it. Splits never change for
 * a given lottery, so the cache is unbounded by design. This is the only
 * place the website touches Solana RPC for read data — everything else
 * comes from the indexer-populated Postgres tables via Prisma.
 */
import 'server-only';

import { PublicKey } from '@solana/web3.js';

import { getServerProgram } from './server';

export interface LotterySplit {
  bps: number;
  isPool: boolean;
}

const cache = new Map<string, LotterySplit[]>();
const inflight = new Map<string, Promise<LotterySplit[]>>();

export async function getLotterySplits(
  lotteryPubkey: string,
): Promise<LotterySplit[]> {
  const cached = cache.get(lotteryPubkey);
  if (cached) return cached;
  const pending = inflight.get(lotteryPubkey);
  if (pending) return pending;

  const promise = (async () => {
    const { program } = getServerProgram();
    const account = (await program.account.lottery.fetch(
      new PublicKey(lotteryPubkey),
    )) as unknown as {
      splits: Array<{ bps: number; isPool: boolean }>;
    };
    const splits: LotterySplit[] = account.splits.map((s) => ({
      bps: s.bps,
      isPool: s.isPool,
    }));
    cache.set(lotteryPubkey, splits);
    return splits;
  })();
  inflight.set(lotteryPubkey, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(lotteryPubkey);
  }
}

export function poolBpsOf(splits: LotterySplit[]): number {
  return splits.find((s) => s.isPool)?.bps ?? 0;
}
