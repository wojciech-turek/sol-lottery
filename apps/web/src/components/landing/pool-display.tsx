'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { useSession } from '@/components/session-provider';
import { useWalletModal } from '@/components/wallet-modal';
import { useBuyTicket } from '@/hooks/use-buy-ticket';
import { lamportsToSol } from '@/lib/format';

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
  const { buy, status, error, signature } = useBuyTicket({
    lottery,
    round,
    currentShardIndex,
  });

  // Local "are we past the deadline" flag. Lets the button flip to
  // "Drawing winner…" the instant the countdown hits 0 instead of
  // waiting for the chain-state polling to catch up. The snapshot
  // watcher will follow up with the authoritative state.
  const [pastDeadline, setPastDeadline] = useState<boolean>(
    () => !paused && effectiveEndUnix - Math.floor(Date.now() / 1000) <= 0,
  );
  useEffect(() => {
    if (paused) {
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

  const { data } = useQuery<{ poolLamports: string }>({
    queryKey: ['lottery', 'pool', round],
    queryFn: async () => {
      const res = await fetch(`/api/lottery/pool?round=${round}`);
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
    if (lotteryState === 'paused') return 'Lottery paused';
    if (lotteryState === 'pendingDisable') return 'Lottery winding down';
    if (lotteryState === 'disabled') return 'Lottery disabled';
    if (roundState === 'awaitingVrf' || roundState === 'closed')
      return 'Drawing winner…';
    if (roundState === 'resolved') return 'Round resolved';
    // Client-side anticipation: the moment the countdown hits 0, show the
    // resolving state without waiting for the chain to flip round.state.
    if (pastDeadline) return 'Drawing winner…';
    return null;
  })();
  const buyDisabled =
    !!reason || status === 'sending' || status === 'confirming';

  const buttonLabel = (() => {
    if (!pubkey) return 'Connect Wallet';
    if (status === 'sending') return 'Confirm in wallet…';
    if (status === 'confirming') return 'Confirming…';
    if (status === 'success') return 'Bought — buy another?';
    if (reason) return reason;
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
        onClick={() => (pubkey ? buy(1) : open())}
        disabled={buyDisabled}
        title={reason ?? undefined}
        className="mt-3 md:mt-4 pot-gradient text-primary-foreground font-semibold text-xs md:text-sm px-5 md:px-6 py-2 md:py-2.5 rounded-full transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
      >
        {buttonLabel}
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
