'use client';

import Link from 'next/link';
import { LogOut, Shield, Wallet } from 'lucide-react';
import { useState } from 'react';

import { useSession } from '@/components/session-provider';
import { useWalletModal } from '@/components/wallet-modal';
import { shortAddress } from '@/lib/format';

export function Header() {
  const { pubkey, isAdmin, signOut, isAuthenticating } = useSession();
  const { open } = useWalletModal();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex items-center justify-between shrink-0 px-3 md:px-4 pt-4 md:pt-6 pb-2">
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 md:w-6 md:h-6 pot-gradient rounded-full" />
        <h1 className="text-base md:text-lg font-bold text-gradient-gold">
          people&apos;s pot
        </h1>
        <span className="text-[10px] text-muted-foreground/60 font-light">
          beta
        </span>
      </div>

      <div className="flex items-center gap-2">
        {isAdmin && (
          <Link
            href="/admin"
            aria-label="Admin"
            title="Admin"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-primary hover:bg-secondary/50 transition-colors"
          >
            <Shield className="w-3.5 h-3.5" />
          </Link>
        )}
        {pubkey ? (
          <div className="flex items-center gap-1.5 relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="glass px-3 py-1.5 rounded-lg flex items-center gap-1.5"
            >
              <span className="w-1.5 h-1.5 bg-success rounded-full" />
              <span className="text-xs font-mono text-foreground">
                {shortAddress(pubkey)}
              </span>
            </button>
            <button
              onClick={async () => {
                setMenuOpen(false);
                await signOut();
              }}
              className="glass p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Disconnect"
              title="Disconnect"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-2 z-20"
                onMouseLeave={() => setMenuOpen(false)}
              />
            )}
          </div>
        ) : (
          <button
            onClick={open}
            disabled={isAuthenticating}
            className="glass px-3 py-1.5 rounded-lg text-xs text-foreground hover:bg-secondary/50 transition-colors flex items-center gap-1.5 disabled:opacity-60"
          >
            <Wallet className="w-3.5 h-3.5" />
            {isAuthenticating ? 'Signing…' : 'Connect'}
          </button>
        )}
      </div>
    </header>
  );
}
