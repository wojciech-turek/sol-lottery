import 'dotenv/config';
import { prisma } from '@sol-lottery/db';

(async () => {
  const lottery = await prisma.lottery.count();
  const round = await prisma.lotteryRound.count();
  const resolved = await prisma.lotteryRound.count({ where: { state: 'RESOLVED' } });
  const ticket = await prisma.ticketPurchase.count();
  const donation = await prisma.donation.count();
  const stateLog = await prisma.lotteryStateLog.count();
  const rawEvent = await prisma.rawEvent.count();
  const distinctWinners = await prisma.lotteryRound.findMany({
    where: { winner: { not: null } },
    select: { winner: true },
    distinct: ['winner'],
  });
  const totals = await prisma.lotteryRound.aggregate({
    _sum: {
      poolAmountLamports: true,
      totalDistributedLamports: true,
      donatedLamports: true,
      ticketsSold: true,
    },
  });
  console.log(
    JSON.stringify(
      {
        lottery,
        round,
        resolved,
        ticket,
        donation,
        stateLog,
        rawEvent,
        distinctWinners: distinctWinners.length,
        totalPoolLamports: totals._sum.poolAmountLamports?.toString() ?? '0',
        totalDistributedLamports:
          totals._sum.totalDistributedLamports?.toString() ?? '0',
        totalDonatedLamports: totals._sum.donatedLamports?.toString() ?? '0',
        totalTicketsSold: totals._sum.ticketsSold?.toString() ?? '0',
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
})();
