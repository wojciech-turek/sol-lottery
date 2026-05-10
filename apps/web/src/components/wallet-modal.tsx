'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { useSession } from '@/components/session-provider';

interface ModalCtx {
  open: () => void;
  close: () => void;
  isOpen: boolean;
}

const Ctx = createContext<ModalCtx | null>(null);

export function WalletModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const value: ModalCtx = {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
  };
  return (
    <Ctx.Provider value={value}>
      {children}
      <WalletModal />
    </Ctx.Provider>
  );
}

export const useWalletModal = (): ModalCtx => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWalletModal must be used inside <WalletModalProvider>');
  return ctx;
};

function WalletModal() {
  const { isOpen, close } = useWalletModal();
  const { wallets, select, connect, connected, connecting } = useWallet();
  const { isAuthenticating } = useSession();
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Close once we've connected + authenticated.
  useEffect(() => {
    if (!isOpen) return;
    if (connected && !isAuthenticating) {
      close();
      setSelectedName(null);
      setErrorMessage(null);
    }
  }, [isOpen, connected, isAuthenticating, close]);

  const handlePick = useCallback(
    async (walletName: string) => {
      setErrorMessage(null);
      setSelectedName(walletName);
      try {
        select(walletName as Parameters<typeof select>[0]);
        // Yield a tick so the WalletProvider commits the selection.
        await new Promise((r) => setTimeout(r, 50));
        await connect();
      } catch (err: any) {
        setErrorMessage(err?.message ?? 'failed to connect');
        setSelectedName(null);
      }
    },
    [connect, select],
  );

  if (!isOpen) return null;

  // Sort: installed/loadable first, then loadable, then notdetected.
  const order: Record<WalletReadyState, number> = {
    [WalletReadyState.Installed]: 0,
    [WalletReadyState.Loadable]: 1,
    [WalletReadyState.NotDetected]: 2,
    [WalletReadyState.Unsupported]: 3,
  };
  const sorted = [...wallets].sort(
    (a, b) => (order[a.readyState] ?? 9) - (order[b.readyState] ?? 9),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-white/10 bg-zinc-950 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-zinc-100">Connect a wallet</h2>
          <button
            onClick={close}
            className="text-zinc-400 hover:text-zinc-100 text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <p className="text-xs text-zinc-400 mb-4">
          You'll be asked to sign a short message to prove you own the wallet. No
          transaction is sent and nothing leaves your wallet.
        </p>
        <div className="grid gap-2">
          {sorted.length === 0 && (
            <p className="text-sm text-zinc-500">
              No Solana wallets detected. Install Phantom, Solflare, or Backpack and
              try again.
            </p>
          )}
          {sorted.map((w) => {
            const installed = w.readyState === WalletReadyState.Installed;
            const loadable = w.readyState === WalletReadyState.Loadable;
            const disabled = w.readyState === WalletReadyState.Unsupported;
            const isSelected = selectedName === w.adapter.name;
            return (
              <button
                key={w.adapter.name}
                onClick={() => handlePick(w.adapter.name)}
                disabled={disabled || connecting || isAuthenticating}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-white/10 bg-zinc-900 hover:border-amber-500/40 hover:bg-zinc-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="flex items-center gap-3">
                  {w.adapter.icon ? (
                    <img
                      src={w.adapter.icon}
                      alt=""
                      className="w-5 h-5 rounded-sm"
                    />
                  ) : (
                    <span className="w-5 h-5 rounded-sm bg-amber-500/20" />
                  )}
                  <span className="text-sm text-zinc-100">{w.adapter.name}</span>
                </span>
                <span className="text-xs text-zinc-500">
                  {isSelected && (connecting || isAuthenticating)
                    ? isAuthenticating
                      ? 'signing…'
                      : 'connecting…'
                    : installed
                      ? 'detected'
                      : loadable
                        ? 'install'
                        : disabled
                          ? 'unsupported'
                          : ''}
                </span>
              </button>
            );
          })}
        </div>
        {errorMessage && (
          <p className="mt-3 text-xs text-red-400 break-words">{errorMessage}</p>
        )}
      </div>
    </div>
  );
}
