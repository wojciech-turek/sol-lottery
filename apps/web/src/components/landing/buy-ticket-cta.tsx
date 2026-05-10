'use client';

import { useSession } from '@/components/session-provider';
import { useWalletModal } from '@/components/wallet-modal';
import { useBuyTicket } from '@/hooks/use-buy-ticket';
import { lamportsToSol } from '@/lib/format';

interface Props {
  lottery: string;
  round: string;
  currentShardIndex: number;
  ticketPriceLamports: string;
  roundState: 'open' | 'closed' | 'awaitingVrf' | 'resolved';
  lotteryState: 'active' | 'paused' | 'pendingDisable' | 'disabled';
}

export function BuyTicketCta({
  lottery,
  round,
  currentShardIndex,
  ticketPriceLamports,
  roundState,
  lotteryState,
}: Props) {
  const { pubkey } = useSession();
  const { open } = useWalletModal();
  const { buy, status, error, signature } = useBuyTicket({
    lottery,
    round,
    currentShardIndex,
  });

  if (!pubkey) {
    return (
      <button
        onClick={open}
        className="px-6 py-2.5 rounded-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium text-sm transition"
      >
        Connect Wallet
      </button>
    );
  }

  const reason = (() => {
    if (lotteryState === 'paused') return 'Lottery paused';
    if (lotteryState === 'pendingDisable') return 'Lottery winding down';
    if (lotteryState === 'disabled') return 'Lottery disabled';
    if (roundState === 'closed') return 'Round closed — awaiting draw';
    if (roundState === 'awaitingVrf') return 'Drawing winner…';
    if (roundState === 'resolved') return 'Round resolved';
    return null;
  })();
  const disabled = !!reason || status === 'sending' || status === 'confirming';
  const priceSol = lamportsToSol(BigInt(ticketPriceLamports));

  const label = (() => {
    if (status === 'sending') return 'Confirm in wallet…';
    if (status === 'confirming') return 'Confirming…';
    if (status === 'success') return 'Purchased — buy another?';
    if (reason) return reason;
    return `Buy Ticket – ${priceSol.toFixed(2)} SOL`;
  })();

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={() => buy(1)}
        disabled={disabled}
        title={reason ?? undefined}
        className="px-6 py-2.5 rounded-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium text-sm transition disabled:bg-zinc-700 disabled:text-zinc-400 disabled:cursor-not-allowed"
      >
        {label}
      </button>
      {error && <p className="text-xs text-red-400 max-w-xs text-center">{error}</p>}
      {signature && status === 'success' && (
        <a
          href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-zinc-400 hover:text-zinc-200"
        >
          View transaction ↗
        </a>
      )}
    </div>
  );
}
