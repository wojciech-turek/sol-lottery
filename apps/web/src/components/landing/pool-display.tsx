'use client';

import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { useSession } from '@/components/session-provider';
import { useWalletModal } from '@/components/wallet-modal';
import { useBuyTicket } from '@/hooks/use-buy-ticket';
import { lamportsToSol } from '@/lib/format';
import type { LotterySnapshot } from '@/hooks/use-lottery-snapshot';

const DEBOUNCE_MS = 800;
const MAX_BATCH = 128; // matches MAX_BUYERS_PER_CALL in the program

interface Props {
  lottery: string;
  round: string;
  currentShardIndex: number;
  ticketPriceLamports: string;
  initialPoolLamports: string;
  roundState: 'open' | 'closed' | 'awaitingVrf' | 'resolved';
  lotteryState: 'active' | 'paused' | 'pendingDisable' | 'disabled';
  effectiveEndUnix: number;
  paused: boolean;
}

export function PoolDisplay({
  lottery,
  round,
  currentShardIndex,
  ticketPriceLamports,
  initialPoolLamports,
  roundState,
  lotteryState,
  effectiveEndUnix,
  paused,
}: Props) {
  const { pubkey } = useSession();
  const { open } = useWalletModal();

  // Read the latest snapshot (kept fresh by SnapshotWatcher every 5s).
  // We use IT — not the SSR props — to pick which round/shard to buy
  // tickets on, otherwise a page that's been open across several
  // rollovers would still try to write to a long-resolved round.
  // SnapshotWatcher owns the polling cadence; this useQuery shares the
  // same cache entry so re-renders are automatic. queryFn must be
  // provided (TanStack Query requires it even when refetching is off).
  const snapshotQuery = useQuery<{ snapshot: LotterySnapshot | null }>({
    queryKey: ['lottery', 'snapshot'],
    queryFn: async () => {
      const res = await fetch('/api/lottery/snapshot');
      if (!res.ok) throw new Error('snapshot fetch failed');
      return res.json();
    },
    enabled: false,
    staleTime: Infinity,
  });
  const live = snapshotQuery.data?.snapshot;
  const liveRound = live?.round.pubkey ?? round;
  const liveShardIndex =
    live?.round.currentShardIndex ?? currentShardIndex;
  const liveLotteryState = live?.lottery.state ?? lotteryState;
  const liveRoundState = live?.round.state ?? roundState;
  const liveEffectiveEnd = live?.round.effectiveEndUnix ?? effectiveEndUnix;

  const { buy, reset, status, error, signature } = useBuyTicket({
    lottery,
    round: liveRound,
    currentShardIndex: liveShardIndex,
  });

  // Clear "Bought — buy another?" the instant the active round changes.
  // Without this, a success from round N sticks around through round N's
  // resolution and into round N+1, even though it's no longer relevant.
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveRound]);

  // Local "are we past the deadline" flag. Lets the button flip to
  // "Drawing winner…" the instant the countdown hits 0 instead of
  // waiting for the chain-state polling to catch up. The snapshot
  // watcher will follow up with the authoritative state.
  const [pastDeadline, setPastDeadline] = useState<boolean>(
    () => !paused && liveEffectiveEnd - Math.floor(Date.now() / 1000) <= 0,
  );
  useEffect(() => {
    if (paused) {
      setPastDeadline(false);
      return;
    }
    const tick = () => {
      const remaining = liveEffectiveEnd - Math.floor(Date.now() / 1000);
      setPastDeadline(remaining <= 0);
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [liveEffectiveEnd, paused]);

  const { data } = useQuery<{ poolLamports: string }>({
    queryKey: ['lottery', 'pool', liveRound],
    queryFn: async () => {
      const res = await fetch(`/api/lottery/pool?round=${liveRound}`);
      if (!res.ok) throw new Error('pool fetch failed');
      return res.json();
    },
    initialData: { poolLamports: initialPoolLamports },
    refetchInterval: 5_000,
  });
  const poolLamports = BigInt(data?.poolLamports ?? initialPoolLamports);

  const sol = lamportsToSol(poolLamports);
  const priceSol = lamportsToSol(BigInt(ticketPriceLamports));

  const reason = (() => {
    if (liveLotteryState === 'paused') return 'Lottery paused';
    if (liveLotteryState === 'pendingDisable') return 'Lottery winding down';
    if (liveLotteryState === 'disabled') return 'Lottery disabled';
    if (liveRoundState === 'awaitingVrf' || liveRoundState === 'closed')
      return 'Drawing winner…';
    if (liveRoundState === 'resolved') return 'Drawing winner…';
    // Client-side anticipation: the moment the countdown hits 0, show the
    // resolving state without waiting for the chain to flip round.state.
    if (pastDeadline) return 'Drawing winner…';
    return null;
  })();
  const buyDisabled =
    !!reason || status === 'sending' || status === 'confirming';

  // Debounced batch-buy: each click bumps the pending count and (re)starts
  // an 800 ms timer. When the timer fires we send a single tx with the
  // batched quantity. The animated bar shows the user how much time is
  // left to add another ticket before the click "locks in".
  const [pendingQty, setPendingQty] = useState(0);
  const [debounceKey, setDebounceKey] = useState(0); // bumps to restart anim
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear pending state if the round flips away from buyable.
  useEffect(() => {
    if (!buyDisabled) return;
    setPendingQty(0);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
  }, [buyDisabled]);

  const fireBuy = () => {
    setPendingQty((qty) => {
      if (qty > 0) buy(qty);
      return 0;
    });
    debounceTimer.current = null;
  };

  const handleClick = () => {
    if (!pubkey) {
      open();
      return;
    }
    if (buyDisabled) return;
    setPendingQty((q) => Math.min(MAX_BATCH, q + 1));
    setDebounceKey((k) => k + 1);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(fireBuy, DEBOUNCE_MS);
  };

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  const buttonLabel = (() => {
    if (!pubkey) return 'Connect Wallet';
    // Round-state info wins over personal in-flight tx labels — if the
    // draw is happening, the user needs to see that, not a stale
    // "Bought — buy another?" from a previous round.
    if (reason) return reason;
    if (status === 'sending') return 'Confirm in wallet…';
    if (status === 'confirming') return 'Confirming…';
    if (status === 'success' && pendingQty === 0)
      return 'Bought — buy another?';
    if (pendingQty > 0) {
      const total = (priceSol * pendingQty).toFixed(2);
      return pendingQty === 1
        ? `Buy 1 ticket · ${total} SOL`
        : `Buy ${pendingQty} tickets · ${total} SOL`;
    }
    return `Buy Entry · ${priceSol.toFixed(2)} SOL`;
  })();

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <p className="text-muted-foreground/50 text-[10px] md:text-xs italic tracking-wide mb-6 md:mb-4 relative z-10">
        Your fair shot, every day
      </p>

      <div className="relative">
        <div className="absolute inset-0 pot-gradient rounded-full blur-2xl opacity-20 scale-125" />
        <div className="relative pot-glow pot-gradient rounded-full w-28 h-28 md:w-36 md:h-36 lg:w-44 lg:h-44 flex flex-col items-center justify-center animate-float">
          <span className="text-primary-foreground/60 text-[8px] md:text-[10px] uppercase tracking-wider">
            Pool
          </span>
          <span className="text-primary-foreground text-2xl md:text-3xl lg:text-4xl font-bold font-mono tabular-nums">
            {sol.toFixed(2)}
          </span>
          <span className="text-primary-foreground/70 text-xs md:text-sm font-medium">
            SOL
          </span>
        </div>
      </div>

      <button
        onClick={handleClick}
        disabled={buyDisabled}
        title={reason ?? undefined}
        className="relative overflow-hidden mt-3 md:mt-4 pot-gradient text-primary-foreground font-semibold text-xs md:text-sm px-5 md:px-6 py-2 md:py-2.5 rounded-full transition-transform duration-200 hover:scale-105 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
      >
        {/* Debounce progress: a single left→right dimming overlay that
            restarts on every click. Keying on `debounceKey` remounts the
            motion span instantly (no exit animation), so successive
            clicks cleanly reset the sweep instead of stacking. */}
        {pendingQty > 0 && (
          <motion.span
            key={debounceKey}
            className="absolute inset-y-0 left-0 bg-black/25 pointer-events-none"
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: DEBOUNCE_MS / 1000, ease: 'linear' }}
            aria-hidden
          />
        )}
        <span className="relative">{buttonLabel}</span>
      </button>

      {error && (
        <p className="mt-2 text-xs text-destructive max-w-xs text-center">
          {error}
        </p>
      )}
      {signature && status === 'success' && (
        <a
          href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 text-xs text-muted-foreground hover:text-foreground"
        >
          View transaction ↗
        </a>
      )}
    </div>
  );
}
