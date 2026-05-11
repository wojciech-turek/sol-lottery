import { CheckCircle, ExternalLink, Shield } from 'lucide-react';

import { clientEnv } from '@/lib/env';

export function TransparencyCard() {
  const explorerUrl = `https://explorer.solana.com/address/${clientEnv.NEXT_PUBLIC_LOTTERY_PROGRAM_ID}?cluster=devnet`;
  return (
    <div className="glass rounded-lg p-2 md:p-3 h-full">
      <div className="flex items-center gap-1.5 mb-1.5 md:mb-2">
        <Shield className="w-3 h-3 text-success" />
        <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
          Transparency
        </p>
      </div>
      <div className="space-y-1 md:space-y-1.5">
        <Row label="Open source" />
        <Row label="Verifiable randomness" />
        <Row label="On-chain settlement" />
      </div>
      <a
        href={explorerUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 md:mt-2 flex items-center justify-center gap-1 text-[10px] text-primary hover:underline"
      >
        View contract
        <ExternalLink className="w-2.5 h-2.5" />
      </a>
    </div>
  );
}

function Row({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-foreground text-[10px] md:text-xs">
      <CheckCircle className="w-3 h-3 text-success shrink-0" />
      <span>{label}</span>
    </div>
  );
}
