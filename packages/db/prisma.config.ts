/**
 * Prisma 7 config.
 *
 * Why this file exists: starting in Prisma 7, the connection URL no longer
 * lives in `schema.prisma`'s `datasource` block. The CLI reads it from this
 * file. We prefer `DIRECT_URL` because Prisma migrations need an unpooled
 * connection — Supabase's pooler (`DATABASE_URL`, port 6543, via pgbouncer)
 * doesn't support the prepared statements migrations issue. We fall back
 * to `DATABASE_URL` so `prisma generate` (which only reads the schema, no
 * connection needed) works in build environments like Vercel where only
 * `DATABASE_URL` is provisioned.
 *
 * The application runtime (`PrismaClient` in `src/index.ts`) uses
 * `DATABASE_URL` (pooled) — see the constructor over there.
 */
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    'Neither DIRECT_URL nor DATABASE_URL is set — Prisma needs at least one.',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: { url },
});
