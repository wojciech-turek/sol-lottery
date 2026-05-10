'use client';

import type { AdminTabData } from '@/components/admin/admin-tabs';
import { useAdminActions } from '@/hooks/use-admin-actions';

export function LotteryControls({ data }: { data: AdminTabData }) {
  const actions = useAdminActions();
  const lotteryRef = {
    pubkey: data.lottery.pubkey,
    currentRoundIndex: data.lottery.currentRoundIndex,
    autoRollover: data.lottery.autoRollover,
  };
  const roundPubkey = data.round?.pubkey ?? null;
  const isActive = data.lottery.state === 'active';
  const isPaused = data.lottery.state === 'paused';
  const isPendingDisable = data.lottery.state === 'pendingDisable';
  const isDisabled = data.lottery.state === 'disabled';
  const roundOpen = data.round && data.round.state === 'open';
  const roundClosed = data.round && data.round.state === 'closed';
  const roundResolved = data.round && data.round.state === 'resolved';
  const busy = actions.status === 'pending';

  return (
    <section>
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-3 flex items-center gap-2">
        <span aria-hidden>🎛</span>
        Lottery controls
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {isPaused ? (
          <Button
            label="Resume"
            onClick={() => actions.resume(lotteryRef, roundPubkey)}
            disabled={busy}
          />
        ) : (
          <Button
            label="Pause"
            onClick={() => actions.pause(lotteryRef, roundPubkey)}
            disabled={busy || !isActive}
          />
        )}
        <Button
          label="Resolve now"
          tone="primary"
          disabled={busy || !roundPubkey || (!roundOpen && !roundClosed)}
          onClick={() => roundPubkey && actions.resolveNow(lotteryRef, roundPubkey)}
        />
        <Button
          label="Open next round"
          disabled={busy || !roundResolved || isDisabled || isPendingDisable}
          onClick={() => actions.openNextRound(lotteryRef)}
        />
        {!isDisabled && !isPendingDisable && (
          <Button
            label="Disable"
            tone="warn"
            disabled={busy}
            onClick={() => actions.beginDisable(lotteryRef)}
          />
        )}
        {isPendingDisable && <Button label="Disabling…" disabled tone="warn" />}
        {isDisabled && (
          <Button
            label="Close"
            tone="warn"
            disabled={busy}
            onClick={() => actions.closeLottery(lotteryRef)}
          />
        )}
      </div>
      <Status actions={actions} />
    </section>
  );
}

function Button({
  label,
  disabled,
  tone,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  tone?: 'primary' | 'warn';
  onClick?: () => void;
}) {
  const palette =
    tone === 'primary'
      ? 'border-amber-500/30 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
      : tone === 'warn'
        ? 'border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20'
        : 'border-white/10 text-zinc-200 bg-zinc-900 hover:bg-zinc-800';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-2 rounded-md text-sm border transition disabled:cursor-not-allowed disabled:opacity-50 ${palette}`}
    >
      {label}
    </button>
  );
}

function Status({ actions }: { actions: ReturnType<typeof useAdminActions> }) {
  if (actions.error) {
    return <p className="text-xs text-red-400 mt-2">{actions.error}</p>;
  }
  if (actions.progress) {
    return <p className="text-xs text-amber-400 mt-2">{actions.progress}</p>;
  }
  if (actions.status === 'success') {
    return <p className="text-xs text-emerald-400 mt-2">Done.</p>;
  }
  return null;
}
