'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useSession } from '@/components/session-provider';
import { useAdminActions } from '@/hooks/use-admin-actions';
import { clientEnv } from '@/lib/env';

interface SplitDraft {
  label: string;
  destination: string;
  bps: number;
  isPool: boolean;
}

const POOL_PUBKEY_PLACEHOLDER = '11111111111111111111111111111111';

export function CreateLotteryForm() {
  const { pubkey } = useSession();
  const actions = useAdminActions();
  const router = useRouter();

  const [name, setName] = useState("Daily 15-min draw");
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [ticketPriceSol, setTicketPriceSol] = useState(0.05);
  const [prizeKind, setPrizeKindRaw] = useState<'sol' | 'physical'>('sol');
  const setPrizeKind = (next: 'sol' | 'physical') => {
    setPrizeKindRaw(next);
    if (next === 'physical') {
      // Force all splits to non-pool — physical lotteries can't have one.
      setSplits((prev) => prev.map((s) => ({ ...s, isPool: false })));
    }
  };
  const [autoRollover, setAutoRollover] = useState(true);
  const [manualResolution, setManualResolution] = useState(false);
  const [splits, setSplits] = useState<SplitDraft[]>([
    {
      label: 'pool',
      destination: POOL_PUBKEY_PLACEHOLDER,
      bps: 9500,
      isPool: true,
    },
    {
      label: 'dev',
      destination: clientEnv.NEXT_PUBLIC_ADMIN_DEFAULT_DEV_WALLET ?? '',
      bps: 500,
      isPool: false,
    },
  ]);

  // Default the dev wallet to the connected admin if no env override.
  useEffect(() => {
    if (
      pubkey &&
      !clientEnv.NEXT_PUBLIC_ADMIN_DEFAULT_DEV_WALLET &&
      splits.find((s) => !s.isPool && !s.destination)
    ) {
      setSplits((prev) =>
        prev.map((s) => (!s.isPool && !s.destination ? { ...s, destination: pubkey } : s)),
      );
    }
  }, [pubkey, splits]);

  const totalBps = splits.reduce((sum, s) => sum + s.bps, 0);
  const splitsValid =
    totalBps === 10000 &&
    splits.every((s) => s.bps % 100 === 0) &&
    (prizeKind === 'sol'
      ? splits.filter((s) => s.isPool).length === 1
      : splits.every((s) => !s.isPool));
  const canSubmit =
    !!pubkey &&
    splitsValid &&
    name.trim().length > 0 &&
    durationMinutes > 0 &&
    ticketPriceSol > 0 &&
    actions.status !== 'pending';

  const submit = async () => {
    await actions.createLottery({
      name,
      durationSeconds: durationMinutes * 60,
      ticketPriceSol,
      prizeKind,
      autoRollover,
      manualResolution,
      splits,
    });
    if (actions.error == null) {
      router.refresh();
    }
  };

  return (
    <section className="rounded-lg border border-white/5 bg-zinc-900/40 p-6 max-w-2xl">
      <h3 className="text-base font-semibold text-zinc-100">Create lottery</h3>
      <p className="text-xs text-zinc-500 mt-1">
        Submits two transactions: <code>create_lottery</code>, then{' '}
        <code>open_round(1)</code>. The lottery is live as soon as both confirm.
      </p>

      <div className="mt-5 grid gap-4">
        <Field label="Name">
          <input
            type="text"
            value={name}
            maxLength={32}
            onChange={(e) => setName(e.target.value)}
            className="px-3 py-2 rounded-md bg-zinc-900 border border-white/10 text-zinc-200 text-sm focus:outline-none focus:border-amber-500/40"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Round duration (minutes)">
            <input
              type="number"
              min={1}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Math.max(1, Number(e.target.value)))}
              className="px-3 py-2 rounded-md bg-zinc-900 border border-white/10 text-zinc-200 text-sm font-mono"
            />
          </Field>
          <Field label="Ticket price (SOL)">
            <input
              type="number"
              min={0.0001}
              step={0.001}
              value={ticketPriceSol}
              onChange={(e) => setTicketPriceSol(Number(e.target.value))}
              className="px-3 py-2 rounded-md bg-zinc-900 border border-white/10 text-zinc-200 text-sm font-mono"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Prize kind">
            <select
              value={prizeKind}
              onChange={(e) => setPrizeKind(e.target.value as 'sol' | 'physical')}
              className="px-3 py-2 rounded-md bg-zinc-900 border border-white/10 text-zinc-200 text-sm"
            >
              <option value="sol">SOL</option>
              <option value="physical">Physical</option>
            </select>
          </Field>
          <Field label="Auto-rollover">
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-zinc-900 border border-white/10 text-zinc-200 text-sm">
              <input
                type="checkbox"
                checked={autoRollover}
                onChange={(e) => setAutoRollover(e.target.checked)}
              />
              Open the next round automatically on resolve
            </label>
          </Field>
        </div>
        <div>
          <Field label="Resolution">
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-zinc-900 border border-white/10 text-zinc-200 text-sm">
              <input
                type="checkbox"
                checked={manualResolution}
                onChange={(e) => setManualResolution(e.target.checked)}
              />
              <span>
                Require manual resolution
                <span className="block text-[10px] text-zinc-500 mt-0.5">
                  Off (default): the indexer auto-resolves once the round ends.
                  On: admin must click &quot;Resolve now&quot;.
                </span>
              </span>
            </label>
          </Field>
        </div>

        <div>
          <span className="text-[11px] uppercase tracking-wider text-zinc-500 block mb-2">
            Splits ({(totalBps / 100).toFixed(0)}% total)
          </span>
          <div className="rounded-md border border-white/10 divide-y divide-white/5 overflow-hidden">
            {splits.map((s, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_2fr_100px_70px_28px] items-center gap-2 px-3 py-2 text-xs font-mono"
              >
                <input
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
                  value={s.destination}
                  onChange={(e) =>
                    setSplits(
                      splits.map((x, j) =>
                        j === i ? { ...x, destination: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder={s.isPool ? 'pool (ignored)' : 'destination pubkey'}
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
                            ? {
                                ...x,
                                bps:
                                  Math.max(0, Number(e.target.value)) * 100,
                              }
                            : x,
                        ),
                      )
                    }
                    className="bg-zinc-900 border border-white/10 rounded px-2 py-1 w-full text-right"
                  />
                  <span className="text-zinc-500">%</span>
                </div>
                <label className="inline-flex items-center gap-1 text-zinc-500">
                  <input
                    type="checkbox"
                    checked={s.isPool}
                    disabled={prizeKind === 'physical'}
                    onChange={(e) =>
                      setSplits(
                        splits.map((x, j) =>
                          j === i ? { ...x, isPool: e.target.checked } : x,
                        ),
                      )
                    }
                  />
                  pool
                </label>
                <button
                  onClick={() =>
                    setSplits(splits.filter((_, j) => j !== i))
                  }
                  className="text-zinc-500 hover:text-red-400"
                  aria-label="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() =>
              setSplits([
                ...splits,
                {
                  label: '',
                  destination: '',
                  bps: 0,
                  isPool: false,
                },
              ])
            }
            disabled={splits.length >= 8}
            className="mt-2 text-xs text-amber-400 hover:text-amber-300 disabled:opacity-50"
          >
            + Add split
          </button>
        </div>

        <div className="flex items-center justify-end gap-3">
          {actions.error && (
            <span className="text-xs text-red-400">{actions.error}</span>
          )}
          {actions.progress && (
            <span className="text-xs text-amber-400">{actions.progress}</span>
          )}
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-4 py-2 rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-950 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actions.status === 'pending' ? 'Creating…' : 'Create + Open round 1'}
          </button>
        </div>
      </div>
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
