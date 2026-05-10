'use client';

import { useEffect, useState } from 'react';

import { relativeTime, shortAddress } from '@/lib/format';

interface Activity {
  txSignature: string;
  buyer: string;
  quantity: string;
  at: string;
}

export function PoolActivity() {
  const [items, setItems] = useState<Activity[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/lottery/activity');
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { activity: Activity[] };
        if (!cancelled) setItems(data.activity);
      } catch {
        /* ignore */
      }
    };
    load();
    const id = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="rounded-lg border border-white/5 bg-zinc-900/50 p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-3 flex items-center gap-2">
        <span aria-hidden>📈</span>
        Pool activity
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-500">Quiet for now.</p>
      ) : (
        <ul className="grid gap-1.5">
          {items.map((a) => (
            <li
              key={a.txSignature}
              className="flex items-center justify-between text-xs font-mono"
            >
              <span className="text-zinc-200">
                {shortAddress(a.buyer, 4, 4)}{' '}
                <span className="text-zinc-500 ml-2">{relativeTime(a.at)}</span>
              </span>
              <span className="flex items-center gap-2 text-amber-400">
                +{a.quantity}
                <a
                  href={`https://explorer.solana.com/tx/${a.txSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-400 hover:text-zinc-200"
                  aria-label="Open tx"
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
