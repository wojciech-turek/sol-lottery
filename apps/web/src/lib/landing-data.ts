import 'server-only';

import { prisma } from '@sol-lottery/db';

import { getServerProgram } from '@/lib/chain/server';
import { PublicKey } from '@solana/web3.js';

export interface SerializedWinner {
  roundPubkey: string;
  winner: string;
  poolAmountLamports: string;
  resolvedAt: string;
}
export interface SerializedActivity {
  txSignature: string;
  buyer: string;
  quantity: string;
  at: string;
}
export interface SerializedTickets {
  total: number;
  yours: number;
  players: number;
}

/**
 * Pre-renders every piece of data the landing islands need so the page
 * paints with real content instead of empty placeholders. The polled
 * react-query refetches run on top of these as `initialData`.
 *
 * Everything except the pool balance lives in Postgres (indexer-written
 * rows) which keeps the SSR work cheap — Solana RPC is only touched for
 * the round vault balance.
 */
export async function fetchLandingInitial(
  roundPubkey: string,
  viewerPubkey: string | null,
): Promise<{
  winners: SerializedWinner[];
  activity: SerializedActivity[];
  tickets: SerializedTickets;
  poolLamports: string;
}> {
  const [winnerRows, activityRows, ticketRows, viewerCount, players, pool] =
    await Promise.all([
      prisma.lotteryRound.findMany({
        where: { winner: { not: null }, resolvedAt: { not: null } },
        orderBy: { resolvedAt: 'desc' },
        take: 5,
        select: {
          pubkey: true,
          winner: true,
          poolAmountLamports: true,
          resolvedAt: true,
        },
      }),
      prisma.ticketPurchase.findMany({
        orderBy: { at: 'desc' },
        take: 10,
        select: { txSignature: true, buyer: true, quantity: true, at: true },
      }),
      prisma.ticketPurchase.aggregate({
        where: { roundPubkey },
        _sum: { quantity: true },
      }),
      viewerPubkey
        ? prisma.ticketPurchase.aggregate({
            where: { roundPubkey, buyer: viewerPubkey },
            _sum: { quantity: true },
          })
        : Promise.resolve(null),
      prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT COUNT(DISTINCT buyer) AS n
        FROM ticket_purchase
        WHERE round_pubkey = ${roundPubkey}
      `,
      (async () => {
        const { connection } = getServerProgram();
        const info = await connection.getAccountInfo(new PublicKey(roundPubkey));
        if (!info) return '0';
        const rent = await connection.getMinimumBalanceForRentExemption(
          info.data.length,
        );
        return String(Math.max(0, info.lamports - rent));
      })(),
    ]);

  return {
    winners: winnerRows.map((r) => ({
      roundPubkey: r.pubkey,
      winner: r.winner!,
      poolAmountLamports: (r.poolAmountLamports ?? 0n).toString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? new Date(0).toISOString(),
    })),
    activity: activityRows.map((r) => ({
      txSignature: r.txSignature,
      buyer: r.buyer,
      quantity: r.quantity.toString(),
      at: r.at.toISOString(),
    })),
    tickets: {
      total: Number(ticketRows._sum.quantity ?? 0n),
      yours: Number(viewerCount?._sum.quantity ?? 0n),
      players: Number(players[0]?.n ?? 0n),
    },
    poolLamports: pool,
  };
}
