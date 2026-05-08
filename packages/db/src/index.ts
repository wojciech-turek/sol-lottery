import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

declare global {
  var __solLotteryPrisma: PrismaClient | undefined;
}

/**
 * Application-runtime client. Uses `DATABASE_URL` (the pooled Supabase URL
 * via Supavisor / pgbouncer). Migrations are a CLI concern and use
 * `DIRECT_URL` via `prisma.config.ts`.
 *
 * Prisma 7 requires a driver adapter — connection strings can no longer be
 * passed to `PrismaClient` directly. We use `@prisma/adapter-pg` so the
 * adapter handles pgbouncer-friendly behavior automatically.
 *
 * In dev we cache the client on `globalThis` so hot-reload doesn't open a
 * new pool every restart.
 */
const buildClient = (): PrismaClient => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
};

export const prisma: PrismaClient = globalThis.__solLotteryPrisma ?? buildClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__solLotteryPrisma = prisma;
}

export * from '@prisma/client';
