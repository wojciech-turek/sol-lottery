import { AnchorProvider, Program, type Wallet } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';

import lotteryIdl from '../../../target/idl/lottery.json';
import type { Lottery } from '../../../target/types/lottery';

export type LotteryProgram = Program<Lottery>;
export type { Lottery } from '../../../target/types/lottery';

/** The program id baked into the IDL by `anchor build`. */
export const PROGRAM_ID = new PublicKey((lotteryIdl as { address: string }).address);

/** Builds a typed `Program<Lottery>` against the provided connection + wallet. */
export function createProgram(connection: Connection, wallet: Wallet): LotteryProgram {
  const provider = new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
  return new Program<Lottery>(lotteryIdl as Lottery, provider);
}

// ---------------------------------------------------------------------------
// PDA helpers — keep the seed schemes in sync with `programs/lottery/src/state`.
// ---------------------------------------------------------------------------

const u64Le = (v: bigint | number): Buffer => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(typeof v === 'bigint' ? v : BigInt(v), 0);
  return b;
};

const u32Le = (v: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v, 0);
  return b;
};

export const globalConfigPda = (programId: PublicKey = PROGRAM_ID): PublicKey =>
  PublicKey.findProgramAddressSync([Buffer.from('config')], programId)[0];

export const lotteryPda = (id: bigint, programId: PublicKey = PROGRAM_ID): PublicKey =>
  PublicKey.findProgramAddressSync([Buffer.from('lottery'), u64Le(id)], programId)[0];

export const roundPda = (
  lottery: PublicKey,
  index: bigint,
  programId: PublicKey = PROGRAM_ID,
): PublicKey =>
  PublicKey.findProgramAddressSync(
    [Buffer.from('round'), lottery.toBuffer(), u64Le(index)],
    programId,
  )[0];

export const ticketShardPda = (
  round: PublicKey,
  shardIndex: number,
  programId: PublicKey = PROGRAM_ID,
): PublicKey =>
  PublicKey.findProgramAddressSync(
    [Buffer.from('shard'), round.toBuffer(), u32Le(shardIndex)],
    programId,
  )[0];

export const entrantPda = (
  round: PublicKey,
  buyer: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): PublicKey =>
  PublicKey.findProgramAddressSync(
    [Buffer.from('entrant'), round.toBuffer(), buyer.toBuffer()],
    programId,
  )[0];

export const vrfRequestPda = (
  round: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): PublicKey =>
  PublicKey.findProgramAddressSync([Buffer.from('vrf'), round.toBuffer()], programId)[0];

// ---------------------------------------------------------------------------
// Helpers for fixed-byte ASCII fields used by the program (`name`, `label`).
// ---------------------------------------------------------------------------

/** Pack a string into a fixed-length byte array, zero-padded. */
export const packAsciiBytes = (s: string, length: number): number[] => {
  const buf = Buffer.alloc(length);
  buf.write(s, 'utf8');
  return Array.from(buf);
};

/** Decode a zero-padded ASCII byte array back into a string. */
export const unpackAsciiBytes = (bytes: number[] | Uint8Array): string =>
  Buffer.from(bytes).toString('utf8').replace(/\0+$/, '');

export { AnchorProvider, Program } from '@coral-xyz/anchor';
export type { Wallet } from '@coral-xyz/anchor';
