/**
 * sol-lottery indexer.
 *
 * Subscribes to logs from the deployed program, decodes Anchor events with
 * the typed BorshCoder, and writes them to Postgres via the shared Prisma
 * client.
 *
 * Each incoming log set is also mirrored to the `RawEvent` table so we can
 * replay/debug without needing the chain.
 */
import 'dotenv/config';
import { BorshCoder, EventParser } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  PROGRAM_ID,
  createProgram,
  lotteryIdl,
  unpackAsciiBytes,
} from '@sol-lottery/sdk';
import {
  LotteryState,
  PrizeKind,
  RoundState,
  prisma,
} from '@sol-lottery/db';

const RPC_URL = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const programId = process.env.LOTTERY_PROGRAM_ID
  ? new PublicKey(process.env.LOTTERY_PROGRAM_ID)
  : PROGRAM_ID;

const coder = new BorshCoder(lotteryIdl as any);
const parser = new EventParser(programId, coder);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toIso = (unixSeconds: any): Date => {
  const n =
    typeof unixSeconds === 'bigint'
      ? Number(unixSeconds)
      : typeof unixSeconds?.toNumber === 'function'
        ? unixSeconds.toNumber()
        : Number(unixSeconds ?? 0);
  return new Date(n * 1000);
};

const big = (v: any): bigint => {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(v);
  if (v && typeof v.toString === 'function') return BigInt(v.toString());
  return 0n;
};

const lotteryStateFromAccountField = (raw: any): LotteryState => {
  // From `program.account.lottery.fetch(...)`: enums are `{ pendingDisable: {} }`.
  const key = Object.keys(raw)[0];
  switch (key) {
    case 'active':
      return LotteryState.ACTIVE;
    case 'paused':
      return LotteryState.PAUSED;
    case 'pendingDisable':
    case 'pending_disable':
      return LotteryState.PENDING_DISABLE;
    case 'disabled':
      return LotteryState.DISABLED;
    default:
      throw new Error(`Unknown LotteryState: ${key}`);
  }
};

const lotteryStateFromU8 = (n: number): LotteryState => {
  const variants = [
    LotteryState.ACTIVE,
    LotteryState.PAUSED,
    LotteryState.PENDING_DISABLE,
    LotteryState.DISABLED,
  ];
  return variants[n] ?? LotteryState.ACTIVE;
};

const prizeKindFromAccountField = (raw: any): PrizeKind => {
  const key = Object.keys(raw)[0];
  return key === 'physical' ? PrizeKind.PHYSICAL : PrizeKind.SOL;
};

// ---------------------------------------------------------------------------
// Event handlers
//
// NOTE: BorshCoder/EventParser preserves the IDL field names as-is — i.e.
// snake_case for event fields like `started_at`, `ticket_price_lamports`.
// (This is unlike `program.account.X.fetch(...)` which exposes camelCase.)
// ---------------------------------------------------------------------------

type Ctx = { signature: string; slot: bigint; blockTime: Date | null };
type Fetcher = {
  lottery: (k: PublicKey) => Promise<any>;
  round: (k: PublicKey) => Promise<any>;
};

