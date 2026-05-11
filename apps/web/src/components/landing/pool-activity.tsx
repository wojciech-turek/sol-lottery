'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, ExternalLink, Ticket } from 'lucide-react';

import { relativeTime, shortAddress } from '@/lib/format';

interface ActivityItem {
  txSignature: string;
  buyer: string;
  quantity: string;
  at: string;
}

export function PoolActivity({ initial }: { initial?: ActivityItem[] }) {
  const { data } = useQuery<{ activity: ActivityItem[] }>({
    queryKey: ['lottery', 'activity'],
    queryFn: async () => {
      const res = await fetch('/api/lottery/activity');
      if (!res.ok) throw new Error('activity fetch failed');
      return res.json();
    },
    initialData: { activity: initial ?? [] },
    refetchInterval: 10_000,
  });
  const items = data?.activity ?? [];

  return (
    <div className="glass rounded-lg p-2 md:p-3 h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 mb-1.5 md:mb-2 shrink-0">
        <Activity className="w-3 h-3 text-primary" />
        <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
          Pool activity
        </p>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin min-h-0 space-y-1 md:space-y-2">
        {items.length === 0 ? (
          <p className="text-[10px] md:text-xs text-muted-foreground/60">
            Quiet for now.
          </p>
        ) : (
          items.map((a) => (
            <div
              key={a.txSignature}
              className="flex items-center justify-between text-[10px] md:text-xs"
            >
              <div className="flex flex-col min-w-0">
                <span className="font-mono text-foreground truncate">
                  {shortAddress(a.buyer, 4, 4)}
                </span>
                <span className="text-muted-foreground/60 text-[9px]">
                  {relativeTime(a.at)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Ticket className="w-3 h-3 text-primary" />
                <span className="font-mono text-primary">+{a.quantity}</span>
                <a
                  href={`https://explorer.solana.com/tx/${a.txSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Open transaction"
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
