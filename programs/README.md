# Solana programs

Run `anchor init lottery` from the **repo root** once the toolchain is installed:

```sh
# 1. Install Rust + Solana CLI + Anchor (see /README.md)
# 2. From the repo root:
anchor init lottery
```

This will create:

- `programs/lottery/` — Rust program source
- `Anchor.toml` at the repo root
- `Cargo.toml` at the repo root (Rust workspace)
- `tests/lottery.ts` — Anchor TS integration test
- `migrations/deploy.ts` — Anchor deploy script

After `anchor build`, the IDL + types land at `target/idl/lottery.json` and `target/types/lottery.ts`. Update `packages/sdk/src/index.ts` to import them (see the comment block in that file).

## Why is this not committed?

The on-chain toolchain (Rust, Solana CLI, Anchor) was not installed when the repo was scaffolded. To avoid committing a half-initialized Anchor project that doesn't build, the program scaffold is left to the developer to run.
