import { AnchorProvider, Program, type Wallet } from '@coral-xyz/anchor';
import {
  AccountMeta,
  Connection,
  PublicKey,
  SystemProgram,
} from '@solana/web3.js';

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

// ---------------------------------------------------------------------------
// Read helpers — keep the frontend snappy without going through the indexer.
// ---------------------------------------------------------------------------

/**
 * Returns the round's *spendable* lamport balance — i.e. the lamports above
 * the rent-exempt minimum, which is what gets distributed at resolve.
 *
 * The Round account holds rent-exempt min + accumulated ticket sales. We
 * subtract the rent reserve so UIs can show an honest "current pool" value.
 */
export async function roundVaultBalance(
  connection: Connection,
  round: PublicKey,
): Promise<number> {
  const info = await connection.getAccountInfo(round);
  if (!info) return 0;
  const rentMin = await connection.getMinimumBalanceForRentExemption(info.data.length);
  return Math.max(0, info.lamports - rentMin);
}

/**
 * Lists every Round PDA belonging to a given Lottery, decoded.
 *
 * Implemented via `getProgramAccounts` with a memcmp filter on the
 * `lottery: Pubkey` field, which sits at offset 8 (after Anchor's 8-byte
 * discriminator) on the `Round` account.
 */
export async function listLotteryRounds(
  program: LotteryProgram,
  lottery: PublicKey,
): Promise<Array<{ publicKey: PublicKey; account: Awaited<ReturnType<LotteryProgram['account']['round']['fetch']>> }>> {
  // Anchor's typed `.all([...])` accepts memcmp filters.
  return program.account.round.all([
    {
      memcmp: {
        offset: 8,
        bytes: lottery.toBase58(),
      },
    },
  ]);
}

// ---------------------------------------------------------------------------
// Resolution helpers — turn "I want to resolve this round" into a fully
// account-list'd transaction the program will accept.
// ---------------------------------------------------------------------------

const ORAO_PROGRAM_ID = new PublicKey(
  'VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y',
);
const ORAO_RANDOMNESS_SEED = Buffer.from('orao-vrf-randomness-request');
const ORAO_CONFIG_SEED = Buffer.from('orao-vrf-network-configuration');

/** PDA for ORAO's randomness account for a given round. */
export const oraoRandomnessAccount = (round: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync(
    [ORAO_RANDOMNESS_SEED, round.toBuffer()],
    ORAO_PROGRAM_ID,
  )[0];

/** PDA for ORAO's network state (singleton on the cluster). */
export const oraoNetworkState = (): PublicKey =>
  PublicKey.findProgramAddressSync([ORAO_CONFIG_SEED], ORAO_PROGRAM_ID)[0];

export { ORAO_PROGRAM_ID };

/**
 * Reads ORAO's randomness account.
 *
 * Returns the raw account bytes if the account exists. **Cannot reliably
 * tell if the randomness has been fulfilled off-chain** — `RandomnessV2`'s
 * layout has variable-length prefix fields before the randomness slot, so
 * a fixed offset doesn't work, and we don't ship a Borsh deserializer for
 * ORAO's full struct.
 *
 * The reliable way to know if randomness is ready is to attempt
 * `consumeOraoResolution` and treat error code 6034 (`VrfNotFulfilled`)
 * as "not yet, retry". The on-chain ORAO deserializer is the source of
 * truth. See `scripts/devnet-orao-smoke.ts` for the retry pattern.
 */
export async function fetchOraoRandomnessAccount(
  connection: Connection,
  round: PublicKey,
) {
  return connection.getAccountInfo(oraoRandomnessAccount(round));
}

const SHARD_CAPACITY = 8192n;

export interface ResolveAccounts {
  /** The shard PDA that holds the winning ticket. */
  winnerShard: PublicKey;
  /** The wallet that bought the winning ticket. */
  winner: PublicKey;
  /** 0-based ticket index across all shards. */
  winnerIndex: bigint;
  /** Ordered remaining accounts list to pass via `.remainingAccounts(...)`. */
  remainingAccounts: AccountMeta[];
  /** PDA for round N+1 (when atomic rollover is requested), else null. */
  nextRound: PublicKey | null;
  /** Shard 0 for round N+1, else null. */
  nextShard: PublicKey | null;
  /** SystemProgram id when rollover is requested, else null. */
  systemProgram: PublicKey | null;
}

export interface BuildResolveOptions {
  /**
   * If true and `lottery.auto_rollover` is on and the lottery is `Active`,
   * derives the next round + shard 0 PDAs so the resolve tx atomically
   * opens round N+1.
   */
  rollover?: boolean;
}

/**
 * Off-chain pre-computation for any `resolve` flavor (admin / ORAO / manual).
 *
 * Given the round and the 64-byte randomness (from ORAO's account, your
 * admin-supplied seed padded to 64 bytes, etc.), derives every account the
 * on-chain handler needs and returns them ready to plug into
 * `.accounts({...})` and `.remainingAccounts(...)`.
 *
 * The frontend never has to know about shards, splits, or ORAO PDAs —
 * just call this helper and pass the result through to `.methods.X(...)`.
 */
export async function buildResolveAccounts(
  program: LotteryProgram,
  round: PublicKey,
  randomness: Buffer | Uint8Array | number[],
  options: BuildResolveOptions = {},
): Promise<ResolveAccounts> {
  const randomnessBytes = Buffer.from(randomness);
  if (randomnessBytes.length < 8) {
    throw new Error('randomness must be at least 8 bytes');
  }

  const roundAcct = await program.account.round.fetch(round);
  const lotteryAcct = await program.account.lottery.fetch(roundAcct.lottery);

  const ticketsSold = BigInt(roundAcct.ticketsSold.toString());
  if (ticketsSold === 0n) {
    throw new Error(
      'round has zero tickets — use resolveEmptyRound, not resolve/consume',
    );
  }

  // First 8 bytes interpreted as little-endian u64.
  const idx = randomnessBytes.subarray(0, 8).readBigUInt64LE();
  const winnerIndex = idx % ticketsSold;
  const shardIndex = Number(winnerIndex / SHARD_CAPACITY);
  const offset = Number(winnerIndex % SHARD_CAPACITY);

  const winnerShard = ticketShardPda(round, shardIndex);
  const shardAcct = await program.account.ticketShard.fetch(winnerShard);
  const winner = shardAcct.buyers[offset] as PublicKey;
  if (!winner) {
    throw new Error(`shard ${shardIndex} does not contain offset ${offset}`);
  }

  const remainingAccounts: AccountMeta[] = (lotteryAcct.splits as any[]).map(
    (split) => ({
      pubkey: split.isPool ? winner : (split.destination as PublicKey),
      isWritable: true,
      isSigner: false,
    }),
  );

  let nextRound: PublicKey | null = null;
  let nextShard: PublicKey | null = null;
  let systemProgram: PublicKey | null = null;
  if (options.rollover) {
    const stateKey = Object.keys(lotteryAcct.state as object)[0];
    if (lotteryAcct.autoRollover && stateKey === 'active') {
      const nextIdx =
        BigInt(lotteryAcct.currentRoundIndex.toString()) + 1n;
      nextRound = roundPda(roundAcct.lottery as PublicKey, nextIdx);
      nextShard = ticketShardPda(nextRound, 0);
      systemProgram = SystemProgram.programId;
    }
  }

  return {
    winnerShard,
    winner,
    winnerIndex,
    remainingAccounts,
    nextRound,
    nextShard,
    systemProgram,
  };
}

export { AnchorProvider, Program } from '@coral-xyz/anchor';
export type { Wallet } from '@coral-xyz/anchor';
