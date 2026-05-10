'use client';

import { useEffect, useState } from 'react';

import { formatDurationFromSeconds } from '@/lib/format';

export function CountdownCard({ effectiveEndUnix }: { effectiveEndUnix: number }) {
  const [now, setNow] = useState<number>(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, effectiveEndUnix - now);
  const [h, m, s] = formatDurationFromSeconds(remaining).split(':');
  return (
    <div className="flex flex-col items-center gap-2 py-3">
      <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
        Next draw
      </span>
      <div className="flex items-center gap-1 font-mono text-2xl text-zinc-100">
        <Block value={h} />
        <Sep />
        <Block value={m} />
        <Sep />
        <Block value={s} />
      </div>
    </div>
  );
}

function Block({ value }: { value: string }) {
  return <span className="tabular-nums">{value}</span>;
}
function Sep() {
  return <span className="text-zinc-500">:</span>;
}
