'use client';

import { BN } from '@coral-xyz/anchor';
import { Orao } from '@orao-network/solana-vrf';
import { AnchorProvider } from '@coral-xyz/anchor';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import {
  buildResolveAccounts,
  createProgram,
  globalConfigPda,
  lotteryPda,
  oraoNetworkState,
  oraoRandomnessAccount,
  ORAO_PROGRAM_ID,
  packAsciiBytes,
  roundPda,
  ticketShardPda,
} from '@sol-lottery/sdk';

interface LotteryRef {
  pubkey: string;
  currentRoundIndex: string;
  autoRollover: boolean;
}

export type AdminTxStatus = 'idle' | 'pending' | 'success' | 'error';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useAdminActions() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const router = useRouter();
  const [status, setStatus] = useState<AdminTxStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastCreatedPubkey, setLastCreatedPubkey] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const requireWallet = () => {
    if (!wallet) throw new Error('Connect a wallet first');
    return wallet;
  };

  const wrap = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setError(null);
      setProgress(label);
      setStatus('pending');
      try {
        await fn();
        setStatus('success');
        setProgress(null);
        router.refresh();
      } catch (err: any) {
        setError(parseAnchor(err) ?? err?.message ?? 'tx failed');
        setStatus('error');
        setProgress(null);
      }
    },
    [router],
  );

  const pause = useCallback(
    (lotteryRef: LotteryRef, roundPubkey: string | null) =>
      wrap('Pausing…', async () => {
        const w = requireWallet();
        const program = createProgram(connection, w);
        await program.methods
          .pauseLottery()
          .accountsPartial({
            globalConfig: globalConfigPda(),
            lottery: new PublicKey(lotteryRef.pubkey),
            round: roundPubkey ? new PublicKey(roundPubkey) : null,
            admin: w.publicKey,
          })
          .rpc();
      }),
    [connection, wrap, wallet],
  );

  const resume = useCallback(
    (lotteryRef: LotteryRef, roundPubkey: string | null) =>
      wrap('Resuming…', async () => {
        const w = requireWallet();
        const program = createProgram(connection, w);
        await program.methods
          .resumeLottery()
          .accountsPartial({
            globalConfig: globalConfigPda(),
            lottery: new PublicKey(lotteryRef.pubkey),
            round: roundPubkey ? new PublicKey(roundPubkey) : null,
            admin: w.publicKey,
          })
          .rpc();
      }),
    [connection, wrap, wallet],
  );

  const beginDisable = useCallback(
    (lotteryRef: LotteryRef) =>
      wrap('Disabling…', async () => {
        const w = requireWallet();
        const program = createProgram(connection, w);
        await program.methods
          .beginDisableLottery()
          .accountsPartial({
            globalConfig: globalConfigPda(),
            lottery: new PublicKey(lotteryRef.pubkey),
            admin: w.publicKey,
          })
          .rpc();
      }),
    [connection, wrap, wallet],
  );

  const closeLottery = useCallback(
    (lotteryRef: LotteryRef) =>
      wrap('Closing…', async () => {
        const w = requireWallet();
        const program = createProgram(connection, w);
        await program.methods
          .closeLottery()
          .accountsPartial({
            globalConfig: globalConfigPda(),
            lottery: new PublicKey(lotteryRef.pubkey),
            admin: w.publicKey,
          })
          .rpc();
      }),
    [connection, wrap, wallet],
  );

  const openNextRound = useCallback(
    (lotteryRef: LotteryRef) =>
      wrap('Opening round…', async () => {
        const w = requireWallet();
        const program = createProgram(connection, w);
        const lotteryPk = new PublicKey(lotteryRef.pubkey);
        const nextIndex = BigInt(lotteryRef.currentRoundIndex) + 1n;
        const next = roundPda(lotteryPk, nextIndex);
        const shard = ticketShardPda(next, 0);
        const previous =
          BigInt(lotteryRef.currentRoundIndex) > 0n
            ? roundPda(lotteryPk, BigInt(lotteryRef.currentRoundIndex))
            : null;
        await program.methods
          .openRound(new BN(nextIndex.toString()))
          .accountsPartial({
            globalConfig: globalConfigPda(),
            lottery: lotteryPk,
            previousRound: previous,
            round: next,
            shardZero: shard,
            payer: w.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }),
    [connection, wrap, wallet],
  );

  const updatePrice = useCallback(
    (lotteryRef: LotteryRef, newPriceLamports: bigint) =>
      wrap('Saving price…', async () => {
        const w = requireWallet();
        const program = createProgram(connection, w);
        await program.methods
          .updateLotteryPrice(new BN(newPriceLamports.toString()))
          .accountsPartial({
            globalConfig: globalConfigPda(),
            lottery: new PublicKey(lotteryRef.pubkey),
            admin: w.publicKey,
          })
          .rpc();
      }),
    [connection, wrap, wallet],
  );

  const updateDuration = useCallback(
    (lotteryRef: LotteryRef, newDurationSeconds: number) =>
      wrap('Saving duration…', async () => {
        const w = requireWallet();
        const program = createProgram(connection, w);
        await program.methods
          .updateLotteryDuration(new BN(newDurationSeconds))
          .accountsPartial({
            globalConfig: globalConfigPda(),
            lottery: new PublicKey(lotteryRef.pubkey),
            admin: w.publicKey,
          })
          .rpc();
      }),
    [connection, wrap, wallet],
  );

  const updateSplits = useCallback(
    (
      lotteryRef: LotteryRef,
      splits: Array<{
        label: string;
        destination: string;
        bps: number;
        isPool: boolean;
      }>,
    ) =>
      wrap('Saving splits…', async () => {
        const w = requireWallet();
        const program = createProgram(connection, w);
        await program.methods
          .updateLotterySplits(
            splits.map((s) => ({
              label: packAsciiBytes(s.label, 16),
              destination: new PublicKey(s.destination),
              bps: s.bps,
              isPool: s.isPool,
            })),
          )
          .accountsPartial({
            globalConfig: globalConfigPda(),
            lottery: new PublicKey(lotteryRef.pubkey),
            admin: w.publicKey,
          })
          .rpc();
      }),
    [connection, wrap, wallet],
  );

  /**
   * Drives the full ORAO resolve. Steps:
   *   1. requestOraoResolution (CPI to ORAO; pays a small fee)
   *   2. poll ORAO until oracles fulfill the randomness
   *   3. consumeOraoResolution (with rollover accounts when auto_rollover)
   */
  const resolveNow = useCallback(
    (lotteryRef: LotteryRef, roundPubkey: string) =>
      wrap('Requesting randomness…', async () => {
        const w = requireWallet();
        const program = createProgram(connection, w);
        const provider = new AnchorProvider(
          connection,
          w as unknown as ConstructorParameters<typeof AnchorProvider>[1],
          AnchorProvider.defaultOptions(),
        );
        const oraoClient = new Orao(provider);
        const lotteryPk = new PublicKey(lotteryRef.pubkey);
        const roundPk = new PublicKey(roundPubkey);

        // 1. Read ORAO treasury (config.treasury at offset 40 in network_state).
        const networkStatePda = oraoNetworkState();
        const networkAcct = await connection.getAccountInfo(networkStatePda);
        if (!networkAcct) throw new Error('ORAO network_state missing on this cluster');
        const treasury = new PublicKey(networkAcct.data.subarray(40, 72));

        const vrfRequest = oraoRandomnessAccount(roundPk);

        // 2. Request randomness (idempotent — if already requested, skip).
        try {
          await program.methods
            .requestOraoResolution()
            .accountsPartial({
              globalConfig: globalConfigPda(),
              lottery: lotteryPk,
              round: roundPk,
              vrfRequest,
              vrfTreasury: treasury,
              vrfNetworkState: networkStatePda,
              vrfProgram: ORAO_PROGRAM_ID,
              caller: w.publicKey,
              systemProgram: SystemProgram.programId,
            })
            .rpc();
        } catch (err: any) {
          if (!String(err).includes('RoundAlreadyResolved')) {
            // RoundAlreadyResolved means we're past this step; otherwise rethrow.
            const msg = String(err);
            if (!msg.includes('VrfAlreadyRequested')) throw err;
          }
        }

        // 3. Poll for fulfillment.
        setProgress('Waiting for ORAO oracles…');
        const start = Date.now();
        let randomness: Buffer | null = null;
        while (Date.now() - start < 120_000) {
          try {
            const acct = await oraoClient.getRandomness(roundPk.toBytes());
            const data = (acct as any).getFulfilledRandomness?.();
            if (data && data.length === 64) {
              randomness = Buffer.from(data);
              break;
            }
          } catch {
            /* keep polling */
          }
          await sleep(2_000);
        }
        if (!randomness) throw new Error('ORAO did not fulfill within 120s');

        // 4. Consume.
        setProgress('Consuming randomness…');
        const accounts = await buildResolveAccounts(
          program,
          roundPk,
          randomness,
          { rollover: lotteryRef.autoRollover },
        );
        await program.methods
          .consumeOraoResolution()
          .accountsPartial({
            globalConfig: globalConfigPda(),
            lottery: lotteryPk,
            round: roundPk,
            vrfRequest,
            winnerShard: accounts.winnerShard,
            caller: w.publicKey,
            nextRound: accounts.nextRound,
            nextShard: accounts.nextShard,
            systemProgram: accounts.systemProgram,
          })
          .remainingAccounts(accounts.remainingAccounts)
          .rpc();
      }),
    [connection, wrap, wallet],
  );

  /**
   * Creates a brand-new lottery and immediately opens round 1.
   */
  const createLottery = useCallback(
    async (input: {
      name: string;
      durationSeconds: number;
      ticketPriceSol: number;
      prizeKind: 'sol' | 'physical';
      autoRollover: boolean;
      manualResolution: boolean;
      splits: Array<{
        label: string;
        destination: string;
        bps: number;
        isPool: boolean;
      }>;
    }) =>
      wrap('Creating lottery…', async () => {
        const w = requireWallet();
        const program = createProgram(connection, w);

        // Read GlobalConfig.next_lottery_id to know the new lottery's id.
        const cfgPda = globalConfigPda();
        const cfg: any = await program.account.globalConfig.fetch(cfgPda);
        const nextId = BigInt(cfg.nextLotteryId.toString());
        const newLottery = lotteryPda(nextId);
        setLastCreatedPubkey(newLottery.toBase58());

        await program.methods
          .createLottery(
            packAsciiBytes(input.name, 32),
            new BN(input.durationSeconds),
            new BN(Math.floor(input.ticketPriceSol * 1_000_000_000)),
            input.prizeKind === 'physical' ? { physical: {} } : { sol: {} },
            input.autoRollover,
            input.splits.map((s) => ({
              label: packAsciiBytes(s.label, 16),
              destination: new PublicKey(s.destination),
              bps: s.bps,
              isPool: s.isPool,
            })),
          )
          .accountsPartial({
            globalConfig: cfgPda,
            lottery: newLottery,
            admin: w.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        // Open round 1 in a follow-up transaction.
        setProgress('Opening round 1…');
        const round1 = roundPda(newLottery, 1n);
        const shard0 = ticketShardPda(round1, 0);
        await program.methods
          .openRound(new BN(1))
          .accountsPartial({
            globalConfig: cfgPda,
            lottery: newLottery,
            previousRound: null,
            round: round1,
            shardZero: shard0,
            payer: w.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        // Persist the manualResolution preference. The indexer will pick up
        // the LotteryCreated event and create the DB row; this PATCH waits
        // briefly for that row to exist and then sets the flag.
        setProgress('Saving lottery preferences…');
        try {
          await fetch('/api/admin/lottery/config', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              pubkey: newLottery.toBase58(),
              manualResolution: input.manualResolution,
            }),
          });
        } catch {
          /* non-fatal — defaults to auto-resolution */
        }
      }),
    [connection, wrap, wallet],
  );

  return {
    status,
    error,
    progress,
    lastCreatedPubkey,
    pause,
    resume,
    beginDisable,
    closeLottery,
    openNextRound,
    updatePrice,
    updateDuration,
    updateSplits,
    resolveNow,
    createLottery,
  };
}

function parseAnchor(err: unknown): string | null {
  const msg = String((err as Error)?.message ?? err);
  const m = msg.match(/Error Code: (\w+)/);
  return m ? m[1] : null;
}
