'use client';

import { useEffect, useState } from 'react';

import { lamportsToSol, relativeTime, shortAddress } from '@/lib/format';
import { clientEnv } from '@/lib/env';

interface Winner {
  roundPubkey: string;
  winner: string;
  poolAmountLamports: string;
  resolvedAt: string;
}

export function RecentWinners() {
  const [winners, setWinners] = useState<Winner[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/lottery/winners');
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { winners: Winner[] };
        if (!cancelled) setWinners(data.winners);
      } catch {
        /* ignore */
      }
    };
    load();
    const id = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="rounded-lg border border-white/5 bg-zinc-900/50 p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-3 flex items-center gap-2">
        <span aria-hidden>🏆</span>
        Recent winners
      </div>
      {winners.length === 0 ? (
        <p className="text-xs text-zinc-500">No draws yet.</p>
      ) : (
        <ul className="grid gap-1.5">
          {winners.map((w) => (
            <li
              key={w.roundPubkey}
              className="flex items-center justify-between text-xs font-mono"
            >
              <span className="text-zinc-200">
                {shortAddress(w.winner, 4, 4)}{' '}
                <span className="text-zinc-500 ml-2">{relativeTime(w.resolvedAt)}</span>
              </span>
              <span className="flex items-center gap-2 text-amber-400">
                {lamportsToSol(BigInt(w.poolAmountLamports)).toFixed(2)} SOL
                <a
                  href={`https://explorer.solana.com/address/${w.roundPubkey}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-400 hover:text-zinc-200"
                  aria-label="Open on explorer"
                >
                  ↗
                </a>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
