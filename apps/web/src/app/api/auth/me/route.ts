import { NextResponse } from 'next/server';

import { prisma } from '@sol-lottery/db';

import { getCurrentSession } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ authenticated: false });

  const user = await prisma.user.findUnique({
    where: { pubkey: session.pubkey },
    select: { pubkey: true, isAdmin: true },
  });
  if (!user) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({
    authenticated: true,
    pubkey: user.pubkey,
    isAdmin: user.isAdmin,
  });
}
