/**
 * Tiny formatting helpers used by both server + client components.
 */
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

export const lamportsToSol = (lamports: number | bigint): number =>
  Number(lamports) / LAMPORTS_PER_SOL;

export const formatSol = (lamports: number | bigint, decimals = 2): string =>
  lamportsToSol(lamports).toFixed(decimals);

export const shortAddress = (addr: string, head = 4, tail = 4): string =>
  addr.length <= head + tail + 1 ? addr : `${addr.slice(0, head)}…${addr.slice(-tail)}`;

export const formatDurationFromSeconds = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':');
};

export const relativeTime = (date: Date | string | number): string => {
  const d = typeof date === 'object' ? date.getTime() : new Date(date).getTime();
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};
