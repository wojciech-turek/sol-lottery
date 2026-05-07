# sol-lottery

Solana lottery dApp. Turborepo monorepo containing the on-chain program, the Next.js frontend, and an off-chain indexer.

## Layout

```
apps/
  web/         Next.js 16 frontend (App Router, Tailwind)
  indexer/     Node worker that subscribes to program logs and writes them to Postgres
packages/
  db/          Prisma schema + client (shared)
  sdk/         Typed Anchor client (re-exports IDL types)
  tsconfig/    Shared TS configs
  eslint-config/ Shared ESLint preset
programs/
  lottery/     Anchor program (Rust) — created by `anchor init` once toolchain is installed
```

## Prerequisites

- Node 20+ and pnpm 8+ (see `.nvmrc`)
- Postgres 14+ (or swap Prisma provider to SQLite for local dev)
- Rust + Solana CLI + Anchor — required only for the on-chain program:
  ```sh
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
  cargo install --git https://github.com/coral-xyz/anchor avm --force
  avm install latest && avm use latest
  ```

## Quickstart

```sh
pnpm install
cp packages/db/.env.example packages/db/.env       # set DATABASE_URL
cp apps/web/.env.local.example apps/web/.env.local # set RPC + Supabase keys
pnpm db:generate
pnpm dev
```

## Common scripts (root)

| Command              | What it does                                          |
| -------------------- | ----------------------------------------------------- |
| `pnpm dev`           | Run web + indexer in parallel via Turbo               |
| `pnpm build`         | Topological build of every package and app            |
| `pnpm typecheck`     | `tsc --noEmit` across the workspace                   |
| `pnpm lint`          | ESLint across the workspace                           |
| `pnpm db:generate`   | Regenerate the Prisma client                          |
| `pnpm db:migrate`    | Run a dev migration against `DATABASE_URL`            |
| `pnpm anchor:build`  | `anchor build` (requires Anchor toolchain)            |
| `pnpm anchor:test`   | `anchor test` (requires local validator)              |

## Anchor program

The Solana program is created with `anchor init lottery` from the repo root once the toolchain is installed. Anchor expects `programs/`, `tests/`, `target/`, and `Anchor.toml` at the repo root, and they are placed there.

`packages/sdk` consumes `target/idl/lottery.json` + `target/types/lottery.ts` after `anchor build` runs. Until then, the SDK exports a placeholder that throws a helpful error.

## Cluster config

`Anchor.toml` defaults to localnet. Override per environment with the standard Solana env vars or by editing `[provider]` in `Anchor.toml`.
