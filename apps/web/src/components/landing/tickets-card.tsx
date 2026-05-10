'use client';

import { useEffect, useState } from 'react';

import { useSession } from '@/components/session-provider';

interface Stats {
  total: number;
  yours: number;
  players: number;
}

export function TicketsCard({ roundPubkey }: { roundPubkey: string }) {
  const { pubkey } = useSession();
  const [stats, setStats] = useState<Stats>({ total: 0, yours: 0, players: 0 });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const params = new URLSearchParams({ round: roundPubkey });
      if (pubkey) params.set('buyer', pubkey);
      const res = await fetch(`/api/lottery/tickets?${params.toString()}`);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as Stats;
      if (!cancelled) setStats(data);
    };
    load();
    const id = setInterval(load, 5_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [roundPubkey, pubkey]);

  const chance =
    stats.total > 0 ? ((stats.yours / stats.total) * 100).toFixed(1) : '0';

  return (
    <div className="rounded-lg border border-white/5 bg-zinc-900/50 p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-3">
        Tickets
      </div>
      <div className="grid grid-cols-3 gap-3 text-zinc-100">
        <Stat label="Total" value={stats.total} />
        <Stat label="Yours" value={stats.yours} highlight />
        <Stat label="Players" value={stats.players} />
      </div>
      <div className="mt-3 text-xs text-amber-400">
        {chance}% chance to win
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={
          highlight ? 'text-amber-400 text-xl font-medium' : 'text-xl font-medium'
        }
      >
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </span>
    </div>
  );
}
