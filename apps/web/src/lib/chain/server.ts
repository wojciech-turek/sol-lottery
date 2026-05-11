/**
 * Server-side Solana RPC helpers.
 *
 * The website is a DB-backed read replica — the only place this module is
 * called from is `lib/chain/lottery-config.ts`, which lazily reads the
 * immutable bits of a Lottery account once per lottery per server process.
 * Every other read goes through Prisma against the indexer-populated DB.
 *
 * The "wallet" passed into `createProgram` is a no-op stub — signing
 * always happens client-side with a real wallet adapter.
 */
import 'server-only';

import { Wallet } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { createProgram, type LotteryProgram } from '@sol-lottery/sdk';

import { clientEnv } from '../env';

const STUB_WALLET: Wallet = {
  publicKey: new PublicKey('11111111111111111111111111111111'),
  signTransaction: async (tx) => tx,
  signAllTransactions: async (txs) => txs,
  payer: Keypair.generate(),
};

let cached: { connection: Connection; program: LotteryProgram } | null = null;

export const getServerProgram = (): {
  connection: Connection;
  program: LotteryProgram;
} => {
  if (cached) return cached;
  const connection = new Connection(clientEnv.NEXT_PUBLIC_SOLANA_RPC, 'confirmed');
  const program = createProgram(connection, STUB_WALLET);
  cached = { connection, program };
  return cached;
};
