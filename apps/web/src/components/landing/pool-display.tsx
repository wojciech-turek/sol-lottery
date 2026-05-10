'use client';

import { useEffect, useState } from 'react';

import { lamportsToSol } from '@/lib/format';

interface Props {
  roundPubkey: string;
  initialPoolLamports: string; // bigint serialized as string
}

export function PoolDisplay({ roundPubkey, initialPoolLamports }: Props) {
  const [poolLamports, setPoolLamports] = useState<bigint>(
    () => BigInt(initialPoolLamports),
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/lottery/pool?round=${roundPubkey}`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { poolLamports: string };
        if (!cancelled) setPoolLamports(BigInt(data.poolLamports));
      } catch {
        /* ignore transient failures */
      }
    };
    load();
    const id = setInterval(load, 5_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [roundPubkey]);

  const sol = lamportsToSol(poolLamports);
  return (
    <div className="flex flex-col items-center gap-6">
      <p className="italic text-zinc-400 text-sm">Your fair shot, every day</p>
      <div className="relative">
        <div className="absolute inset-0 -m-12 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="relative w-72 h-72 rounded-full bg-amber-500 flex flex-col items-center justify-center shadow-2xl shadow-amber-500/40">
          <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-900/80">
            Pool
          </span>
          <span className="text-5xl font-semibold text-zinc-950 tabular-nums mt-1">
            {sol.toFixed(2)}
          </span>
          <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-900/80 mt-1">
            SOL
          </span>
        </div>
      </div>
    </div>
  );
}
