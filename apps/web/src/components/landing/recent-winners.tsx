'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Trophy } from 'lucide-react';

import { lamportsToSol, relativeTime, shortAddress } from '@/lib/format';

interface Winner {
  roundPubkey: string;
  winner: string;
  poolAmountLamports: string;
  resolvedAt: string;
}

export function RecentWinners({ initial }: { initial?: Winner[] }) {
  const { data } = useQuery<{ winners: Winner[] }>({
    queryKey: ['lottery', 'winners'],
    queryFn: async () => {
      const res = await fetch('/api/lottery/winners');
      if (!res.ok) throw new Error('winners fetch failed');
      return res.json();
    },
    initialData: { winners: initial ?? [] },
    refetchInterval: 15_000,
  });
  const winners = data?.winners ?? [];

  return (
    <div className="glass rounded-lg p-2 md:p-3 h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 mb-1.5 md:mb-2 shrink-0">
        <Trophy className="w-3 h-3 text-primary" />
        <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
          Recent winners
        </p>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin min-h-0 space-y-1 md:space-y-2">
        {winners.length === 0 ? (
          <p className="text-[10px] md:text-xs text-muted-foreground/60">
            No draws yet — be the first.
          </p>
        ) : (
          winners.map((w) => (
            <div
              key={w.roundPubkey}
              className="flex items-center justify-between text-[10px] md:text-xs"
            >
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-foreground truncate">
                  {shortAddress(w.winner, 4, 4)}
                </span>
                <span className="text-muted-foreground/60 text-[9px]">
                  {relativeTime(w.resolvedAt)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="font-mono text-primary">
                  {lamportsToSol(BigInt(w.poolAmountLamports)).toFixed(2)} SOL
                </span>
                <a
                  href={`https://explorer.solana.com/address/${w.roundPubkey}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Open on explorer"
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
