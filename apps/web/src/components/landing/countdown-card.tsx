'use client';

import { useEffect, useState } from 'react';

import { formatDurationFromSeconds } from '@/lib/format';

export function CountdownCard({
  effectiveEndUnix,
  paused = false,
  roundIndex,
}: {
  effectiveEndUnix: number;
  paused?: boolean;
  roundIndex?: string | number | bigint;
}) {
  const [now, setNow] = useState<number>(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, [paused]);
  const remaining = Math.max(0, effectiveEndUnix - now);
  const [h, m, s] = formatDurationFromSeconds(remaining).split(':');
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-2 mb-1">
        <p className="text-muted-foreground text-[10px] uppercase tracking-wider">
          {paused ? 'Paused at' : 'Next draw'}
        </p>
        {roundIndex !== undefined && (
          <span className="text-[10px] uppercase tracking-wider text-primary/80 font-mono">
            · Round #{roundIndex.toString()}
          </span>
        )}
      </div>
      <div
        className={`flex items-center justify-center gap-0.5 md:gap-1 font-mono text-base md:text-lg ${
          paused ? 'opacity-50' : ''
        }`}
      >
        <span className="text-foreground tabular-nums">{h}</span>
        <span className="text-muted-foreground/50">:</span>
        <span className="text-foreground tabular-nums">{m}</span>
        <span className="text-muted-foreground/50">:</span>
        <span className="text-foreground tabular-nums">{s}</span>
      </div>
    </div>
  );
}
