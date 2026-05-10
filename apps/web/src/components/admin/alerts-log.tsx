'use client';

import { relativeTime } from '@/lib/format';

interface Alert {
  id: string;
  previous: string;
  next: string;
  at: string;
  txSignature: string;
}

export function AlertsLog({ alerts }: { alerts: Alert[] }) {
  return (
    <section>
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-3 flex items-center gap-2">
        <span aria-hidden>🔔</span>
        Alerts &amp; audit log
      </div>
      {alerts.length === 0 ? (
        <p className="text-xs text-zinc-500">Quiet for now.</p>
      ) : (
        <ul className="grid gap-1.5">
          {alerts.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between text-xs rounded-md border border-white/5 bg-zinc-900/50 px-3 py-2"
            >
              <span className="text-zinc-200">
                State changed: {a.previous} → {a.next}
              </span>
              <span className="text-zinc-500 flex items-center gap-2">
                {relativeTime(a.at)}
                <a
                  href={`https://explorer.solana.com/tx/${a.txSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  ↗
                </a>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-zinc-500 mt-3">
        Monitoring: state transitions · admin actions
      </p>
    </section>
  );
}
