'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface SessionState {
  pubkey: string | null;
  isAdmin: boolean;
  isAuthenticating: boolean;
  signInWithWallet: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

interface MeResponse {
  authenticated: boolean;
  pubkey?: string;
  isAdmin?: boolean;
}

const fetchMe = async (): Promise<MeResponse> => {
  const res = await fetch('/api/auth/me', { credentials: 'include' });
  if (!res.ok) return { authenticated: false };
  return res.json();
};

export function SessionProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage, disconnect, connected } = useWallet();
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [meLoaded, setMeLoaded] = useState(false);
  const lastSigned = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const me = await fetchMe();
    if (me.authenticated && me.pubkey) {
      setPubkey(me.pubkey);
      setIsAdmin(!!me.isAdmin);
      lastSigned.current = me.pubkey;
    } else {
      setPubkey(null);
      setIsAdmin(false);
    }
    setMeLoaded(true);
  }, []);

  // Initial /me fetch.
  useEffect(() => {
    refresh().catch(() => setMeLoaded(true));
  }, [refresh]);

  const signInWithWallet = useCallback(async () => {
    if (!publicKey || !signMessage) {
      throw new Error('wallet not connected or does not support signing');
    }
    setIsAuthenticating(true);
    try {
      const nonceRes = await fetch('/api/auth/nonce', { credentials: 'include' });
      if (!nonceRes.ok) throw new Error('failed to fetch nonce');
      const { message } = (await nonceRes.json()) as {
        nonce: string;
        message: string;
      };
      const sigBytes = await signMessage(new TextEncoder().encode(message));
      const signature = bs58.encode(sigBytes);
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pubkey: publicKey.toBase58(),
          signature,
          message,
        }),
      });
      if (!loginRes.ok) {
        const err = (await loginRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'login failed');
      }
      const data = (await loginRes.json()) as { pubkey: string; isAdmin: boolean };
      setPubkey(data.pubkey);
      setIsAdmin(data.isAdmin);
      lastSigned.current = data.pubkey;
    } finally {
      setIsAuthenticating(false);
    }
  }, [publicKey, signMessage]);

  // Auto sign-in once a wallet connects, but only after /me has resolved —
  // otherwise the popup fires on every refresh while the existing session
  // is still loading.
  useEffect(() => {
    if (!meLoaded) return;
    if (!connected || !publicKey) return;
    const current = publicKey.toBase58();
    if (pubkey === current) return;
    if (lastSigned.current === current) return;
    signInWithWallet().catch((err) => {
      console.error('[session] auto sign-in failed', err);
    });
  }, [meLoaded, connected, publicKey, pubkey, signInWithWallet]);

  const signOut = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setPubkey(null);
    setIsAdmin(false);
    lastSigned.current = null;
    await disconnect().catch(() => {});
  }, [disconnect]);

  const value: SessionState = {
    pubkey,
    isAdmin,
    isAuthenticating,
    signInWithWallet,
    signOut,
    refresh,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSession = (): SessionState => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
};
