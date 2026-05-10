import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@sol-lottery/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const round = req.nextUrl.searchParams.get('round');
  const buyer = req.nextUrl.searchParams.get('buyer');
  if (!round) return NextResponse.json({ error: 'round_required' }, { status: 400 });

  const [totalAgg, mineAgg, players] = await Promise.all([
    prisma.ticketPurchase.aggregate({
      where: { roundPubkey: round },
      _sum: { quantity: true },
    }),
    buyer
      ? prisma.ticketPurchase.aggregate({
          where: { roundPubkey: round, buyer },
          _sum: { quantity: true },
        })
      : Promise.resolve({ _sum: { quantity: null } as { quantity: bigint | null } }),
    prisma.ticketPurchase
      .findMany({
        where: { roundPubkey: round },
        select: { buyer: true },
        distinct: ['buyer'],
      })
      .then((rows) => rows.length),
  ]);

  return NextResponse.json({
    total: Number(totalAgg._sum.quantity ?? 0n),
    yours: Number(mineAgg._sum.quantity ?? 0n),
    players,
  });
}