async function handleEvent(
  name: string,
  data: any,
  ctx: Ctx,
  fetch: Fetcher,
): Promise<void> {
  switch (name) {
    case 'LotteryCreated': {
      const lotteryPubkey = data.lottery as PublicKey;
      // Event lacks the full config — fetch the account for the rest.
      const account = await fetch.lottery(lotteryPubkey);
      await prisma.lottery.upsert({
        where: { pubkey: lotteryPubkey.toBase58() },
        create: {
          pubkey: lotteryPubkey.toBase58(),
          lotteryIndex: big(data.id),
          name: unpackAsciiBytes(data.name),
          state: lotteryStateFromAccountField(account.state),
          prizeKind: prizeKindFromAccountField(account.prizeKind),
          ticketPriceLamports: big(account.ticketPriceLamports),
          durationSeconds: big(account.roundDurationSeconds),
          autoRollover: !!account.autoRollover,
          admin: (data.admin as PublicKey).toBase58(),
          createdAt: toIso(data.created_at),
        },
        update: {},
      });
      break;
    }

    case 'LotteryStateChanged': {
      const pubkey = (data.lottery as PublicKey).toBase58();
      const previousState = lotteryStateFromU8(Number(data.previous_state));
      const newState = lotteryStateFromU8(Number(data.new_state));
      await prisma.$transaction([
        prisma.lottery.update({
          where: { pubkey },
          data: { state: newState },
        }),
        prisma.lotteryStateLog.create({
          data: {
            lotteryPubkey: pubkey,
            previousState,
            newState,
            at: toIso(data.at),
            txSignature: ctx.signature,
          },
        }),
      ]);
      break;
    }

    case 'LotteryConfigUpdated': {
      const lotteryPubkey = data.lottery as PublicKey;
      const account = await fetch.lottery(lotteryPubkey);
      await prisma.lottery.update({
        where: { pubkey: lotteryPubkey.toBase58() },
        data: {
          ticketPriceLamports: big(account.ticketPriceLamports),
          durationSeconds: big(account.roundDurationSeconds),
        },
      });
      break;
    }

    case 'RoundOpened': {
      const startedAt = big(data.started_at);
      const effectiveEnd = big(data.effective_end);
      const lotteryPubkey = (data.lottery as PublicKey).toBase58();
      const roundIndex = big(data.index);
      await prisma.lotteryRound.upsert({
        where: { pubkey: (data.round as PublicKey).toBase58() },
        create: {
          pubkey: (data.round as PublicKey).toBase58(),
          lotteryPubkey,
          index: roundIndex,
          state: RoundState.OPEN,
          ticketPriceLamports: big(data.ticket_price_lamports),
          durationSeconds: effectiveEnd - startedAt,
          startedAt: new Date(Number(startedAt) * 1000),
          effectiveEnd: new Date(Number(effectiveEnd) * 1000),
          currentShardIndex: 0,
        },
        update: {},
      });
      // Wake the resolver precisely at the deadline so the
      // "deadline → request_orao" hop isn't bound by the 15s tick.
      const { scheduleResolveAt } = await import('./scheduler');
      const { kickResolve } = await import('./resolver');
      scheduleResolveAt(lotteryPubkey, roundIndex, Number(effectiveEnd), () =>
        kickResolve(lotteryPubkey),
      );
      break;
    }

    case 'TicketBought': {
      const roundPubkey = (data.round as PublicKey).toBase58();
      await prisma.$transaction([
        prisma.ticketPurchase.upsert({
          where: { txSignature: ctx.signature },
          create: {
            txSignature: ctx.signature,
            roundPubkey,
            buyer: (data.buyer as PublicKey).toBase58(),
            quantity: big(data.quantity),
            totalPaidLamports: big(data.total_paid_lamports),
            runningTotal: big(data.running_total),
            at: toIso(data.at),
          },
          update: {},
        }),
        prisma.lotteryRound.update({
          where: { pubkey: roundPubkey },
          data: { ticketsSold: big(data.running_total) },
        }),
      ]);
      break;
    }

    case 'ResolutionRequested': {
      await prisma.lotteryRound.update({
        where: { pubkey: (data.round as PublicKey).toBase58() },
        data: { state: RoundState.AWAITING_VRF },
      });
      break;
    }

    case 'RoundResolved': {
      const roundPubkey = (data.round as PublicKey).toBase58();
      const winner = data.winner ? (data.winner as PublicKey).toBase58() : null;
      const winningIdx =
        data.winning_ticket_index === null ||
        data.winning_ticket_index === undefined
          ? null
          : big(data.winning_ticket_index);
      const round = await fetch.round(data.round as PublicKey);
      await prisma.lotteryRound.update({
        where: { pubkey: roundPubkey },
        data: {
          state: RoundState.RESOLVED,
          winner,
          winningTicketIndex: winningIdx,
          poolAmountLamports: big(data.pool_amount_lamports),
          totalDistributedLamports: big(data.total_distributed_lamports),
          resolvedAt: toIso(data.at),
          pausedTotalSeconds: big(round.pausedTotalSeconds),
        },
      });
      break;
    }

    case 'DonationReceived': {
      const roundPubkey = (data.round as PublicKey).toBase58();
      await prisma.$transaction([
        prisma.donation.upsert({
          where: { txSignature: ctx.signature },
          create: {
            txSignature: ctx.signature,
            roundPubkey,
            donor: (data.donor as PublicKey).toBase58(),
            amountLamports: big(data.amount_lamports),
            runningTotalLamports: big(data.running_total_lamports),
            at: toIso(data.at),
          },
          update: {},
        }),
        prisma.lotteryRound.update({
          where: { pubkey: roundPubkey },
          data: { donatedLamports: big(data.running_total_lamports) },
        }),
      ]);
      break;
    }

    case 'AdminTransferAccepted': {
      await prisma.adminTransfer.upsert({
        where: { txSignature: ctx.signature },
        create: {
          txSignature: ctx.signature,
          previousAdmin: (data.previous_admin as PublicKey).toBase58(),
          newAdmin: (data.new_admin as PublicKey).toBase58(),
          at: toIso(data.at),
        },
        update: {},
      });
      break;
    }

    // Events with no DB side effects (yet).
    case 'ShardClosed':
    case 'AdminTransferProposed':
      break;

    default:
      console.warn(`[indexer] unhandled event: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const connection = new Connection(RPC_URL, 'confirmed');
  const program = createProgram(connection, {} as any);

  console.log(`[indexer] subscribing to ${programId.toBase58()} via ${RPC_URL}`);

  const { startResolver, kickResolve } = await import('./resolver');
  await startResolver().catch((err) => console.error('[resolver] failed to start', err));

  const { startShardTracker } = await import('./shard-tracker');
  await startShardTracker(connection).catch((err) =>
    console.error('[shard-tracker] failed to start', err),
  );

  // Re-arm precise schedulers for every currently-open round in the DB.
  // Without this, rounds opened before this indexer process started would
  // only get caught by the slow 15s tick on the next deadline-pass.
  const { scheduleResolveAt } = await import('./scheduler');
  const openRounds = await prisma.lotteryRound.findMany({
    where: { state: 'OPEN' },
    select: { lotteryPubkey: true, index: true, effectiveEnd: true },
  });
  for (const r of openRounds) {
    scheduleResolveAt(
      r.lotteryPubkey,
      r.index,
      Math.floor(r.effectiveEnd.getTime() / 1000),
      () => kickResolve(r.lotteryPubkey),
    );
  }

  const fetcher: Fetcher = {
    lottery: (k) => program.account.lottery.fetch(k),
    round: (k) => program.account.round.fetch(k),
  };

  // Serialize event processing across concurrent onLogs callbacks. Without
  // this, near-simultaneous transactions race — a RoundOpened from tx B can
  // start writing before tx A's LotteryCreated handler has finished inserting
  // the parent row, breaking the foreign key.
  let queue: Promise<void> = Promise.resolve();

  connection.onLogs(programId, (logs, slotCtx) => {
    queue = queue
      .then(() => processLogs(logs, slotCtx))
      .catch((err) => console.error('[indexer] queue error', err));
  });

  async function processLogs(
    logs: { signature: string; err: any; logs: string[] },
    slotCtx: { slot: number },
  ) {
    if (logs.err) return;

    // Skip if we've already processed this tx (onLogs occasionally re-fires).
    const existing = await prisma.rawEvent.findUnique({
      where: { txSignature: logs.signature },
    });
    if (existing) return;

    let blockTime: Date | null = null;
    try {
      const ts = await connection.getBlockTime(slotCtx.slot);
      if (ts) blockTime = new Date(ts * 1000);
    } catch {
      /* ignore */
    }

    const ctx: Ctx = {
      signature: logs.signature,
      slot: BigInt(slotCtx.slot),
      blockTime,
    };

    let events: any[] = [];
    try {
      events = [...parser.parseLogs(logs.logs)];
    } catch (err) {
      console.warn(`[indexer] parse failed for ${logs.signature}`, err);
    }

    for (const event of events) {
      try {
        try {
          await prisma.rawEvent.create({
            data: {
              txSignature: ctx.signature,
              slot: ctx.slot,
              blockTime,
              eventName: event.name,
              payload: JSON.parse(
                JSON.stringify(event.data, (_k, v) =>
                  typeof v === 'bigint' ? v.toString() : v,
                ),
              ),
            },
          });
        } catch (e: any) {
          // P2002 = unique constraint on tx_signature; another in-flight
          // onLogs raced us with the same tx. Safe to ignore — the row's
          // already there and downstream handlers are idempotent.
          if (e?.code !== 'P2002') throw e;
        }
        await handleEvent(event.name, event.data, ctx, fetcher);
        console.log(`[indexer] ${event.name} sig=${ctx.signature}`);
      } catch (err) {
        console.error(`[indexer] handler failed for ${event.name}`, err);
      }
    }
  }

  process.on('SIGINT', async () => {
    console.log('[indexer] shutting down');
    await prisma.$disconnect();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[indexer] fatal', err);
  process.exit(1);
});
