import { clientEnv } from '@/lib/env';

export function TransparencyCard() {
  const explorerUrl = `https://explorer.solana.com/address/${clientEnv.NEXT_PUBLIC_LOTTERY_PROGRAM_ID}?cluster=devnet`;
  return (
    <div className="rounded-lg border border-white/5 bg-zinc-900/50 p-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mb-3">
        Transparency
      </div>
      <ul className="text-xs text-zinc-300 grid gap-1.5">
        <li className="flex items-center gap-2">
          <Check />
          Open-source
        </li>
        <li className="flex items-center gap-2">
          <Check />
          Verifiable random
        </li>
        <li className="flex items-center gap-2">
          <Check />
          On-chain txns
        </li>
      </ul>
      <a
        href={explorerUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
      >
        View Contract
        <span aria-hidden>↗</span>
      </a>
    </div>
  );
}

function Check() {
  return (
    <span className="w-3 h-3 rounded-full border border-emerald-500/40 bg-emerald-500/10 inline-flex items-center justify-center text-[8px] text-emerald-400">
      ✓
    </span>
  );
}
