/**
 * Lazily reads lottery splits from the on-chain account and caches per
 * lottery pubkey. Splits CAN change via `update_lottery_splits`, but
 * because we don't yet mirror them into Postgres, this cache trades
 * correctness for one chain read per lottery per server process — stale
 * values affect only the displayed winner-share and the admin config
 * form's pre-fill. The form itself reads the canonical chain value
 * before submitting so admins can't accidentally overwrite recent
 * splits changes through stale UI.
 *
 * TODO: mirror splits onto `Lottery` in Postgres (indexer LotteryCreated
 * + LotteryConfigUpdated handlers) and remove this cache entirely.
 */
import 'server-only';

import { PublicKey } from '@solana/web3.js';

import { unpackAsciiBytes } from '@sol-lottery/sdk';

import { getServerProgram } from './server';

export interface LotterySplit {
  label: string;
  destination: string;
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
      splits: Array<{
        label: Buffer | number[];
        destination: PublicKey;
        bps: number;
        isPool: boolean;
      }>;
    };
    const splits: LotterySplit[] = account.splits.map((s) => ({
      label: unpackAsciiBytes(s.label),
      destination: s.destination.toBase58(),
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
