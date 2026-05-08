/**
 * Prisma 7 config.
 *
 * Why this file exists: starting in Prisma 7, the connection URL no longer
 * lives in `schema.prisma`'s `datasource` block. The CLI reads it from this
 * file. We point it at `DIRECT_URL` because Prisma migrations need an
 * unpooled connection — Supabase's pooler (`DATABASE_URL`, port 6543, via
 * pgbouncer) doesn't support the prepared statements migrations issue.
 *
 * The application runtime (`PrismaClient` in `src/index.ts`) uses
 * `DATABASE_URL` (pooled) — see the constructor over there.
 */
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DIRECT_URL'),
  },
});
