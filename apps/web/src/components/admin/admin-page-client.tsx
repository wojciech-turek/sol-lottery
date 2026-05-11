'use client';

import { useQuery } from '@tanstack/react-query';

import { AdminTabs, type AdminTabData } from '@/components/admin/admin-tabs';
import { useLotteryRealtime } from '@/hooks/use-lottery-snapshot';

/**
 * Client-side shell for /admin. Mounts the shared Realtime subscription so
 * any lottery/lottery_round row change invalidates the admin query (and
 * every other ['lottery', …] cache entry — same fan-out as the landing
 * page). One WS connection serves the whole app.
 */
export function AdminPageClient() {
  useLotteryRealtime();
  const { data, isLoading, error } = useQuery<{ lotteries: AdminTabData[] }>({
    queryKey: ['lottery', 'admin'],
    queryFn: async () => {
      const res = await fetch('/api/admin/lotteries');
      if (!res.ok) throw new Error('admin fetch failed');
      return res.json();
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <AdminSkeleton />;
  if (error) {
    return (
      <div className="p-6 text-sm text-red-400">
        Failed to load admin data: {(error as Error).message}
      </div>
    );
  }
  return <AdminTabs lotteries={data?.lotteries ?? []} />;
}

function AdminSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6 p-6">
      <aside className="border border-white/5 rounded-lg bg-zinc-900/40 p-2 self-start">
        <ul className="grid gap-1">
          {[0, 1, 2].map((i) => (
            <li key={i} className="px-3 py-2">
              <div className="h-4 w-full rounded bg-zinc-800/60 animate-pulse" />
            </li>
          ))}
        </ul>
      </aside>
      <section className="grid gap-6">
        <header className="flex items-center justify-between">
          <div className="grid gap-2">
            <div className="h-5 w-48 rounded bg-zinc-800/60 animate-pulse" />
            <div className="h-3 w-72 rounded bg-zinc-800/40 animate-pulse" />
          </div>
          <div className="h-5 w-16 rounded bg-zinc-800/60 animate-pulse" />
        </header>
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 rounded-lg border border-white/5 bg-zinc-900/40 animate-pulse"
            />
          ))}
        </div>
        <div className="h-48 rounded-lg border border-white/5 bg-zinc-900/40 animate-pulse" />
        <div className="h-64 rounded-lg border border-white/5 bg-zinc-900/40 animate-pulse" />
      </section>
    </div>
  );
}
