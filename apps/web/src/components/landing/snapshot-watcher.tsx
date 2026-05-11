'use client';

import { useLotteryRealtime } from '@/hooks/use-lottery-snapshot';

/**
 * Mounts the Supabase Realtime subscription that keeps every `useLottery()`
 * consumer in sync with the indexer-written DB state. Renders nothing.
 */
export function LotteryRealtime(): null {
  useLotteryRealtime();
  return null;
}
