import { Info } from 'lucide-react';

import { lamportsToSol } from '@/lib/format';

interface Props {
  ticketPriceLamports: bigint;
  durationSeconds: bigint;
  poolBps: number;
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
    <div className="glass rounded-lg p-2 md:p-3 h-full">
      <div className="flex items-center gap-1.5 mb-1.5 md:mb-2">
        <Info className="w-3 h-3 text-muted-foreground" />
        <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
          How it works
        </p>
      </div>
      <ul className="text-foreground text-[10px] md:text-xs space-y-0.5 md:space-y-1">
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
