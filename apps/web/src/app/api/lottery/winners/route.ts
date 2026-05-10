import { NextResponse } from 'next/server';

import { prisma } from '@sol-lottery/db';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const rows = await prisma.lotteryRound.findMany({
    where: { winner: { not: null }, resolvedAt: { not: null } },
    orderBy: { resolvedAt: 'desc' },
    take: 5,
    select: {
      pubkey: true,
      winner: true,
      poolAmountLamports: true,
      resolvedAt: true,
    },
  });
  return NextResponse.json({
    winners: rows.map((r) => ({
      roundPubkey: r.pubkey,
      winner: r.winner!,
      poolAmountLamports: (r.poolAmountLamports ?? 0n).toString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? new Date(0).toISOString(),
    })),
  });
}
