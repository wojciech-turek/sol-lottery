'use client';

import { useState } from 'react';

import { LotteryTabPanel } from '@/components/admin/lottery-tab-panel';
import { CreateLotteryForm } from '@/components/admin/create-lottery-form';

interface SplitRow {
  label: string;
  destination: string;
  bps: number;
  isPool: boolean;
}

interface LotterySerialized {
  pubkey: string;
  lotteryIndex: string;
  name: string;
  state: string;
  prizeKind: string;
  ticketPriceLamports: string;
  durationSeconds: string;
  autoRollover: boolean;
  splits: SplitRow[];
  currentRoundIndex: string;
}

interface RoundSerialized {
  pubkey: string;
  index: string;
  state: string;
  startedAt: number;
  durationSeconds: number;
  pausedTotalSeconds: number;
  effectiveEndUnix: number;
  ticketPriceLamports: string;
  ticketsSold: string;
  donatedLamports: string;
  currentShardIndex: number;
  poolLamports: string;
}

export interface AdminTabData {
  lottery: LotterySerialized;
  round: RoundSerialized | null;
  metrics: { players: number; volumeLamports: string; feesLamports: string };
  winners: Array<{
    roundPubkey: string;
    winner: string;
    poolAmountLamports: string;
    resolvedAt: string;
  }>;
  alerts: Array<{
    id: string;
    previous: string;
    next: string;
    at: string;
    txSignature: string;
  }>;
}

export function AdminTabs({ lotteries }: { lotteries: AdminTabData[] }) {
  const [active, setActive] = useState<string>(
    lotteries[0]?.lottery.pubkey ?? '__create__',
  );

  const stateColor: Record<string, string> = {
    active: 'bg-emerald-400',
    paused: 'bg-amber-400',
    pendingDisable: 'bg-orange-400',
    disabled: 'bg-zinc-500',
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6 p-6">
      <aside className="border border-white/5 rounded-lg bg-zinc-900/40 p-2 self-start">
        <ul className="grid gap-1">
          {lotteries.map((l) => (
            <li key={l.lottery.pubkey}>
              <button
                onClick={() => setActive(l.lottery.pubkey)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition ${
                  active === l.lottery.pubkey
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${stateColor[l.lottery.state] ?? 'bg-zinc-500'}`}
                />
                <span className="flex-1 truncate">
                  {l.lottery.name || `lottery #${l.lottery.lotteryIndex}`}
                </span>
                <span className="text-[10px] text-zinc-500">
                  #{l.lottery.lotteryIndex}
                </span>
              </button>
            </li>
          ))}
          <li className="border-t border-white/5 mt-1 pt-1">
            <button
              onClick={() => setActive('__create__')}
              className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition ${
                active === '__create__'
                  ? 'bg-zinc-800 text-amber-400'
                  : 'text-amber-400 hover:bg-zinc-800/50'
              }`}
            >
              + Create lottery
            </button>
          </li>
        </ul>
      </aside>
      <section>
        {active === '__create__' ? (
          <CreateLotteryForm />
        ) : (
          (() => {
            const found = lotteries.find((l) => l.lottery.pubkey === active);
            if (!found) {
              return (
                <p className="text-zinc-500 text-sm">
                  Pick a lottery on the left.
                </p>
              );
            }
            return <LotteryTabPanel data={found} />;
          })()
        )}
      </section>
    </div>
  );
}
