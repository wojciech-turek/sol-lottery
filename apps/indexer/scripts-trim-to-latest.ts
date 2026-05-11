/**
 * Keep only the most-recent on-chain lottery (highest lottery_index,
 * filtered by name = "Daily 15-min draw"); delete all others from
 * Postgres so the admin tab list reflects what the user just created.
 */
import { prisma } from '@sol-lottery/db';

async function main() {
  const all = await prisma.lottery.findMany({
    select: { pubkey: true, lotteryIndex: true, name: true, state: true },
    orderBy: { lotteryIndex: 'desc' },
  });
  console.log(`db has ${all.length} lotteries; keeping the newest matching "Daily 15-min draw"`);
  const keep = all.find((l) => l.name === 'Daily 15-min draw');
  if (!keep) {
    console.log('no Daily 15-min draw lottery found — nothing to do');
    return;
  }
  const dropPubkeys = all.filter((l) => l.pubkey !== keep.pubkey).map((l) => l.pubkey);
  console.log(`dropping ${dropPubkeys.length} other lotteries (index #${keep.lotteryIndex})`);
  if (dropPubkeys.length > 0) {
    await prisma.lotteryStateLog.deleteMany({ where: { lotteryPubkey: { in: dropPubkeys } } });
    await prisma.ticketPurchase.deleteMany({ where: { round: { lotteryPubkey: { in: dropPubkeys } } } });
    await prisma.donation.deleteMany({ where: { round: { lotteryPubkey: { in: dropPubkeys } } } });
    await prisma.lotteryRound.deleteMany({ where: { lotteryPubkey: { in: dropPubkeys } } });
    await prisma.lottery.deleteMany({ where: { pubkey: { in: dropPubkeys } } });
  }
  console.log(`kept: ${keep.name} (${keep.pubkey}) — state ${keep.state}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
