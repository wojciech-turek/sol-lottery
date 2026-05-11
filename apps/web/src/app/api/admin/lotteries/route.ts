import { NextResponse } from 'next/server';

import { prisma } from '@sol-lottery/db';

import { verifyAdmin } from '@/lib/auth/require-admin';
import { getLotterySplits } from '@/lib/chain/lottery-config';
import {
  LOTTERY_STATE_MAP,
  PRIZE_KIND_MAP,
  ROUND_STATE_MAP,
} from '@/lib/db-enums';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Full admin payload — every lottery the indexer knows about, with its
 * current round, aggregate metrics, recent winners, and state-change log.
 * Mirrors the shape the old SSR admin page composed from chain reads.
 *
 * Reads come exclusively from Postgres (Prisma). Splits are the one piece
 * not mirrored in DB; we resolve them from the lazy per-process cache that
 * does a single chain read per lottery, ever.
 */
export async function GET(): Promise<NextResponse> {
  const admin = await verifyAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const lotteries = await prisma.lottery.findMany({
    orderBy: { lotteryIndex: 'desc' },
    include: {
      rounds: { orderBy: { index: 'desc' }, take: 1 },
    },
  });
  const lotteryPubkeys = lotteries.map((l) => l.pubkey);

  if (lotteryPubkeys.length === 0) {
    return NextResponse.json({ lotteries: [] });
  }

  const [resolvedAggByLottery, distinctPlayersByLottery, recentWinners, recentStateLogs, ticketsAggByLottery, resolvedCountByLottery] =
    await Promise.all([
      prisma.lotteryRound.groupBy({
        by: ['lotteryPubkey'],
        where: { lotteryPubkey: { in: lotteryPubkeys } },
        _sum: { totalDistributedLamports: true, poolAmountLamports: true },
      }),
      prisma.$queryRaw<Array<{ lottery_pubkey: string; n: bigint }>>`
        SELECT lr.lottery_pubkey, COUNT(DISTINCT tp.buyer) AS n
        FROM ticket_purchase tp
        JOIN lottery_round lr ON lr.pubkey = tp.round_pubkey
        WHERE lr.lottery_pubkey = ANY(${lotteryPubkeys})
        GROUP BY lr.lottery_pubkey
      `,
      prisma.lotteryRound.findMany({
        where: {
          lotteryPubkey: { in: lotteryPubkeys },
          winner: { not: null },
        },
        orderBy: { resolvedAt: 'desc' },
        take: 50,
        select: {
          pubkey: true,
          lotteryPubkey: true,
          winner: true,
          poolAmountLamports: true,
          resolvedAt: true,
        },
      }),
      prisma.lotteryStateLog.findMany({
        where: { lotteryPubkey: { in: lotteryPubkeys } },
        orderBy: { at: 'desc' },
        take: 100,
        select: {
          id: true,
          lotteryPubkey: true,
          previousState: true,
          newState: true,
          at: true,
          txSignature: true,
        },
      }),
      prisma.lotteryRound.groupBy({
        by: ['lotteryPubkey'],
        where: { lotteryPubkey: { in: lotteryPubkeys } },
        _sum: { ticketsSold: true },
      }),
      prisma.lotteryRound.groupBy({
        by: ['lotteryPubkey'],
        where: {
          lotteryPubkey: { in: lotteryPubkeys },
          state: 'RESOLVED',
        },
        _count: { _all: true },
      }),
    ]);

  // Resolve splits in parallel — first call per pubkey hits chain once,
  // subsequent calls hit the in-process cache.
  const splitsByLottery = new Map(
    await Promise.all(
      lotteryPubkeys.map(
        async (pk) =>
          [pk, await getLotterySplits(pk).catch(() => [])] as const,
      ),
    ),
  );

  const tabs = lotteries.map((l) => {
    const round = l.rounds[0] ?? null;
    const agg = resolvedAggByLottery.find((r) => r.lotteryPubkey === l.pubkey);
    const distributed = BigInt(agg?._sum.totalDistributedLamports?.toString() ?? '0');
    const pool = BigInt(agg?._sum.poolAmountLamports?.toString() ?? '0');
    const players =
      distinctPlayersByLottery.find((r) => r.lottery_pubkey === l.pubkey)?.n ?? 0n;
    const totalTickets = ticketsAggByLottery.find(
      (r) => r.lotteryPubkey === l.pubkey,
    );
    const resolvedCount = resolvedCountByLottery.find(
      (r) => r.lotteryPubkey === l.pubkey,
    );
    const splits = splitsByLottery.get(l.pubkey) ?? [];

    const livePool = round
      ? round.ticketsSold * round.ticketPriceLamports + round.donatedLamports
      : 0n;
    const roundPool = round
      ? (round.poolAmountLamports ?? livePool)
      : 0n;

    return {
      lottery: {
        pubkey: l.pubkey,
        lotteryIndex: l.lotteryIndex.toString(),
        name: l.name,
        state: LOTTERY_STATE_MAP[l.state],
        prizeKind: PRIZE_KIND_MAP[l.prizeKind],
        ticketPriceLamports: l.ticketPriceLamports.toString(),
        durationSeconds: l.durationSeconds.toString(),
        autoRollover: l.autoRollover,
        splits,
        currentRoundIndex: round?.index.toString() ?? '0',
        totalRoundsResolved: (resolvedCount?._count._all ?? 0).toString(),
        totalTicketsSold: (totalTickets?._sum.ticketsSold ?? 0n).toString(),
      },
      round: round
        ? {
            pubkey: round.pubkey,
            index: round.index.toString(),
            state: ROUND_STATE_MAP[round.state],
            startedAt: Math.floor(round.startedAt.getTime() / 1000),
            durationSeconds: Number(round.durationSeconds),
            pausedTotalSeconds: Number(round.pausedTotalSeconds),
            effectiveEndUnix: Math.floor(round.effectiveEnd.getTime() / 1000),
            ticketPriceLamports: round.ticketPriceLamports.toString(),
            ticketsSold: round.ticketsSold.toString(),
            donatedLamports: round.donatedLamports.toString(),
            currentShardIndex: round.currentShardIndex,
            poolLamports: roundPool.toString(),
          }
        : null,
      metrics: {
        players: Number(players),
        volumeLamports: distributed.toString(),
        feesLamports: (distributed - pool).toString(),
      },
      winners: recentWinners
        .filter((w) => w.lotteryPubkey === l.pubkey)
        .slice(0, 10)
        .map((w) => ({
          roundPubkey: w.pubkey,
          winner: w.winner ?? '',
          poolAmountLamports: (w.poolAmountLamports ?? 0n).toString(),
          resolvedAt: w.resolvedAt?.toISOString() ?? new Date(0).toISOString(),
        })),
      alerts: recentStateLogs
        .filter((s) => s.lotteryPubkey === l.pubkey)
        .slice(0, 10)
        .map((s) => ({
          id: s.id,
          previous: LOTTERY_STATE_MAP[s.previousState],
          next: LOTTERY_STATE_MAP[s.newState],
          at: s.at.toISOString(),
          txSignature: s.txSignature,
        })),
    };
  });

  return NextResponse.json({ lotteries: tabs });
}
