import { NextResponse } from 'next/server';

import { issueNonce } from '@/lib/auth/nonce';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const challenge = await issueNonce();
  return NextResponse.json(challenge);
}
