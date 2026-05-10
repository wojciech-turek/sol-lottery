'use client';

import { BN } from '@coral-xyz/anchor';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { createProgram, ticketShardPda } from '@sol-lottery/sdk';

interface BuyArgs {
  lottery: string;
  round: string;
  currentShardIndex: number;
}

type Status = 'idle' | 'sending' | 'confirming' | 'success' | 'error';

export function useBuyTicket(args: BuyArgs) {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const router = useRouter();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  const buy = useCallback(
    async (quantity = 1): Promise<void> => {
      if (!wallet) {
        setError('Connect wallet first');
        return;
      }
      setError(null);
      setStatus('sending');
      try {
        const program = createProgram(connection, wallet);
        const lotteryPk = new PublicKey(args.lottery);
        const roundPk = new PublicKey(args.round);
        const shardPk = ticketShardPda(roundPk, args.currentShardIndex);

        const sig = await program.methods
          .buyTickets(new BN(quantity))
          .accountsPartial({
            lottery: lotteryPk,
            round: roundPk,
            currentShard: shardPk,
            buyer: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        setSignature(sig);
        setStatus('confirming');
        await connection.confirmTransaction(sig, 'confirmed');
        setStatus('success');
        // Refresh the RSC so pool/tickets/state pick up the change.
        router.refresh();
      } catch (err: any) {
        setError(parseAnchorError(err) ?? err?.message ?? 'failed to buy');
        setStatus('error');
      }
    },
    [args.currentShardIndex, args.lottery, args.round, connection, router, wallet],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setSignature(null);
  }, []);

  return { buy, reset, status, error, signature };
}

function parseAnchorError(err: unknown): string | null {
  const msg = String((err as Error)?.message ?? err);
  // Anchor errors are like "Error Code: RoundExpired. Error Number: …"
  const m = msg.match(/Error Code: (\w+)/);
  if (!m) return null;
  switch (m[1]) {
    case 'RoundExpired':
      return 'Round timer ended — wait for the draw';
    case 'LotteryPaused':
    case 'LotteryNotActive':
      return 'Lottery is paused';
    case 'TicketShardFull':
      return 'Ticket shard is full — admin needs to allocate a new one';
    default:
      return `${m[1]}: ${msg}`;
  }
}
