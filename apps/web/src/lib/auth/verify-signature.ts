import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';

/**
 * Verifies an Ed25519 signature produced by a Solana wallet over the
 * given UTF-8 message.
 *
 * `pubkey` and `signature` are accepted in any of the formats Solana
 * wallets commonly emit: bs58 strings (the default), base64 strings,
 * Uint8Array, or hex strings prefixed with `0x`.
 */
export function verifyWalletSignature(
  message: string,
  pubkey: string,
  signature: string,
): boolean {
  try {
    const pubkeyBytes = new PublicKey(pubkey).toBytes();
    const sigBytes = decodeSignature(signature);
    if (sigBytes.length !== 64) return false;
    return nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      sigBytes,
      pubkeyBytes,
    );
  } catch {
    return false;
  }
}

function decodeSignature(s: string): Uint8Array {
  if (s.startsWith('0x')) return Uint8Array.from(Buffer.from(s.slice(2), 'hex'));
  // Try base58 first (default for Solana), fall back to base64.
  try {
    return bs58.decode(s);
  } catch {
    return Uint8Array.from(Buffer.from(s, 'base64'));
  }
}
