import { prisma } from '@sol-lottery/db';

async function main() {
  const arg = process.argv[2];
  const users = await prisma.user.findMany({
    select: { pubkey: true, isAdmin: true, lastSeenAt: true },
    orderBy: { lastSeenAt: 'desc' },
    take: 5,
  });
  if (!arg) {
    console.log('Recent users:');
    for (const u of users) console.log(`  ${u.pubkey}  is_admin=${u.isAdmin}  last_seen=${u.lastSeenAt.toISOString()}`);
    console.log('\nUsage: tsx grant-admin.ts <pubkey>  (or "latest")');
    return;
  }
  const target = arg === 'latest' ? users[0]?.pubkey : arg;
  if (!target) throw new Error('no pubkey to grant');
  const updated = await prisma.user.update({
    where: { pubkey: target },
    data: { isAdmin: true },
  });
  console.log('Granted admin to', updated.pubkey);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
