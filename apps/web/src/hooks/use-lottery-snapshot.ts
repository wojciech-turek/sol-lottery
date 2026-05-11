'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { getBrowserSupabase } from '@/lib/supabase/client';

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
    poolBps: number;
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

export interface SnapshotResponse {
  snapshot: LotterySnapshot | null;
}

export const SNAPSHOT_KEY = ['lottery', 'snapshot'] as const;

const snapshotQueryOptions = {
  queryKey: SNAPSHOT_KEY,
  queryFn: async (): Promise<SnapshotResponse> => {
    const res = await fetch('/api/lottery/snapshot');
    if (!res.ok) throw new Error('snapshot fetch failed');
    return res.json();
  },
  staleTime: Infinity,
  refetchOnWindowFocus: false,
} as const;

/**
 * Read hook — returns the latest snapshot from the React Query cache and
 * triggers the initial fetch on first mount. Safe to call from many
 * components: React Query dedupes by key.
 *
 * The Realtime subscription that keeps this cache fresh lives in
 * <LotteryRealtime />, mounted once at the page root.
 */
export function useLottery(): {
  data: LotterySnapshot | null;
  isLoading: boolean;
  error: unknown;
} {
  const query = useQuery<SnapshotResponse>(snapshotQueryOptions);
  return {
    data: query.data?.snapshot ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Mount this once at the top of the page. Subscribes to Supabase Realtime
 * on `lottery` and `lottery_round`. Any row change broadly invalidates
 * `['lottery']` queries (snapshot, pool, tickets, winners, activity), which
 * fans out into a single refetch wave. No polling, no `router.refresh()`.
 */
export function useLotteryRealtime(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const supabase = getBrowserSupabase();
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ['lottery'] });
    };
    const channel = supabase
      .channel('lottery-state')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lottery' },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lottery_round' },
        invalidate,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
