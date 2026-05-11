/**
 * Periodic shard tracker.
 *
 * The on-chain `allocate_shard` instruction mutates `Round.current_shard`
 * but doesn't emit an event, so the indexer can't catch shard rotations
 * via log subscription. This tracker fetches every OPEN round's account
 * on a slow tick (default 15s) and writes the observed shard index back
 * to Postgres. The frontend reads `LotteryRound.currentShardIndex` from
 * the DB to derive the correct shard PDA for buy_tickets — without this
 * loop, a freshly rotated shard would be invisible to the website.
 *
 * Runs independently of the resolver: shards rotate even for lotteries
 * with `manualResolution=true` or while the resolver is disabled.
 */
import type { Wallet } from '@coral-xyz/anchor';
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { createProgram, type LotteryProgram } from '@sol-lottery/sdk';
import { prisma } from '@sol-lottery/db';

const TICK_MS = Number(process.env.SHARD_TRACKER_TICK_MS ?? 15_000);

async function tick(program: LotteryProgram): Promise<void> {
  const openRounds = await prisma.lotteryRound.findMany({
    where: { state: 'OPEN' },
    select: { pubkey: true, currentShardIndex: true },
  });
  for (const row of openRounds) {
    try {
      const account = (await program.account.round.fetch(
        new PublicKey(row.pubkey),
      )) as unknown as { currentShard?: number };
      const observed = Number(account.currentShard ?? 0);
      if (observed === row.currentShardIndex) continue;
      await prisma.lotteryRound.update({
        where: { pubkey: row.pubkey },
        data: { currentShardIndex: observed },
      });
    } catch (err) {
      // Round account may be transiently unavailable (just resolved, etc.).
      // Next tick will catch it.
      console.warn(
        `[shard-tracker] ${row.pubkey} read failed`,
        (err as Error).message,
      );
    }
  }
}

export async function startShardTracker(connection: Connection): Promise<void> {
  if (process.env.SHARD_TRACKER_DISABLED === '1') {
    console.log('[shard-tracker] disabled via SHARD_TRACKER_DISABLED=1');
    return;
  }
  // Stub wallet — we only do reads.
  const stubWallet: Wallet = {
    publicKey: new PublicKey('11111111111111111111111111111111'),
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => tx,
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs,
    // payer is required on the Wallet type but unused for reads.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payer: undefined as any,
  };
  const program = createProgram(connection, stubWallet);
  console.log(`[shard-tracker] running every ${TICK_MS}ms`);
  const loop = async () => {
    try {
      await tick(program);
    } catch (err) {
      console.error('[shard-tracker] tick crash', err);
    }
  };
  await loop();
  setInterval(loop, TICK_MS);
}
