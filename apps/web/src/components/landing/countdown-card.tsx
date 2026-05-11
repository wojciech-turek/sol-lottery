'use client';

import { useEffect, useState } from 'react';

import { useLottery } from '@/hooks/use-lottery-snapshot';
import { formatDurationFromSeconds } from '@/lib/format';

export function CountdownCard() {
  const { data } = useLottery();
  const paused = data?.lottery.state === 'paused';
  const effectiveEndUnix = data?.round.effectiveEndUnix ?? 0;
  const roundIndex = data?.round.index;

  const [now, setNow] = useState<number>(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (paused || !effectiveEndUnix) return;
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, [paused, effectiveEndUnix]);

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
            · Round #{roundIndex}
          </span>
        )}
      </div>
      <div
        className={`flex items-center justify-center gap-0.5 md:gap-1 font-mono text-base md:text-lg ${
          paused ? 'opacity-50' : ''
        } ${!data ? 'opacity-40' : ''}`}
      >
        <span className="text-foreground tabular-nums">
          {data ? h : '--'}
        </span>
        <span className="text-muted-foreground/50">:</span>
        <span className="text-foreground tabular-nums">
          {data ? m : '--'}
        </span>
        <span className="text-muted-foreground/50">:</span>
        <span className="text-foreground tabular-nums">
          {data ? s : '--'}
        </span>
      </div>
    </div>
  );
}
