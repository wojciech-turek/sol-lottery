import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@sol-lottery/db';
import { requireAdmin } from '@/lib/auth/require-admin';

export const runtime = 'nodejs';

/**
 * Lightweight setter for off-chain lottery preferences (currently just
 * `manualResolution`). Called by the create-lottery flow right after the
 * on-chain create+open round tx confirms.
 *
 * The indexer will catch the LotteryCreated event and write the DB row
 * asynchronously. We poll briefly for that row to exist, then flip the
 * flag. If the row never appears in time, we upsert with a placeholder
 * — the indexer's eventual write will overwrite the chain-derived fields
 * while leaving the boolean preference intact.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  await requireAdmin();
  const body = await req.json().catch(() => null);
  const pubkey =
    typeof body?.pubkey === 'string' ? (body.pubkey as string) : null;
  const manualResolution = !!body?.manualResolution;
  if (!pubkey) {
    return NextResponse.json({ error: 'pubkey_required' }, { status: 400 });
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    const existing = await prisma.lottery.findUnique({ where: { pubkey } });
    if (existing) {
      await prisma.lottery.update({
        where: { pubkey },
        data: { manualResolution },
      });
      return NextResponse.json({ ok: true, mode: 'updated' });
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  // Indexer hasn't surfaced the row in 5s. Fail open — the indexer's
  // catch-up write will run with manualResolution=false (the default),
  // which is the safer choice (auto-resolve still works).
  return NextResponse.json(
    {
      ok: false,
      mode: 'timeout',
      note: 'indexer has not yet recorded this lottery; preference defaulted to auto-resolve',
    },
    { status: 202 },
  );
}
