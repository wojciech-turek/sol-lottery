'use client';

import { BN } from '@coral-xyz/anchor';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { createProgram, ticketShardPda } from '@sol-lottery/sdk';

import {
  SNAPSHOT_KEY,
  type SnapshotResponse,
} from '@/hooks/use-lottery-snapshot';

interface BuyArgs {
  lottery: string;
  round: string;
  currentShardIndex: number;
}

type Status = 'idle' | 'sending' | 'confirming' | 'success' | 'error';

export function useBuyTicket(args: BuyArgs) {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const queryClient = useQueryClient();
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
        console.log('[buy] tx accounts', {
          lottery: lotteryPk.toBase58(),
          round: roundPk.toBase58(),
          currentShard: shardPk.toBase58(),
          buyer: wallet.publicKey.toBase58(),
          quantity,
        });

        // Anchor's provider-driven send path (uses signAllTransactions under
        // the hood) plays more reliably with Solflare than a bare
        // signTransaction + sendRawTransaction.
        const sig = await program.methods
          .buyTickets(new BN(quantity))
          .accountsPartial({
            lottery: lotteryPk,
            round: roundPk,
            currentShard: shardPk,
            buyer: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc({ skipPreflight: false, commitment: 'confirmed' });
        setSignature(sig);
        setStatus('confirming');
        await connection.confirmTransaction(sig, 'confirmed');
        setStatus('success');

        // Optimistic bump so the user sees their pool/tickets jump
        // immediately. The indexer typically commits the new ticket_purchase
        // and lottery_round update within ~200–500 ms, at which point
        // Supabase Realtime fires `postgres_changes` and the snapshot
        // refetches to the authoritative value. The invalidate call below
        // also fans out to ['lottery','tickets', …] so the tickets card
        // catches up alongside.
        queryClient.setQueryData<SnapshotResponse | undefined>(
          SNAPSHOT_KEY,
          (prev) => {
            if (!prev?.snapshot) return prev;
            if (prev.snapshot.round.pubkey !== args.round) return prev;
            const price = BigInt(prev.snapshot.lottery.ticketPriceLamports);
            const qty = BigInt(quantity);
            const newTickets = BigInt(prev.snapshot.round.ticketsSold) + qty;
            const newPool = BigInt(prev.snapshot.round.poolLamports) + price * qty;
            return {
              snapshot: {
                ...prev.snapshot,
                round: {
                  ...prev.snapshot.round,
                  ticketsSold: newTickets.toString(),
                  poolLamports: newPool.toString(),
                },
              },
            };
          },
        );
        void queryClient.invalidateQueries({ queryKey: ['lottery'] });
      } catch (err) {
        console.error('[buy] failed', err);
        const msg =
          err instanceof Error ? err.message : 'failed to buy';
        const code = anchorErrorCode(err);
        setError(anchorErrorMessage(code) ?? msg);
        setStatus('error');
        // Shard rotated on chain but we hadn't picked it up yet
        // (shard-tracker has up to ~15s of staleness). Force a snapshot
        // refetch so the next click has the correct shard PDA — the
        // indexer's shard-tracker will have written the new index by now.
        if (code === 'TicketShardFull') {
          void queryClient.invalidateQueries({ queryKey: SNAPSHOT_KEY });
        }
      }
    },
    [
      args.currentShardIndex,
      args.lottery,
      args.round,
      connection,
      queryClient,
      wallet,
    ],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setSignature(null);
  }, []);

  return { buy, reset, status, error, signature };
}

function anchorErrorCode(err: unknown): string | null {
  const msg = String((err as Error)?.message ?? err);
  // Anchor errors are like "Error Code: RoundExpired. Error Number: …"
  const m = msg.match(/Error Code: (\w+)/);
  return m ? m[1] : null;
}

function anchorErrorMessage(code: string | null): string | null {
  if (!code) return null;
  switch (code) {
    case 'RoundExpired':
      return 'Round timer ended — wait for the draw';
    case 'LotteryPaused':
    case 'LotteryNotActive':
      return 'Lottery is paused';
    case 'TicketShardFull':
      return 'Shard rotated — try again';
    default:
      return code;
  }
}
