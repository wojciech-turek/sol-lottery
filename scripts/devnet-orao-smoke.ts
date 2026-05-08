/**
 * Devnet ORAO VRF smoke test.
 *
 * Drives `request_orao_resolution` → wait for ORAO oracle fulfillment →
 * `consume_orao_resolution`, all against the live ORAO program on devnet.
 *
 * Prereqs: indexer is streaming, deploy wallet has ≥ 0.5 SOL on devnet
 * (ORAO's request fee is paid from the caller).
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
  ORAO_PROGRAM_ID,
  oraoNetworkState,
  oraoRandomnessAccount,
  roundPda,
  ticketShardPda,
  packAsciiBytes,
} from '@sol-lottery/sdk';
import { prisma } from '@sol-lottery/db';

const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const WALLET_PATH =
  process.env.ANCHOR_WALLET ?? path.join(homedir(), '.config/solana/id.json');


const log = (msg: string) => console.log(`[orao-smoke] ${msg}`);

async function main() {
  log(`RPC: ${RPC_URL}`);
  const conn = new Connection(RPC_URL, 'confirmed');
  const adminKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8'))),
  );
  const wallet = new anchor.Wallet(adminKeypair);
  const program = createProgram(conn, wallet);

  log(`admin: ${adminKeypair.publicKey.toBase58()}`);
  const adminBal = await conn.getBalance(adminKeypair.publicKey);
  log(`admin balance: ${(adminBal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  // Resolve the ORAO accounts we need. The SDK exposes the PDA helpers;
  // the treasury we still pull from network_state's bytes.
  const networkStatePda = oraoNetworkState();
  const networkStateAcct = await conn.getAccountInfo(networkStatePda);
  if (!networkStateAcct) {
    throw new Error('ORAO network_state not found on devnet');
  }
  // NetworkState layout: 8-byte discriminator, then Config:
  //   authority (32) | treasury (32) | request_fee (8) | …
  const treasury = new PublicKey(networkStateAcct.data.subarray(40, 72));
  log(`ORAO network_state: ${networkStatePda.toBase58()}`);
  log(`ORAO treasury     : ${treasury.toBase58()}`);

  // 1. Global config must already exist (run scripts/devnet-smoke.ts first).
  const cfg = globalConfigPda();
  if (!(await conn.getAccountInfo(cfg))) {
    throw new Error('Run pnpm --filter scripts smoke:devnet first to init global');
  }

  // 2. Create a fresh lottery with a 5-second round.
  const cfgAcct = await program.account.globalConfig.fetch(cfg);
  const id = BigInt(cfgAcct.nextLotteryId.toString());
  const lottery = lotteryPda(id);

  const dev = Keypair.generate();
  await transfer(conn, adminKeypair, dev.publicKey, 0.002);

  log(`creating lottery ${id} → ${lottery.toBase58()}`);
  await program.methods
    .createLottery(
      packAsciiBytes('ORAO Devnet', 32),
      new BN(5),
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

  // 4. Single buyer purchases 3 tickets.
  const buyer = Keypair.generate();
  await transfer(conn, adminKeypair, buyer.publicKey, 0.1);
  log(`buying 3 tickets from ${buyer.publicKey.toBase58()}…`);
  await program.methods
    .buyTickets(new BN(3))
    .accounts({
      lottery,
      round,
      currentShard: shard0,
      buyer: buyer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([buyer])
    .rpc();

  // 5. Wait for the timer to elapse.
  log('waiting 6s for the round timer to elapse…');
  await new Promise((r) => setTimeout(r, 6_000));

  // 6. Request ORAO randomness.
  const oraoVrfRequest = oraoRandomnessAccount(round);

  log(`requesting ORAO randomness (account ${oraoVrfRequest.toBase58()})…`);
  await program.methods
    .requestOraoResolution()
    .accounts({
      globalConfig: cfg,
      lottery,
      round,
      vrfRequest: oraoVrfRequest,
      vrfTreasury: treasury,
      vrfNetworkState: networkStatePda,
      vrfProgram: ORAO_PROGRAM_ID,
      caller: adminKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([adminKeypair])
    .rpc();

  // 7. Drive consumption to completion. The on-chain handler is the source
  //    of truth for "is randomness fulfilled" — we just try, and if we get
  //    `VrfNotFulfilled` (error code 6034) we wait and retry. Off-chain
  //    inspection of ORAO's account layout is unreliable across versions.
  log('attempting consumeOraoResolution (will retry until ORAO fulfills)…');
  const start = Date.now();
  const fulfillmentTimeoutMs = 120_000;
  let consumed = false;
  let lastErr: any = null;
  while (Date.now() - start < fulfillmentTimeoutMs) {
    try {
      // Read whatever ORAO has now and try; the program will reject with
      // VrfNotFulfilled if it isn't fulfilled yet.
      const oraoAcct = await conn.getAccountInfo(oraoVrfRequest);
      const randomness = oraoAcct
        ? Buffer.from(oraoAcct.data.subarray(0, 64))
        : Buffer.alloc(64);
      const resolveAccts = await buildResolveAccounts(program, round, randomness);
      await program.methods
        .consumeOraoResolution()
        .accounts({
          globalConfig: cfg,
          lottery,
          round,
          vrfRequest: oraoVrfRequest,
          winnerShard: resolveAccts.winnerShard,
          caller: adminKeypair.publicKey,
          nextRound: resolveAccts.nextRound,
          nextShard: resolveAccts.nextShard,
          systemProgram: resolveAccts.systemProgram,
        })
        .remainingAccounts(resolveAccts.remainingAccounts)
        .signers([adminKeypair])
        .rpc();
      log(
        `consumed after ${((Date.now() - start) / 1000).toFixed(1)}s ` +
          `(winner ${resolveAccts.winner.toBase58()}, index ${resolveAccts.winnerIndex})`,
      );
      consumed = true;
      break;
    } catch (err: any) {
      lastErr = err;
      if (!String(err).includes('VrfNotFulfilled')) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
  if (!consumed) {
    throw lastErr ?? new Error('ORAO timeout');
  }

  log('waiting 15s for indexer to catch up…');
  await new Promise((r) => setTimeout(r, 15_000));

  // 9. Verify DB.
  log('--- DB verification ---');
  const dbRound = await prisma.lotteryRound.findUnique({
    where: { pubkey: round.toBase58() },
  });
  console.log('round row :', dbRound && {
    state: dbRound.state,
    winner: dbRound.winner,
    pool: dbRound.poolAmountLamports?.toString(),
  });

  const errors: string[] = [];
  if (!dbRound) errors.push('round row missing');
  else {
    if (dbRound.state !== 'RESOLVED')
      errors.push(`round state ${dbRound.state} != RESOLVED`);
    if (dbRound.winner !== buyer.publicKey.toBase58())
      errors.push('winner is not the buyer');
  }

  await prisma.$disconnect();
  if (errors.length) {
    log('❌ FAILURES:');
    errors.forEach((e) => console.log('  -', e));
    process.exit(1);
  }
  log('✅ ORAO live VRF flow complete');
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
