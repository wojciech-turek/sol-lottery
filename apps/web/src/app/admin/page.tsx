import { prisma } from '@sol-lottery/db';

import { AdminTabs } from '@/components/admin/admin-tabs';
import { requireAdmin } from '@/lib/auth/require-admin';
import {
  fetchAllLotteries,
  type CurrentLotterySnapshot,
  type CurrentRoundSnapshot,
} from '@/lib/chain/server';

const serializeLottery = (l: CurrentLotterySnapshot) => ({
  pubkey: l.lottery.toBase58(),
  lotteryIndex: l.lotteryIndex.toString(),
  name: l.name,
  state: l.state,
  prizeKind: l.prizeKind,
  ticketPriceLamports: l.ticketPriceLamports.toString(),
  durationSeconds: l.durationSeconds.toString(),
  autoRollover: l.autoRollover,
  splits: l.splits,
  currentRoundIndex: l.currentRoundIndex.toString(),
});

const serializeRound = (r: CurrentRoundSnapshot) => ({
  pubkey: r.round.toBase58(),
  index: r.index.toString(),
  state: r.state,
  startedAt: r.startedAt,
  durationSeconds: r.durationSeconds,
  pausedTotalSeconds: r.pausedTotalSeconds,
  effectiveEndUnix: r.effectiveEndUnix,
  ticketPriceLamports: r.ticketPriceLamports.toString(),
  ticketsSold: r.ticketsSold.toString(),
  donatedLamports: r.donatedLamports.toString(),
  currentShardIndex: r.currentShardIndex,
  poolLamports: r.poolLamports.toString(),
});

export default async function AdminPage() {
  await requireAdmin();
  // Chain holds every lottery ever created on this program — including the
  // dozens of leftover devnet test runs. The admin panel only cares about
  // lotteries we've also indexed into Postgres, so the operator sees a
  // clean list that matches the DB-wipe + create-from-scratch flow.
  const knownPubkeys = new Set(
    (await prisma.lottery.findMany({ select: { pubkey: true } })).map(
      (r) => r.pubkey,
    ),
  );
  const items =
    knownPubkeys.size === 0
      ? []
      : (await fetchAllLotteries()).filter((i) =>
          knownPubkeys.has(i.lottery.lottery.toBase58()),
        );
  const lotteryPubkeys = items.map((i) => i.lottery.lottery.toBase58());

  const [resolvedAggBy, distinctPlayersByLottery, recentWinners, recentStateLogs] =
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
    ]);

  const tabs = items.map((i) => {
    const key = i.lottery.lottery.toBase58();
    const agg = resolvedAggBy.find((r) => r.lotteryPubkey === key);
    const distributed = BigInt(
      agg?._sum.totalDistributedLamports?.toString() ?? '0',
    );
    const pool = BigInt(agg?._sum.poolAmountLamports?.toString() ?? '0');
    const players =
      distinctPlayersByLottery.find((r) => r.lottery_pubkey === key)?.n ?? 0n;
    return {
      lottery: serializeLottery(i.lottery),
      round: i.round ? serializeRound(i.round) : null,
      metrics: {
        players: Number(players),
        volumeLamports: distributed.toString(),
        feesLamports: (distributed - pool).toString(),
      },
      winners: recentWinners
        .filter((w) => w.lotteryPubkey === key)
        .slice(0, 10)
        .map((w) => ({
          roundPubkey: w.pubkey,
          winner: w.winner ?? '',
          poolAmountLamports: (w.poolAmountLamports ?? 0n).toString(),
          resolvedAt: w.resolvedAt?.toISOString() ?? new Date(0).toISOString(),
        })),
      alerts: recentStateLogs
        .filter((l) => l.lotteryPubkey === key)
        .slice(0, 10)
        .map((l) => ({
          id: l.id,
          previous: l.previousState,
          next: l.newState,
          at: l.at.toISOString(),
          txSignature: l.txSignature,
        })),
    };
  });

  return <AdminTabs lotteries={tabs} />;
}
