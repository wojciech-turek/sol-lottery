import { Connection, PublicKey } from '@solana/web3.js';
import { prisma } from '@sol-lottery/db';

const RPC_URL = process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899';
const PROGRAM_ID = process.env.LOTTERY_PROGRAM_ID;

async function main() {
  if (!PROGRAM_ID) {
    throw new Error('LOTTERY_PROGRAM_ID must be set in the environment');
  }

  const connection = new Connection(RPC_URL, 'confirmed');
  const programId = new PublicKey(PROGRAM_ID);

  console.log(`[indexer] subscribing to ${programId.toBase58()} via ${RPC_URL}`);

  connection.onLogs(programId, async (logs, ctx) => {
    console.log(`[indexer] sig=${logs.signature} slot=${ctx.slot} err=${logs.err ?? 'ok'}`);
    // Persist a raw record. Decoding instructions lands once the program ships.
    try {
      await prisma.transaction.create({
        data: {
          signature: logs.signature,
          slot: BigInt(ctx.slot),
          programIx: 'unknown',
          payload: { logs: logs.logs, err: logs.err ?? null },
        },
      });
    } catch (err) {
      // Duplicate signatures are expected on retries; log and move on.
      console.error('[indexer] failed to persist tx', err);
    }
  });

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
