'use client';

import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';

import { SessionProvider } from '@/components/session-provider';
import { WalletModalProvider } from '@/components/wallet-modal';
import { clientEnv } from '@/lib/env';

/**
 * Root client providers. Order matters:
 *   ConnectionProvider  → exposes a Solana RPC connection
 *   WalletProvider      → exposes the wallet selection / signer hooks
 *   SessionProvider     → fetches /api/auth/me, exposes session state
 *   WalletModalProvider → owns the custom wallet selection modal
 *
 * `wallets` is left empty: every modern wallet (Phantom, Solflare,
 * Backpack, Trust, Coinbase, Glow, …) advertises itself via the Wallet
 * Standard, which `WalletProvider` discovers at runtime. Adding explicit
 * adapters here only matters for pre-Wallet-Standard wallets.
 */
export function Providers({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [], []);
  // Single QueryClient per browser session; created lazily on the client
  // to avoid sharing state across requests during SSR.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );
  return (
    <ConnectionProvider endpoint={clientEnv.NEXT_PUBLIC_SOLANA_RPC}>
      <WalletProvider wallets={wallets} autoConnect>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <WalletModalProvider>{children}</WalletModalProvider>
          </SessionProvider>
        </QueryClientProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
