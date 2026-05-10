/**
 * HMAC-signed session cookie. Format: `<pubkey>.<exp_unix_ms>.<sig_base64url>`.
 *
 * The cookie is httpOnly + Secure (in production) + SameSite=Lax. We don't
 * use a JWT library — the payload is two ASCII fields and the signature is
 * a single HMAC-SHA256, so 30 lines of `node:crypto` is plenty.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

import { serverEnv } from '../env';

export const SESSION_COOKIE = 'pp_session';
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface SessionPayload {
  pubkey: string;
  expiresAt: number;
}

const sign = (payload: string): string =>
  createHmac('sha256', serverEnv.SESSION_SECRET)
    .update(payload)
    .digest('base64url');

export const encodeSession = (payload: SessionPayload): string => {
  const body = `${payload.pubkey}.${payload.expiresAt}`;
  return `${body}.${sign(body)}`;
};

export const decodeSession = (raw: string | undefined): SessionPayload | null => {
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [pubkey, expRaw, sig] = parts;
  const body = `${pubkey}.${expRaw}`;
  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  const expiresAt = Number(expRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  return { pubkey, expiresAt };
};

export const setSessionCookie = async (pubkey: string): Promise<void> => {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const value = encodeSession({ pubkey, expiresAt });
  const store = await cookies();
  store.set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  });
};

export const clearSessionCookie = async (): Promise<void> => {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
};

export const getCurrentSession = async (): Promise<SessionPayload | null> => {
  const store = await cookies();
  return decodeSession(store.get(SESSION_COOKIE)?.value);
};
