# Solana programs

| Program | Path | Purpose |
|---|---|---|
| `lottery` | [`programs/lottery`](./lottery) | Configurable on-chain lottery — admin-managed lotteries, ticket sales in SOL, multi-destination revenue splits, public + admin resolution, refunds. See [`lottery/README.md`](./lottery/README.md). |

`anchor build` from the repo root compiles every program here and emits IDL + types to `target/`.
