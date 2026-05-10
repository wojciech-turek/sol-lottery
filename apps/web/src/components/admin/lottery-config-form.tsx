'use client';

import { useState } from 'react';

import type { AdminTabData } from '@/components/admin/admin-tabs';
import { useAdminActions } from '@/hooks/use-admin-actions';
import { lamportsToSol, shortAddress } from '@/lib/format';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

export function LotteryConfigForm({ data }: { data: AdminTabData }) {
  const actions = useAdminActions();
  const lotteryRef = {
    pubkey: data.lottery.pubkey,
    currentRoundIndex: data.lottery.currentRoundIndex,
    autoRollover: data.lottery.autoRollover,
  };

  const initialMinutes = Math.floor(Number(data.lottery.durationSeconds) / 60);
  const initialPriceSol = lamportsToSol(BigInt(data.lottery.ticketPriceLamports));
  const [minutes, setMinutes] = useState(initialMinutes);
  const [priceSol, setPriceSol] = useState(initialPriceSol);
  const [splits, setSplits] = useState(data.lottery.splits);
  const totalBps = splits.reduce((sum, s) => sum + s.bps, 0);
  const splitsValid = totalBps === 10000 && splits.every((s) => s.bps % 100 === 0);
  const busy = actions.status === 'pending';

  return (
    <section>
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-3 flex items-center gap-2">
        <span aria-hidden>⚙</span>
        Configuration
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Field label="Duration (minutes)">
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              value={minutes}
              onChange={(e) => setMinutes(Math.max(1, Number(e.target.value)))}
              className="flex-1 px-3 py-2 rounded-md bg-zinc-900 border border-white/10 text-zinc-200 text-sm font-mono focus:outline-none focus:border-amber-500/40"
            />
            <button
              disabled={
                busy || minutes === initialMinutes || !Number.isFinite(minutes)
              }
              onClick={() => actions.updateDuration(lotteryRef, minutes * 60)}
              className="px-3 py-2 rounded-md border border-white/10 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </Field>
        <Field label="Ticket price (SOL)">
          <div className="flex gap-2">
            <input
              type="number"
              min={0.0001}
              step={0.001}
              value={priceSol}
              onChange={(e) => setPriceSol(Number(e.target.value))}
              className="flex-1 px-3 py-2 rounded-md bg-zinc-900 border border-white/10 text-zinc-200 text-sm font-mono focus:outline-none focus:border-amber-500/40"
            />
            <button
              disabled={busy || priceSol === initialPriceSol || priceSol <= 0}
              onClick={() =>
                actions.updatePrice(
                  lotteryRef,
                  BigInt(Math.floor(priceSol * LAMPORTS_PER_SOL)),
                )
              }
              className="px-3 py-2 rounded-md border border-white/10 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </Field>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider text-zinc-500">
            Splits ({(totalBps / 100).toFixed(0)}% total)
          </span>
          <button
            disabled={busy || !splitsValid}
            onClick={() => actions.updateSplits(lotteryRef, splits)}
            className="px-3 py-1.5 rounded-md border border-white/10 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
          >
            Save splits
          </button>
        </div>
        <div className="rounded-md border border-white/10 divide-y divide-white/5 overflow-hidden">
          {splits.map((s, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_2fr_100px_24px] items-center gap-2 px-3 py-2 text-xs font-mono"
            >
              <input
                type="text"
                value={s.label}
                onChange={(e) =>
                  setSplits(
                    splits.map((x, j) =>
                      j === i ? { ...x, label: e.target.value } : x,
                    ),
                  )
                }
                className="bg-zinc-900 border border-white/10 rounded px-2 py-1"
              />
              <input
                type="text"
                value={s.destination}
                onChange={(e) =>
                  setSplits(
                    splits.map((x, j) =>
                      j === i ? { ...x, destination: e.target.value } : x,
                    ),
                  )
                }
                placeholder={s.isPool ? 'pool — ignored' : 'destination pubkey'}
                className="bg-zinc-900 border border-white/10 rounded px-2 py-1"
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={s.bps / 100}
                  onChange={(e) =>
                    setSplits(
                      splits.map((x, j) =>
                        j === i
                          ? { ...x, bps: Math.max(0, Number(e.target.value)) * 100 }
                          : x,
                      ),
                    )
                  }
                  className="bg-zinc-900 border border-white/10 rounded px-2 py-1 w-full text-right"
                />
                <span className="text-zinc-500">%</span>
              </div>
              <span title={s.isPool ? 'pool' : shortAddress(s.destination, 4, 4)}>
                {s.isPool ? '🏆' : ''}
              </span>
            </div>
          ))}
        </div>
        {!splitsValid && (
          <p className="text-[11px] text-amber-400 mt-2">
            Splits must sum to 100% in 1% increments.
          </p>
        )}
      </div>
      {actions.error && (
        <p className="text-xs text-red-400 mt-2">{actions.error}</p>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}
