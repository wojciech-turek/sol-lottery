'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { useSession } from '@/components/session-provider';
import { useWalletModal } from '@/components/wallet-modal';
import { useBuyTicket } from '@/hooks/use-buy-ticket';
import { useLottery } from '@/hooks/use-lottery-snapshot';
import { lamportsToSol } from '@/lib/format';

const DEBOUNCE_MS = 800;
const MAX_BATCH = 128; // matches MAX_BUYERS_PER_CALL in the program

export function PoolDisplay() {
  const { pubkey } = useSession();
  const { open } = useWalletModal();
  const { data } = useLottery();

  const lottery = data?.lottery.pubkey ?? '';
  const round = data?.round.pubkey ?? '';
  const currentShardIndex = data?.round.currentShardIndex ?? 0;
  const ticketPriceLamports = data?.lottery.ticketPriceLamports ?? '0';
  const roundState = data?.round.state;
  const lotteryState = data?.lottery.state;
  const effectiveEndUnix = data?.round.effectiveEndUnix ?? 0;
  const paused = lotteryState === 'paused';
  const poolLamports = BigInt(data?.round.poolLamports ?? '0');

  const { buy, reset, status, error, signature } = useBuyTicket({
    lottery,
    round,
    currentShardIndex,
  });

  // Clear "Bought — buy another?" the instant the active round changes.
  // Without this, success from round N sticks around into round N+1.
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  // Anticipatory "Drawing winner…" the moment the local countdown reaches 0.
  // The Realtime invalidation will then catch the chain-confirmed state
  // change a moment later. Resets automatically when `effectiveEndUnix`
  // updates (new round → new deadline in the future).
  const [pastDeadline, setPastDeadline] = useState<boolean>(() => {
    if (paused || !effectiveEndUnix) return false;
    return effectiveEndUnix - Math.floor(Date.now() / 1000) <= 0;
  });
  useEffect(() => {
    if (paused || !effectiveEndUnix) {
      setPastDeadline(false);
      return;
    }
    const tick = () => {
      const remaining = effectiveEndUnix - Math.floor(Date.now() / 1000);
      setPastDeadline(remaining <= 0);
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [effectiveEndUnix, paused]);

  const sol = lamportsToSol(poolLamports);
  const priceSol = lamportsToSol(BigInt(ticketPriceLamports));

  const reason = (() => {
    if (!data) return null;
    if (lotteryState === 'paused') return 'Lottery paused';
    if (lotteryState === 'pendingDisable') return 'Lottery winding down';
    if (lotteryState === 'disabled') return 'Lottery disabled';
    if (roundState === 'awaitingVrf' || roundState === 'closed')
      return 'Drawing winner…';
    if (roundState === 'resolved') return 'Drawing winner…';
    if (pastDeadline) return 'Drawing winner…';
    return null;
  })();
  const buyDisabled =
    !data || !!reason || status === 'sending' || status === 'confirming';

  // Debounced batch-buy: each click bumps pending count and (re)starts an
  // 800 ms timer. When it fires we send a single tx with the batched qty.
  const [pendingQty, setPendingQty] = useState(0);
  const [debounceKey, setDebounceKey] = useState(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (!data) return 'Loading…';
    if (!pubkey) return 'Connect Wallet';
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
            {data ? sol.toFixed(2) : '—'}
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
