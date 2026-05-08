/**
 * Devnet smoke test: drives a full lottery cycle against the deployed
 * program, then queries Postgres to verify the indexer captured everything.
 *
 * Run with the indexer already streaming (separate terminal):
 *   pnpm --filter indexer dev
 *
 * Then:
 *   pnpm tsx scripts/devnet-smoke.ts
 *
 * Reads:
 *   - SOLANA_RPC_URL (default https://api.devnet.solana.com)
 *   - ANCHOR_WALLET (default ~/.config/solana/id.json)
 *   - DATABASE_URL  (read by @sol-lottery/db)
 */
import 'dotenv/config';
import * as anchor from '@coral-xyz/anchor';
import BN from 'bn.js';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
} from '@solana/web3.js';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  buildResolveAccounts,
  createProgram,
  globalConfigPda,
  lotteryPda,
  roundPda,
  ticketShardPda,
  packAsciiBytes,
} from '@sol-lottery/sdk';
import { prisma } from '@sol-lottery/db';

const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const WALLET_PATH =
  process.env.ANCHOR_WALLET ?? path.join(homedir(), '.config/solana/id.json');

const log = (msg: string) => console.log(`[smoke] ${msg}`);

async function main() {
  log(`RPC: ${RPC_URL}`);
  log(`wallet: ${WALLET_PATH}`);

  const conn = new Connection(RPC_URL, 'confirmed');
  const adminKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8'))),
  );
  const wallet = new anchor.Wallet(adminKeypair);
  const program = createProgram(conn, wallet);

  log(`admin: ${adminKeypair.publicKey.toBase58()}`);
  const adminBal = await conn.getBalance(adminKeypair.publicKey);
  log(`admin balance: ${(adminBal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  if (adminBal < 0.5 * LAMPORTS_PER_SOL) {
    throw new Error('Admin wallet needs at least 0.5 SOL on devnet to run this');
  }

  // 1. Init global config (idempotent).
  const cfg = globalConfigPda();
  const existing = await conn.getAccountInfo(cfg);
  if (!existing) {
    log('initializing global config…');
    await program.methods
      .initializeGlobal(PublicKey.default, PublicKey.default)
      .accounts({
        globalConfig: cfg,
        admin: adminKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminKeypair])
      .rpc();
  } else {
    log('global config already exists');
  }

  // 2. Create a fresh lottery.
  const cfgAcct = await program.account.globalConfig.fetch(cfg);
  const id = BigInt(cfgAcct.nextLotteryId.toString());
  const lottery = lotteryPda(id);

  const dev = Keypair.generate();
  // Fund dev a tiny amount so direct lamport credit at resolve works.
  await transfer(conn, adminKeypair, dev.publicKey, 0.002);

  log(`creating lottery ${id} → ${lottery.toBase58()}`);
  await program.methods
    .createLottery(
      packAsciiBytes('Devnet Smoke', 32),
      new BN(60), // 60s duration
      new BN(0.01 * LAMPORTS_PER_SOL),
      { sol: {} },
      false,
      [
        {
          label: packAsciiBytes('pool', 16),
          destination: PublicKey.default,
          bps: 8000,
          isPool: true,
        },
        {
          label: packAsciiBytes('dev', 16),
          destination: dev.publicKey,
          bps: 2000,
          isPool: false,
        },
      ],
    )
    .accounts({
      globalConfig: cfg,
      lottery,
      admin: adminKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([adminKeypair])
    .rpc();

  // 3. Open round 1.
  const round = roundPda(lottery, 1n);
  const shard0 = ticketShardPda(round, 0);
  log(`opening round 1 → ${round.toBase58()}`);
  await program.methods
    .openRound(new BN(1))
    .accounts({
      globalConfig: cfg,
      lottery,
      previousRound: null,
      round,
      shardZero: shard0,
      payer: adminKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([adminKeypair])
    .rpc();

  // 4. Buy tickets from a fresh wallet.
  const buyer = Keypair.generate();
  await transfer(conn, adminKeypair, buyer.publicKey, 0.2);

  log(`buying 5 tickets from ${buyer.publicKey.toBase58()}…`);
  await program.methods
    .buyTickets(new BN(5))
    .accounts({
      lottery,
      round,
      currentShard: shard0,
      buyer: buyer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([buyer])
    .rpc();

  // 4b. Admin tops up the prize pool by 0.1 SOL.
  const donationLamports = 0.1 * LAMPORTS_PER_SOL;
  log(`donating 0.1 SOL to round prize pool…`);
  await program.methods
    .donateToRound(new BN(donationLamports))
    .accounts({
      lottery,
      round,
      donor: adminKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([adminKeypair])
    .rpc();

  // 5. Admin-resolve. The SDK helper does the off-chain pre-computation
  //    (which shard holds the winner, what destinations to pass) so the
  //    caller doesn't need to know about shards or splits.
  const seed = new Uint8Array(32);
  seed[0] = 0x07;
  log('resolving via admin path…');
  const resolveAccts = await buildResolveAccounts(program, round, seed);
  log(`  → winner ${resolveAccts.winner.toBase58()} at index ${resolveAccts.winnerIndex}`);
  await program.methods
    .resolveRound(Array.from(seed))
    .accounts({
      globalConfig: cfg,
      lottery,
      round,
      winnerShard: resolveAccts.winnerShard,
      admin: adminKeypair.publicKey,
      nextRound: resolveAccts.nextRound,
      nextShard: resolveAccts.nextShard,
      systemProgram: resolveAccts.systemProgram,
    })
    .remainingAccounts(resolveAccts.remainingAccounts)
    .signers([adminKeypair])
    .rpc();

  // 6. Give the indexer a moment to catch up.
  log('waiting 20s for the indexer to flush events to Postgres…');
  await new Promise((r) => setTimeout(r, 20_000));

  // 7. Verify the DB.
  log('--- DB verification ---');
  const dbLottery = await prisma.lottery.findUnique({
    where: { pubkey: lottery.toBase58() },
  });
  const dbRound = await prisma.lotteryRound.findUnique({
    where: { pubkey: round.toBase58() },
  });
  const dbTickets = await prisma.ticketPurchase.findMany({
    where: { roundPubkey: round.toBase58() },
  });
  const dbRawCount = await prisma.rawEvent.count();

  console.log('lottery row     :', dbLottery && {
    pubkey: dbLottery.pubkey,
    name: dbLottery.name,
    state: dbLottery.state,
    lotteryIndex: dbLottery.lotteryIndex.toString(),
  });
  console.log('round row       :', dbRound && {
    pubkey: dbRound.pubkey,
    state: dbRound.state,
    ticketsSold: dbRound.ticketsSold.toString(),
    donatedLamports: dbRound.donatedLamports.toString(),
    winner: dbRound.winner,
    pool: dbRound.poolAmountLamports?.toString(),
  });
  const dbDonations = await prisma.donation.findMany({
    where: { roundPubkey: round.toBase58() },
  });
  console.log('donation rows   :', dbDonations.map((d) => ({
    sig: d.txSignature,
    amount: d.amountLamports.toString(),
  })));
  console.log('ticket rows     :', dbTickets.map((t) => ({
    sig: t.txSignature,
    qty: t.quantity.toString(),
    runningTotal: t.runningTotal.toString(),
  })));
  console.log('raw_event count :', dbRawCount);

  // Assertions
  const errors: string[] = [];
  if (!dbLottery) errors.push('lottery row missing');
  else if (dbLottery.state !== 'ACTIVE')
    errors.push(`lottery state ${dbLottery.state} != ACTIVE`);

  if (!dbRound) errors.push('round row missing');
  else {
    if (dbRound.state !== 'RESOLVED')
      errors.push(`round state ${dbRound.state} != RESOLVED`);
    if (dbRound.ticketsSold.toString() !== '5')
      errors.push(`ticketsSold ${dbRound.ticketsSold} != 5`);
    if (dbRound.winner !== buyer.publicKey.toBase58())
      errors.push(`winner ${dbRound.winner} != ${buyer.publicKey.toBase58()}`);
  }

  if (dbTickets.length === 0) errors.push('no ticket_purchase rows');

  if (dbRound) {
    if (dbRound.donatedLamports.toString() !== donationLamports.toString())
      errors.push(
        `donatedLamports ${dbRound.donatedLamports} != ${donationLamports}`,
      );
    // pool = gross * 0.8 + donation = 5 * 0.01 SOL * 0.8 + 0.1 SOL = 0.14 SOL
    const expectedPool = 0.04 * LAMPORTS_PER_SOL + donationLamports;
    if (dbRound.poolAmountLamports?.toString() !== expectedPool.toString())
      errors.push(
        `poolAmountLamports ${dbRound.poolAmountLamports} != ${expectedPool}`,
      );
  }
  if (dbDonations.length !== 1)
    errors.push(`donation rows ${dbDonations.length} != 1`);

  await prisma.$disconnect();

  if (errors.length) {
    log('❌ FAILURES:');
    errors.forEach((e) => console.log('  -', e));
    process.exit(1);
  }
  log('✅ all assertions passed');
}

async function transfer(
  conn: Connection,
  from: Keypair,
  to: PublicKey,
  sol: number,
) {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from.publicKey,
      toPubkey: to,
      lamports: Math.floor(sol * LAMPORTS_PER_SOL),
    }),
  );
  const sig = await conn.sendTransaction(tx, [from]);
  await conn.confirmTransaction(sig, 'confirmed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
