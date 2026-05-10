'use client';

import type { AdminTabData } from '@/components/admin/admin-tabs';
import { lamportsToSol } from '@/lib/format';

export function MetricsRow({ data }: { data: AdminTabData }) {
  const pool = data.round
    ? lamportsToSol(BigInt(data.round.poolLamports))
    : 0;
  const volume = lamportsToSol(BigInt(data.metrics.volumeLamports));
  const fees = lamportsToSol(BigInt(data.metrics.feesLamports));

  return (
    <section>
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-3 flex items-center gap-2">
        <span aria-hidden>📈</span>
        Metrics
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="Players" value={data.metrics.players.toString()} />
        <Metric label="Pool" value={`${pool.toFixed(2)} SOL`} />
        <Metric label="Volume" value={`${volume.toFixed(2)} SOL`} />
        <Metric label="Fees" value={`${fees.toFixed(3)} SOL`} />
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-zinc-900/50 p-4">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="text-xl font-semibold text-zinc-100 mt-1 tabular-nums">
        {value}
      </div>
    </div>
  );
}
