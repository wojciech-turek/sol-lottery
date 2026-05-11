import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@sol-lottery/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Returns the pool balance for a specific round, read from the Prisma
 * mirror. While the round is open we synthesize it from ticket counts +
 * donations; once resolved, the program-written `poolAmountLamports`
 * field captures the prize that was actually distributed.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const round = req.nextUrl.searchParams.get('round');
  if (!round) {
    return NextResponse.json({ error: 'round_required' }, { status: 400 });
  }

  const row = await prisma.lotteryRound.findUnique({
    where: { pubkey: round },
    select: {
      ticketsSold: true,
      ticketPriceLamports: true,
      donatedLamports: true,
      poolAmountLamports: true,
    },
  });
  if (!row) return NextResponse.json({ poolLamports: '0' });

  const live = row.ticketsSold * row.ticketPriceLamports + row.donatedLamports;
  const pool = row.poolAmountLamports ?? live;
  return NextResponse.json({ poolLamports: pool.toString() });
}
