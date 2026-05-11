'use client';

import { useQuery } from '@tanstack/react-query';
import { Ticket, User } from 'lucide-react';

import { useSession } from '@/components/session-provider';

interface Stats {
  total: number;
  yours: number;
  players: number;
}

export function TicketsCard({ roundPubkey }: { roundPubkey: string }) {
  const { pubkey } = useSession();
  const { data: stats = { total: 0, yours: 0, players: 0 } } = useQuery<Stats>({
    queryKey: ['lottery', 'tickets', roundPubkey, pubkey],
    queryFn: async () => {
      const params = new URLSearchParams({ round: roundPubkey });
      if (pubkey) params.set('buyer', pubkey);
      const res = await fetch(`/api/lottery/tickets?${params.toString()}`);
      if (!res.ok) throw new Error('tickets fetch failed');
      return res.json();
    },
    refetchInterval: 5_000,
  });

  const odds =
    stats.total > 0 ? ((stats.yours / stats.total) * 100).toFixed(1) : '0';

  return (
    <div className="glass rounded-lg p-2 md:p-3">
      <p className="text-muted-foreground text-[10px] uppercase tracking-wider mb-1.5 md:mb-2">
        Tickets
      </p>
      <div className="grid grid-cols-3 gap-1 md:gap-2 text-center">
        <Stat
          icon={<Ticket className="w-3 h-3 mx-auto text-muted-foreground" />}
          value={stats.total}
          label="Total"
        />
        <Stat
          icon={<Ticket className="w-3 h-3 mx-auto text-primary" />}
          value={stats.yours}
          label="Yours"
          highlight
        />
        <Stat
          icon={<User className="w-3 h-3 mx-auto text-muted-foreground" />}
          value={stats.players}
          label="Players"
        />
      </div>
      {stats.yours > 0 && (
        <p className="text-center text-primary text-[10px] md:text-xs mt-1.5 md:mt-2">
          {odds}% chance to win
        </p>
      )}
    </div>
  );
}

function Stat({
  icon,
  value,
  label,
  highlight,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {icon}
      <span
        className={
          (highlight ? 'text-primary' : 'text-foreground') +
          ' text-sm md:text-base font-mono font-medium tabular-nums'
        }
      >
        {value}
      </span>
      <span className="text-[9px] md:text-[10px] uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
    </div>
  );
}
