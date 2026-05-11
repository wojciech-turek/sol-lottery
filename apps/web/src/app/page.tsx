'use client';

import { Header } from '@/components/header';
import { ChatDrawer } from '@/components/landing/chat-drawer';
import { CountdownCard } from '@/components/landing/countdown-card';
import { HowItWorksCard } from '@/components/landing/how-it-works-card';
import { LiveChatPlaceholder } from '@/components/landing/live-chat-placeholder';
import { PausedBanner, type StatusBannerKind } from '@/components/landing/paused-banner';
import { PoolActivity } from '@/components/landing/pool-activity';
import { PoolDisplay } from '@/components/landing/pool-display';
import { RecentWinners } from '@/components/landing/recent-winners';
import { LotteryRealtime } from '@/components/landing/snapshot-watcher';
import { TicketsCard } from '@/components/landing/tickets-card';
import { TransparencyCard } from '@/components/landing/transparency-card';
import { useLottery } from '@/hooks/use-lottery-snapshot';

export default function HomePage() {
  // Mounts the Supabase Realtime subscription once for the whole landing.
  // Every dynamic card below reads from React Query (`useLottery()` / its
  // siblings) and gets refetched automatically when the indexer writes a
  // change. No polling, no SSR-vs-client drift, no `router.refresh()`.
  return (
    <>
      <LotteryRealtime />
      <LandingBody />
    </>
  );
}

function LandingBody() {
  const { data, isLoading } = useLottery();

  if (!isLoading && !data) {
    return <EmptyState />;
  }

  // Banner is reserved for state that meaningfully shifts the user's mental
  // model (paused, winding down, disabled). The "resolving" window is short
  // and best communicated on the buy button itself.
  const dimState: StatusBannerKind | null =
    data?.lottery.state === 'paused'
      ? 'paused'
      : data?.lottery.state === 'disabled'
        ? 'disabled'
        : data?.lottery.state === 'pendingDisable'
          ? 'pendingDisable'
          : null;

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col px-3 pb-3 gap-2 md:gap-3 relative">
      <Header />
      {dimState && <PausedBanner state={dimState} />}

      {/* Mobile layout */}
      <main className="flex-1 flex flex-col md:hidden min-h-0 overflow-y-auto">
        <div className="flex-1 flex flex-col items-center justify-center min-h-[260px] py-4">
          <CountdownCard />
          <div className="mt-2">
            <PoolDisplay />
          </div>
        </div>

        <div className="shrink-0 mb-3">
          <TicketsCard />
        </div>

        <div className="grid grid-cols-2 gap-2 shrink-0 h-32 mb-2">
          <RecentWinners />
          <PoolActivity />
        </div>

        <div className="grid grid-cols-2 gap-2 shrink-0">
          <HowItWorksCard />
          <TransparencyCard />
        </div>
      </main>

      {/* Mobile chat drawer */}
      <ChatDrawer />

      {/* Desktop layout */}
      <main className="hidden md:grid md:flex-1 md:grid-cols-12 gap-3 min-h-0">
        <div className="col-span-3 flex flex-col gap-3 min-h-0">
          <CountdownCard />
          <TicketsCard />
          <HowItWorksCard />
          <TransparencyCard />
        </div>

        <div className="col-span-6 flex items-center justify-center">
          <PoolDisplay />
        </div>

        <div className="col-span-3 min-h-0">
          <LiveChatPlaceholder />
        </div>
      </main>

      <footer className="hidden md:grid grid-cols-2 gap-3 shrink-0 h-48">
        <RecentWinners />
        <PoolActivity />
      </footer>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex flex-col items-center justify-center gap-8 px-4 pb-12 text-center">
        <p className="text-muted-foreground/50 text-[10px] md:text-xs italic tracking-wide">
          Your fair shot, every day
        </p>

        <div className="relative">
          <div className="absolute inset-0 pot-gradient rounded-full blur-2xl opacity-20 scale-125" />
          <div className="relative pot-glow pot-gradient rounded-full w-32 h-32 md:w-40 md:h-40 lg:w-48 lg:h-48 flex flex-col items-center justify-center animate-float">
            <span className="text-primary-foreground/60 text-[8px] md:text-[10px] uppercase tracking-wider">
              Pool
            </span>
            <span className="text-primary-foreground text-3xl md:text-4xl font-bold font-mono tabular-nums">
              —
            </span>
            <span className="text-primary-foreground/70 text-xs md:text-sm font-medium">
              SOL
            </span>
          </div>
        </div>

        <div className="grid gap-2 max-w-md">
          <h1 className="text-2xl md:text-3xl font-bold text-gradient-gold tracking-tight">
            First lottery starting soon
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We&apos;re lining up the very first round of people&apos;s pot. Connect your wallet
            now so you&apos;re ready the moment tickets go on sale.
          </p>
        </div>

        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-primary/70">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          Stay tuned
        </div>
      </main>
    </div>
  );
}
