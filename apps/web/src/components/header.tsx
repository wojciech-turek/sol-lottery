'use client';

import Link from 'next/link';
import { useState } from 'react';

import { useSession } from '@/components/session-provider';
import { useWalletModal } from '@/components/wallet-modal';
import { shortAddress } from '@/lib/format';

export function Header() {
  const { pubkey, isAdmin, signOut, isAuthenticating } = useSession();
  const { open } = useWalletModal();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-amber-500" />
        <span className="text-sm font-semibold tracking-tight text-zinc-100">
          people&apos;s pot
        </span>
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          beta
        </span>
      </div>

      <div className="flex items-center gap-3">
        {isAdmin && (
          <Link
            href="/admin"
            className="text-xs text-amber-400 hover:text-amber-300 transition"
          >
            Admin
          </Link>
        )}
        {pubkey ? (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-white/10 bg-zinc-900 hover:bg-zinc-800 text-sm"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-zinc-100 font-mono">
                {shortAddress(pubkey)}
              </span>
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-44 rounded-md border border-white/10 bg-zinc-950 shadow-xl p-1"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <button
                  onClick={async () => {
                    setMenuOpen(false);
                    await signOut();
                  }}
                  className="block w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 rounded-sm"
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={open}
            disabled={isAuthenticating}
            className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-950 text-sm font-medium transition disabled:opacity-60"
          >
            {isAuthenticating ? 'Signing…' : 'Connect'}
          </button>
        )}
      </div>
    </header>
  );
}
