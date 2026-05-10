import 'server-only';

import { redirect } from 'next/navigation';

import { prisma } from '@sol-lottery/db';

import { getCurrentSession } from './session';

/**
 * Server helper for `/admin` routes. Returns the admin's pubkey on success,
 * redirects to home with `?signin_required=1` otherwise.
 */
export async function requireAdmin(): Promise<string> {
  const session = await getCurrentSession();
  if (!session) redirect('/?signin_required=1');
  const user = await prisma.user.findUnique({
    where: { pubkey: session.pubkey },
    select: { isAdmin: true },
  });
  if (!user || !user.isAdmin) redirect('/?signin_required=1');
  return session.pubkey;
}
