'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

export interface LotterySnapshot {
  lottery: {
    pubkey: string;
    lotteryIndex: string;
    name: string;
    state: 'active' | 'paused' | 'pendingDisable' | 'disabled';
    prizeKind: 'sol' | 'physical';
    ticketPriceLamports: string;
    durationSeconds: string;
    autoRollover: boolean;
  };
  round: {
    pubkey: string;
    index: string;
    state: 'open' | 'closed' | 'awaitingVrf' | 'resolved';
    startedAt: number;
    durationSeconds: number;
    pausedTotalSeconds: number;
    effectiveEndUnix: number;
    ticketsSold: string;
    donatedLamports: string;
    currentShardIndex: number;
    poolLamports: string;
  };
}

/**
 * Polls the active lottery snapshot every 5s. When the lottery or round
 * state transitions (e.g. active→paused, open→awaitingVrf), we trigger
 * `router.refresh()` so the SSR-rendered page sections (banner, controls)
 * pick up the new state without forcing the user to F5.
 *
 * Other components (PoolDisplay, etc.) read from this same query via
 * react-query's cache, so they stay in lock-step.
 */
export function useLotterySnapshot(initial: LotterySnapshot | null) {
  const router = useRouter();
  const prevState = useRef<string | null>(initial ? stateKey(initial) : null);

  const query = useQuery<{ snapshot: LotterySnapshot | null }>({
    queryKey: ['lottery', 'snapshot'],
    queryFn: async () => {
      const res = await fetch('/api/lottery/snapshot');
      if (!res.ok) throw new Error('snapshot fetch failed');
      return res.json();
    },
    initialData: { snapshot: initial },
    // Poll fast (~1.5s) once the round has aged out or moved into the
    // resolution pipeline — that's when the user is waiting for the new
    // round to appear. Steady-state polling stays at 5s.
    refetchInterval: (q) => {
      const s = q.state.data?.snapshot ?? null;
      if (!s) return 5_000;
      const nowSec = Math.floor(Date.now() / 1000);
      const inResolveWindow =
        s.round.state === 'closed' ||
        s.round.state === 'awaitingVrf' ||
        s.round.state === 'resolved' ||
        (s.round.state === 'open' && s.round.effectiveEndUnix <= nowSec);
      return inResolveWindow ? 1_500 : 5_000;
    },
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const next = query.data?.snapshot ? stateKey(query.data.snapshot) : null;
    if (next !== prevState.current) {
      prevState.current = next;
      // Only refresh on transitions to/from active states — avoids spamming
      // the server when nothing material changed.
      router.refresh();
    }
  }, [query.data, router]);

  return query;
}

const stateKey = (s: LotterySnapshot) => `${s.lottery.state}|${s.round.state}`;
