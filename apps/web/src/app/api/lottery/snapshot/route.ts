import { NextResponse } from 'next/server';

import { fetchActiveLottery } from '@/lib/chain/server';

export const runtime = 'nodejs';

/**
 * Live snapshot of the currently-active lottery + its open round.
 * Mirrors what the home page server-renders, but as JSON so client
 * components can subscribe to state changes (paused, resolved, …)
 * without a full page reload.
 */
export async function GET(): Promise<NextResponse> {
  const snapshot = await fetchActiveLottery().catch(() => null);
  if (!snapshot) return NextResponse.json({ snapshot: null });
  const { lottery, round } = snapshot;
  return NextResponse.json({
    snapshot: {
      lottery: {
        pubkey: lottery.lottery.toBase58(),
        lotteryIndex: lottery.lotteryIndex.toString(),
        name: lottery.name,
        state: lottery.state,
        prizeKind: lottery.prizeKind,
        ticketPriceLamports: lottery.ticketPriceLamports.toString(),
        durationSeconds: lottery.durationSeconds.toString(),
        autoRollover: lottery.autoRollover,
      },
      round: {
        pubkey: round.round.toBase58(),
        index: round.index.toString(),
        state: round.state,
        startedAt: round.startedAt,
        durationSeconds: round.durationSeconds,
        pausedTotalSeconds: round.pausedTotalSeconds,
        effectiveEndUnix: round.effectiveEndUnix,
        ticketsSold: round.ticketsSold.toString(),
        donatedLamports: round.donatedLamports.toString(),
        currentShardIndex: round.currentShardIndex,
        poolLamports: round.poolLamports.toString(),
      },
    },
  });
}
