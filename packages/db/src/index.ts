import { PrismaClient } from '@prisma/client';

declare global {
  var __solLotteryPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__solLotteryPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__solLotteryPrisma = prisma;
}

export * from '@prisma/client';
