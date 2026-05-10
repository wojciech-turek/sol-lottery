/**
 * Nonce issuance + retrieval. The nonce binds a sign-in attempt to a
 * specific browser session — it lives in a short-lived (5 min) httpOnly
 * cookie. Login verifies that the message the wallet signed contains the
 * nonce we issued.
 */
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';

const NONCE_COOKIE = 'pp_nonce';
const NONCE_TTL_MS = 5 * 60 * 1000;

export interface NonceChallenge {
  nonce: string;
  message: string;
  issuedAt: string;
}

export const buildMessage = (nonce: string, issuedAt: string): string =>
  [
    "people's pot wants you to sign in with your Solana account.",
    '',
    'By signing this message you prove you own this wallet — no transaction is sent and nothing leaves your wallet.',
    '',
    `Nonce: ${nonce}`,
    `Issued: ${issuedAt}`,
  ].join('\n');

export const issueNonce = async (): Promise<NonceChallenge> => {
  const nonce = randomBytes(16).toString('hex');
  const issuedAt = new Date().toISOString();
  const message = buildMessage(nonce, issuedAt);
  const store = await cookies();
  store.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(Date.now() + NONCE_TTL_MS),
  });
  return { nonce, message, issuedAt };
};

export const consumeNonce = async (): Promise<string | null> => {
  const store = await cookies();
  const nonce = store.get(NONCE_COOKIE)?.value;
  if (!nonce) return null;
  store.delete(NONCE_COOKIE);
  return nonce;
};
