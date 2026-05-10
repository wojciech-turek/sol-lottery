import { lamportsToSol } from '@/lib/format';

interface Props {
  ticketPriceLamports: bigint;
  durationSeconds: bigint;
  poolBps: number; // e.g. 9500 → 95%
}

export function HowItWorksCard({
  ticketPriceLamports,
  durationSeconds,
  poolBps,
}: Props) {
  const priceSol = lamportsToSol(ticketPriceLamports);
  const durationLabel = formatDuration(Number(durationSeconds));
  const winnerPct = (poolBps / 100).toFixed(0);
  return (
    <div className="rounded-lg border border-white/5 bg-zinc-900/50 p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-3">
        How it works
      </div>
      <ul className="text-xs text-zinc-300 grid gap-1.5">
        <li>• {priceSol.toFixed(2)} SOL per ticket</li>
        <li>• Pool grows with each ticket</li>
        <li>• Draw every {durationLabel}</li>
        <li>• {winnerPct}% to winner</li>
      </ul>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds >= 86400 && seconds % 86400 === 0) {
    const d = seconds / 86400;
    return d === 1 ? '24h' : `${d}d`;
  }
  if (seconds >= 3600 && seconds % 3600 === 0) {
    return `${seconds / 3600}h`;
  }
  if (seconds >= 60 && seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }
  return `${seconds}s`;
}
