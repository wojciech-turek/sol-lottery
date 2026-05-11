'use client';

import {
  useLotterySnapshot,
  type LotterySnapshot,
} from '@/hooks/use-lottery-snapshot';

/**
 * Mounts the `useLotterySnapshot` query so the landing page stays in
 * sync with on-chain state without a manual refresh. Renders nothing —
 * its sole job is to feed the react-query cache and trigger
 * `router.refresh()` when state transitions.
 */
export function SnapshotWatcher({
  initial,
}: {
  initial: LotterySnapshot | null;
}) {
  useLotterySnapshot(initial);
  return null;
}
