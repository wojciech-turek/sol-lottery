/**
 * Spin up N ephemeral keypairs, fund each from the deployer wallet, then
 * have each buy 1 ticket on the currently-active lottery. Useful for
 * generating multi-player state in the UI without juggling multiple
 * Solflare accounts.
 *
 * Run: `pnpm --filter scripts exec tsx many-buyers.ts [N=3]`
 */
import 'dotenv/config';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { Wallet } from '@coral-xyz/anchor';
import BN from 'bn.js';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  Transaction,
} from '@solana/web3.js';
import { createProgram, ticketShardPda } from '@sol-lottery/sdk';
import { prisma } from '@sol-lottery/db';

const RPC = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const WALLET_PATH =
  process.env.ANCHOR_WALLET ?? path.join(homedir(), '.config/solana/id.json');

const N = Number(process.argv[2] ?? 3);

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  const deployer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8'))),
  );
  const wallet = new Wallet(deployer);
  const program = createProgram(conn, wallet);

  const lotteries = await prisma.lottery.findMany({
    where: { state: 'ACTIVE' },
    orderBy: { lotteryIndex: 'desc' },
    take: 1,
  });
  if (lotteries.length === 0) throw new Error('no active lottery in DB');
  const lottery = new PublicKey(lotteries[0].pubkey);

  const lotteryAcct: any = await program.account.lottery.fetch(lottery);
  const currentRoundIndex = BigInt(lotteryAcct.currentRoundIndex.toString());
  const ticketPriceLamports = BigInt(
    lotteryAcct.ticketPriceLamports.toString(),
  );
  if (currentRoundIndex === 0n) throw new Error('lottery has no open round');

  const { roundPda } = await import('@sol-lottery/sdk');
  const round = roundPda(lottery, currentRoundIndex);
  const roundAcct: any = await program.account.round.fetch(round);
  const shard = ticketShardPda(round, Number(roundAcct.currentShard ?? 0));

  console.log(
    `lottery ${lottery.toBase58()} round #${currentRoundIndex} ` +
      `price=${Number(ticketPriceLamports) / LAMPORTS_PER_SOL} SOL`,
  );

  // Fund each buyer with enough to cover the ticket + tx fee + rent buffer.
  const fundAmount = Number(ticketPriceLamports) + 0.005 * LAMPORTS_PER_SOL;
  const buyers: Keypair[] = [];
  for (let i = 0; i < N; i++) buyers.push(Keypair.generate());

  console.log(`funding ${N} ephemeral buyers with ${fundAmount / LAMPORTS_PER_SOL} SOL each…`);
  const fundTx = new Transaction();
  for (const b of buyers) {
    fundTx.add(
      SystemProgram.transfer({
        fromPubkey: deployer.publicKey,
        toPubkey: b.publicKey,
        lamports: fundAmount,
      }),
    );
  }
  const fundSig = await sendAndConfirmTransaction(conn, fundTx, [deployer]);
  console.log(`  fund tx ${fundSig}`);

  for (const buyer of buyers) {
    try {
      const sig = await program.methods
        .buyTickets(new BN(1))
        .accountsPartial({
          lottery,
          round,
          currentShard: shard,
          buyer: buyer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();
      console.log(`  ${buyer.publicKey.toBase58()} bought 1 → ${sig}`);
    } catch (e) {
      console.error(`  ${buyer.publicKey.toBase58()} failed:`, (e as Error).message);
    }
  }

  console.log('done.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
