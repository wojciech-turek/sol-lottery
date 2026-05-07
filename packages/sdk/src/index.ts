import { Program, type Wallet } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';

/**
 * Anchor IDL + types live at <repo>/target/idl/lottery.json and
 * <repo>/target/types/lottery.ts after `anchor build`. They are gitignored, so
 * this SDK lazy-loads them and surfaces a clear error if the toolchain hasn't
 * been run yet. Once present, swap the placeholder body below for:
 *
 *   import idl from '../../../target/idl/lottery.json' with { type: 'json' };
 *   import type { Lottery } from '../../../target/types/lottery';
 *   export function createProgram(connection, wallet) {
 *     const provider = new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
 *     return new Program<Lottery>(idl as Lottery, provider);
 *   }
 */

export const PROGRAM_ID_ENV = 'NEXT_PUBLIC_LOTTERY_PROGRAM_ID';

export function getProgramId(): PublicKey {
  const raw = process.env[PROGRAM_ID_ENV];
  if (!raw) {
    throw new Error(`${PROGRAM_ID_ENV} is not set`);
  }
  return new PublicKey(raw);
}

export function createProgram(connection: Connection, wallet: Wallet): Program {
  void connection;
  void wallet;
  throw new Error(
    'Anchor IDL not generated yet. Run `pnpm anchor:build` from the repo root, ' +
      'then update packages/sdk/src/index.ts to import target/idl/lottery.json + target/types/lottery.ts.',
  );
}

export { AnchorProvider, Program } from '@coral-xyz/anchor';
export type { Wallet } from '@coral-xyz/anchor';
