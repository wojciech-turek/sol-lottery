'use client';

import { lamportsToSol, relativeTime, shortAddress } from '@/lib/format';

interface Winner {
  roundPubkey: string;
  winner: string;
  poolAmountLamports: string;
  resolvedAt: string;
}

export function WinnersTable({ winners }: { winners: Winner[] }) {
  return (
    <section>
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-3 flex items-center gap-2">
        <span aria-hidden>🏆</span>
        Winners &amp; payouts
      </div>
      {winners.length === 0 ? (
        <p className="text-xs text-zinc-500">No resolved rounds yet.</p>
      ) : (
        <div className="rounded-md border border-white/10 divide-y divide-white/5 overflow-hidden">
          {winners.map((w) => (
            <div
              key={w.roundPubkey}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-3 py-2 text-xs font-mono"
            >
              <span className="text-zinc-200">
                {shortAddress(w.winner, 6, 4)}
              </span>
              <span className="text-amber-400">
                {lamportsToSol(BigInt(w.poolAmountLamports)).toFixed(2)} SOL
              </span>
              <span className="text-emerald-400">
                ✓ {relativeTime(w.resolvedAt)}
              </span>
              <a
                href={`https://explorer.solana.com/address/${w.roundPubkey}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                className="text-zinc-400 hover:text-zinc-200"
              >
                tx ↗
              </a>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
