import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@sol-lottery/db';

export const runtime = 'nodejs';

/**
 * Tiny "is this lottery indexed yet?" probe so the create-lottery flow
 * can show a "waiting for indexer" modal that disappears the moment the
 * indexer has caught up.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const pubkey = req.nextUrl.searchParams.get('pubkey');
  if (!pubkey) return NextResponse.json({ error: 'pubkey_required' }, { status: 400 });
  const row = await prisma.lottery.findUnique({
    where: { pubkey },
    select: { pubkey: true, name: true, state: true },
  });
  return NextResponse.json({ exists: !!row, lottery: row });
}
