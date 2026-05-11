/**
 * Clears every lottery-related row from Postgres so we can create a
 * brand-new lottery from the UI. Preserves the `user` table so the
 * is_admin grant is retained.
 *
 * Chain state can't actually be wiped — leftover Lottery accounts stay
 * on devnet — but the landing + admin both gate on DB presence, so
 * removing the DB rows is equivalent to a fresh slate for the UI.
 */
import { prisma } from '@sol-lottery/db';

async function main() {
  // Order matters: foreign keys point upstream.
  const purchases = await prisma.ticketPurchase.deleteMany({});
  const donations = await prisma.donation.deleteMany({});
  const stateLogs = await prisma.lotteryStateLog.deleteMany({});
  const rounds = await prisma.lotteryRound.deleteMany({});
  const lotteries = await prisma.lottery.deleteMany({});
  const rawEvents = await prisma.rawEvent.deleteMany({});
  console.log(
    `wiped: lotteries=${lotteries.count} rounds=${rounds.count} purchases=${purchases.count} donations=${donations.count} state_logs=${stateLogs.count} raw_events=${rawEvents.count}`,
  );
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
