import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';

import { getServerProgram } from '@/lib/chain/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const round = req.nextUrl.searchParams.get('round');
  if (!round) return NextResponse.json({ error: 'round_required' }, { status: 400 });
  const pubkey = (() => {
    try {
      return new PublicKey(round);
    } catch {
      return null;
    }
  })();
  if (!pubkey) return NextResponse.json({ error: 'invalid_round' }, { status: 400 });

  const { connection } = getServerProgram();
  const info = await connection.getAccountInfo(pubkey);
  if (!info) return NextResponse.json({ poolLamports: '0' });
  const rentReserve = await connection.getMinimumBalanceForRentExemption(
    info.data.length,
  );
  const pool = Math.max(0, info.lamports - rentReserve);
  return NextResponse.json({ poolLamports: pool.toString() });
}
