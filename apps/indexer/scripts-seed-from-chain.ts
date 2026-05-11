/**
 * One-shot: read every on-chain Lottery the program owns and upsert it
 * (plus the current Round) into Postgres. Use after creating a lottery
 * before the live indexer was running, or to recover from a wiped DB.
 */
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { createProgram, unpackAsciiBytes, roundPda } from '@sol-lottery/sdk';
import { prisma, LotteryState, PrizeKind, RoundState } from '@sol-lottery/db';

const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC ?? 'https://api.devnet.solana.com';

const STUB: Wallet = {
  publicKey: new PublicKey('11111111111111111111111111111111'),
  signTransaction: async (tx) => tx,
  signAllTransactions: async (txs) => txs,
  payer: Keypair.generate(),
};

const stateMap: Record<string, LotteryState> = {
  active: 'ACTIVE',
  paused: 'PAUSED',
  pendingDisable: 'PENDING_DISABLE',
  disabled: 'DISABLED',
};
const roundStateMap: Record<string, RoundState> = {
  open: 'OPEN',
  closed: 'CLOSED',
  awaitingVrf: 'AWAITING_VRF',
  resolved: 'RESOLVED',
};

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  const program = createProgram(conn, STUB);
  const lotteries = await program.account.lottery.all();
  console.log(`found ${lotteries.length} on-chain lotteries`);

  for (const entry of lotteries) {
    const a: any = entry.account;
    const stateKey = Object.keys(a.state)[0] as keyof typeof stateMap;
    const prizeKey = Object.keys(a.prizeKind)[0] as 'sol' | 'physical';
    const splits = (a.splits as any[]).map((s) => ({
      label: unpackAsciiBytes(s.label),
      destination: (s.destination as PublicKey).toBase58(),
      bps: s.bps as number,
      isPool: s.isPool as boolean,
    }));
    const lotteryPubkey = entry.publicKey.toBase58();
    const lotteryIndex = BigInt(a.id.toString());
    const name = unpackAsciiBytes(a.name);
    const ticketPriceLamports = BigInt(a.ticketPriceLamports.toString());
    const durationSeconds = BigInt(a.roundDurationSeconds.toString());
    const adminPubkey = (a.admin?.toBase58?.() ?? null) as string | null;

    await prisma.lottery.upsert({
      where: { pubkey: lotteryPubkey },
      create: {
        pubkey: lotteryPubkey,
        lotteryIndex,
        name,
        state: stateMap[stateKey],
        prizeKind: (prizeKey === 'sol' ? 'SOL' : 'PHYSICAL') as PrizeKind,
        ticketPriceLamports,
        durationSeconds,
        autoRollover: !!a.autoRollover,
        admin: adminPubkey ?? lotteryPubkey, // chain doesn't store per-lottery admin; fallback
        createdAt: new Date(Number(a.createdAt) * 1000),
        updatedAt: new Date(),
      },
      update: {
        state: stateMap[stateKey],
        ticketPriceLamports,
        durationSeconds,
        autoRollover: !!a.autoRollover,
        updatedAt: new Date(),
      },
    });
    console.log(`  upserted lottery ${name} (${lotteryPubkey}) state=${stateMap[stateKey]}`);

    const currentRoundIndex = BigInt(a.currentRoundIndex.toString());
    if (currentRoundIndex === 0n) continue;
    const roundKey = roundPda(entry.publicKey, currentRoundIndex);
    try {
      const r: any = await program.account.round.fetch(roundKey);
      const rStateKey = Object.keys(r.state)[0] as keyof typeof roundStateMap;
      const startedAt = Number(r.startedAt);
      const durationSec = Number(r.durationSeconds);
      const pausedTotalSec = Number(r.pausedTotalSeconds);
      await prisma.lotteryRound.upsert({
        where: { pubkey: roundKey.toBase58() },
        create: {
          pubkey: roundKey.toBase58(),
          lotteryPubkey,
          index: BigInt(r.index.toString()),
          state: roundStateMap[rStateKey],
          ticketPriceLamports: BigInt(r.ticketPriceLamports.toString()),
          durationSeconds: BigInt(durationSec),
          pausedTotalSeconds: BigInt(pausedTotalSec),
          startedAt: new Date(startedAt * 1000),
          effectiveEnd: new Date((startedAt + durationSec + pausedTotalSec) * 1000),
          ticketsSold: BigInt(r.ticketsSold.toString()),
          donatedLamports: BigInt(r.donatedLamports.toString()),
        },
        update: {
          state: roundStateMap[rStateKey],
          ticketsSold: BigInt(r.ticketsSold.toString()),
          donatedLamports: BigInt(r.donatedLamports.toString()),
          pausedTotalSeconds: BigInt(pausedTotalSec),
        },
      });
      console.log(`    upserted round ${r.index} state=${roundStateMap[rStateKey]}`);
    } catch (e) {
      console.log(`    (round fetch failed: ${(e as Error).message})`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
