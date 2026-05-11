import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';

import { prisma } from '@sol-lottery/db';

import { getLotterySplits, poolBpsOf } from '@/lib/chain/lottery-config';
import { getServerProgram } from '@/lib/chain/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOTTERY_STATE_MAP = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  PENDING_DISABLE: 'pendingDisable',
  DISABLED: 'disabled',
} as const;

const ROUND_STATE_MAP = {
  OPEN: 'open',
  CLOSED: 'closed',
  AWAITING_VRF: 'awaitingVrf',
  RESOLVED: 'resolved',
} as const;

/**
 * Active lottery + its current round, read entirely from the Prisma mirror
 * the indexer maintains. The Solana RPC is only touched (once, lazily,
 * cached forever) to resolve the lottery's immutable splits config —
 * everything that changes at runtime comes from the DB. Clients subscribe
 * to Supabase Realtime on the lottery / lottery_round tables and
 * invalidate this query when a row changes; no polling needed.
 */
export async function GET(): Promise<NextResponse> {
  const lottery = await prisma.lottery
    .findFirst({
      where: { state: { in: ['ACTIVE', 'PAUSED', 'PENDING_DISABLE'] } },
      orderBy: { lotteryIndex: 'desc' },
      include: {
        rounds: { orderBy: { index: 'desc' }, take: 1 },
      },
    })
    .catch((err) => {
      console.error('[api/snapshot] prisma read failed', err);
      return null;
    });

  if (!lottery || lottery.rounds.length === 0) {
    return NextResponse.json({ snapshot: null });
  }

  const round = lottery.rounds[0];
  const [splits, currentShardIndex] = await Promise.all([
    getLotterySplits(lottery.pubkey).catch((err) => {
      console.error('[api/snapshot] splits read failed', err);
      return [];
    }),
    // currentShardIndex isn't mirrored in Postgres (indexer doesn't capture
    // shard rotations yet), so we fetch the live round account for this
    // single field. Buys depend on it to derive the correct shard PDA. This
    // is the one chain read per snapshot request and runs only on Realtime
    // invalidations + initial mount, not on a polling cadence.
    (async () => {
      try {
        const { program } = getServerProgram();
        const account = (await program.account.round.fetch(
          new PublicKey(round.pubkey),
        )) as unknown as { currentShardIndex: number };
        return Number(account.currentShardIndex ?? 0);
      } catch (err) {
        console.error('[api/snapshot] shard read failed', err);
        return 0;
      }
    })(),
  ]);

  // Pool while the round is live = tickets * price + donations.
  // Once resolved, the program writes the authoritative figure into
  // pool_amount_lamports, which captures the actual prize delivered.
  const livePool =
    round.ticketsSold * round.ticketPriceLamports + round.donatedLamports;
  const poolLamports = round.poolAmountLamports ?? livePool;

  return NextResponse.json({
    snapshot: {
      lottery: {
        pubkey: lottery.pubkey,
        lotteryIndex: lottery.lotteryIndex.toString(),
        name: lottery.name,
        state: LOTTERY_STATE_MAP[lottery.state],
        prizeKind: lottery.prizeKind === 'SOL' ? 'sol' : 'physical',
        ticketPriceLamports: lottery.ticketPriceLamports.toString(),
        durationSeconds: lottery.durationSeconds.toString(),
        autoRollover: lottery.autoRollover,
        poolBps: poolBpsOf(splits),
      },
      round: {
        pubkey: round.pubkey,
        index: round.index.toString(),
        state: ROUND_STATE_MAP[round.state],
        startedAt: Math.floor(round.startedAt.getTime() / 1000),
        durationSeconds: Number(round.durationSeconds),
        pausedTotalSeconds: Number(round.pausedTotalSeconds),
        effectiveEndUnix: Math.floor(round.effectiveEnd.getTime() / 1000),
        ticketsSold: round.ticketsSold.toString(),
        donatedLamports: round.donatedLamports.toString(),
        currentShardIndex,
        poolLamports: poolLamports.toString(),
      },
    },
  });
}
