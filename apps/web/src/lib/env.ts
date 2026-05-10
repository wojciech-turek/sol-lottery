/**
 * Validated environment access.
 *
 * Server-only env vars are read at module load and Zod-checked. Public
 * vars (`NEXT_PUBLIC_*`) come through `clientEnv` so the rest of the app
 * doesn't sprinkle `process.env` references everywhere.
 */
import { z } from 'zod';

const serverSchema = z.object({
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be ≥32 chars'),
  DATABASE_URL: z.string().url(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SOLANA_RPC: z.string().url(),
  NEXT_PUBLIC_LOTTERY_PROGRAM_ID: z.string().min(32),
  NEXT_PUBLIC_ADMIN_DEFAULT_DEV_WALLET: z.string().optional(),
});

export const serverEnv =
  typeof window === 'undefined'
    ? serverSchema.parse({
        SESSION_SECRET: process.env.SESSION_SECRET,
        DATABASE_URL: process.env.DATABASE_URL,
      })
    : (null as unknown as z.infer<typeof serverSchema>);

export const clientEnv = clientSchema.parse({
  NEXT_PUBLIC_SOLANA_RPC: process.env.NEXT_PUBLIC_SOLANA_RPC,
  NEXT_PUBLIC_LOTTERY_PROGRAM_ID: process.env.NEXT_PUBLIC_LOTTERY_PROGRAM_ID,
  NEXT_PUBLIC_ADMIN_DEFAULT_DEV_WALLET:
    process.env.NEXT_PUBLIC_ADMIN_DEFAULT_DEV_WALLET,
});
