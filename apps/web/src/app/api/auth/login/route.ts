import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { prisma } from '@sol-lottery/db';

import { consumeNonce } from '@/lib/auth/nonce';
import { setSessionCookie } from '@/lib/auth/session';
import { verifyWalletSignature } from '@/lib/auth/verify-signature';

export const runtime = 'nodejs';

const bodySchema = z.object({
  pubkey: z.string().min(32),
  signature: z.string().min(1),
  message: z.string().min(1),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const { pubkey, signature, message } = parsed.data;

  const expectedNonce = await consumeNonce();
  if (!expectedNonce) {
    return NextResponse.json({ error: 'nonce_missing_or_expired' }, { status: 401 });
  }
  if (!message.includes(`Nonce: ${expectedNonce}`)) {
    return NextResponse.json({ error: 'nonce_mismatch' }, { status: 401 });
  }

  if (!verifyWalletSignature(message, pubkey, signature)) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 });
  }

  const user = await prisma.user.upsert({
    where: { pubkey },
    create: { pubkey },
    update: { lastSeenAt: new Date() },
  });

  await setSessionCookie(pubkey);
  return NextResponse.json({ pubkey: user.pubkey, isAdmin: user.isAdmin });
}
