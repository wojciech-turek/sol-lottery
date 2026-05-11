/**
 * Per-round precise scheduler.
 *
 * The 15s resolver loop is the safety net. This module adds a tighter
 * feedback loop: each time a round opens (whether from indexer events or
 * the resolver's own bookkeeping), we schedule a one-shot `setTimeout`
 * at `effective_end + 1s` that fires the resolver immediately. End-to-end
 * latency for the "deadline → request_orao" hop drops from up to 14s
 * (worst case in a 15s tick) to ~1s.
 *
 * Idempotent: scheduling the same (lottery, roundIndex) twice cancels
 * the older timer first. Safe to call from many places.
 */

interface ScheduledTask {
  timer: NodeJS.Timeout;
  fireAt: number;
}

const scheduled = new Map<string, ScheduledTask>();

const keyFor = (lotteryPubkey: string, roundIndex: bigint | number): string =>
  `${lotteryPubkey}#${roundIndex.toString()}`;

/**
 * Schedule a one-shot resolver kick for a specific round.
 *
 * @param lotteryPubkey base58 lottery account
 * @param roundIndex the round we expect to resolve (bigint or number)
 * @param effectiveEndUnix when the round deadline lands (UNIX seconds)
 * @param fire callback invoked when the timer fires
 */
export function scheduleResolveAt(
  lotteryPubkey: string,
  roundIndex: bigint | number,
  effectiveEndUnix: number,
  fire: () => Promise<void>,
): void {
  const key = keyFor(lotteryPubkey, roundIndex);
  const existing = scheduled.get(key);
  // Same target, same fireAt? leave it. Otherwise replace.
  const targetFireAt = effectiveEndUnix + 1; // 1s buffer for slot propagation
  if (existing && existing.fireAt === targetFireAt) return;
  if (existing) clearTimeout(existing.timer);

  const delayMs = Math.max(0, targetFireAt * 1000 - Date.now());
  const timer = setTimeout(() => {
    scheduled.delete(key);
    fire().catch((err) =>
      console.error(`[scheduler] ${key} fire failed`, (err as Error).message),
    );
  }, delayMs);
  scheduled.set(key, { timer, fireAt: targetFireAt });
  console.log(
    `[scheduler] ${key} armed for +${Math.round(delayMs / 1000)}s (effectiveEnd=${effectiveEndUnix})`,
  );
}

export function cancelResolve(
  lotteryPubkey: string,
  roundIndex: bigint | number,
): void {
  const key = keyFor(lotteryPubkey, roundIndex);
  const existing = scheduled.get(key);
  if (existing) {
    clearTimeout(existing.timer);
    scheduled.delete(key);
  }
}
