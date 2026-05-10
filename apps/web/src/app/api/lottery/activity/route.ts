import { NextResponse } from 'next/server';

import { prisma } from '@sol-lottery/db';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const rows = await prisma.ticketPurchase.findMany({
    orderBy: { at: 'desc' },
    take: 10,
    select: { txSignature: true, buyer: true, quantity: true, at: true },
  });
  return NextResponse.json({
    activity: rows.map((r) => ({
      txSignature: r.txSignature,
      buyer: r.buyer,
      quantity: r.quantity.toString(),
      at: r.at.toISOString(),
    })),
  });
}
