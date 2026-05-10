'use client';

import type { AdminTabData } from '@/components/admin/admin-tabs';
import { LotteryControls } from '@/components/admin/lottery-controls';
import { LotteryConfigForm } from '@/components/admin/lottery-config-form';
import { MetricsRow } from '@/components/admin/metrics-row';
import { WinnersTable } from '@/components/admin/winners-table';
import { AlertsLog } from '@/components/admin/alerts-log';

export function LotteryTabPanel({ data }: { data: AdminTabData }) {
  return (
    <div className="grid gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">
            {data.lottery.name || `lottery #${data.lottery.lotteryIndex}`}
          </h2>
          <p className="text-xs text-zinc-500 font-mono mt-1">
            {data.lottery.pubkey}
          </p>
        </div>
        <span
          className={`px-2 py-1 rounded-md text-[10px] uppercase tracking-wider border ${
            stateClass[data.lottery.state] ?? 'border-zinc-700 text-zinc-400'
          }`}
        >
          {data.lottery.state}
        </span>
      </header>

      <MetricsRow data={data} />
      <LotteryControls data={data} />
      <LotteryConfigForm data={data} />
      <WinnersTable winners={data.winners} />
      <AlertsLog alerts={data.alerts} />
    </div>
  );
}

const stateClass: Record<string, string> = {
  active: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10',
  paused: 'border-amber-500/40 text-amber-400 bg-amber-500/10',
  pendingDisable: 'border-orange-500/40 text-orange-400 bg-orange-500/10',
  disabled: 'border-zinc-700 text-zinc-400 bg-zinc-800/40',
};
