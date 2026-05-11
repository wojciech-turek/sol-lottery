import { fetchActiveLottery } from '@/lib/chain/server';
import { Header } from '@/components/header';
import { CountdownCard } from '@/components/landing/countdown-card';
import { TicketsCard } from '@/components/landing/tickets-card';
import { HowItWorksCard } from '@/components/landing/how-it-works-card';
import { TransparencyCard } from '@/components/landing/transparency-card';
import { PoolDisplay } from '@/components/landing/pool-display';
import { LiveChatPlaceholder } from '@/components/landing/live-chat-placeholder';
import { ChatDrawer } from '@/components/landing/chat-drawer';
import { PausedBanner } from '@/components/landing/paused-banner';
import { SnapshotWatcher } from '@/components/landing/snapshot-watcher';
import type { LotterySnapshot } from '@/hooks/use-lottery-snapshot';
import { RecentWinners } from '@/components/landing/recent-winners';
import { PoolActivity } from '@/components/landing/pool-activity';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const snapshot = await fetchActiveLottery().catch((err) => {
    console.error('[home] fetchActiveLottery failed', err);
    return null;
  });

  if (!snapshot) {
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
              We&apos;re lining up the very first round of people&apos;s pot.
              Connect your wallet now so you&apos;re ready the moment tickets
              go on sale.
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

  const roundPubkey = snapshot.round.round.toBase58();
  const lotteryPubkey = snapshot.lottery.lottery.toBase58();
  const isPaused = snapshot.lottery.state === 'paused';
  const nowSec = Math.floor(Date.now() / 1000);
  // The round is "resolving" once it's past its effective end OR has moved
  // into the closed/awaitingVrf chain state — at that point the resolver
  // is in flight and no more buys land.
  const isResolving =
    snapshot.lottery.state === 'active' &&
    (snapshot.round.state === 'closed' ||
      snapshot.round.state === 'awaitingVrf' ||
      (snapshot.round.state === 'open' &&
        snapshot.round.effectiveEndUnix <= nowSec));
  const dimState: 'paused' | 'pendingDisable' | 'disabled' | 'resolving' | null =
    snapshot.lottery.state === 'paused'
      ? 'paused'
      : snapshot.lottery.state === 'disabled'
        ? 'disabled'
        : isResolving
          ? 'resolving'
          : snapshot.lottery.state === 'pendingDisable'
            ? 'pendingDisable'
            : null;

  const initialSnapshot: LotterySnapshot = {
    lottery: {
      pubkey: lotteryPubkey,
      lotteryIndex: snapshot.lottery.lotteryIndex.toString(),
      name: snapshot.lottery.name,
      state: snapshot.lottery.state,
      prizeKind: snapshot.lottery.prizeKind,
      ticketPriceLamports: snapshot.lottery.ticketPriceLamports.toString(),
      durationSeconds: snapshot.lottery.durationSeconds.toString(),
      autoRollover: snapshot.lottery.autoRollover,
    },
    round: {
      pubkey: roundPubkey,
      index: snapshot.round.index.toString(),
      state: snapshot.round.state,
      startedAt: snapshot.round.startedAt,
      durationSeconds: snapshot.round.durationSeconds,
      pausedTotalSeconds: snapshot.round.pausedTotalSeconds,
      effectiveEndUnix: snapshot.round.effectiveEndUnix,
      ticketsSold: snapshot.round.ticketsSold.toString(),
      donatedLamports: snapshot.round.donatedLamports.toString(),
      currentShardIndex: snapshot.round.currentShardIndex,
      poolLamports: snapshot.round.poolLamports.toString(),
    },
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col px-3 pb-3 gap-2 md:gap-3 relative">
      <SnapshotWatcher initial={initialSnapshot} />
      <Header />
      {dimState && <PausedBanner state={dimState} />}

      {/* Mobile layout */}
      <main className="flex-1 flex flex-col md:hidden min-h-0 overflow-y-auto">
        <div className="flex-1 flex flex-col items-center justify-center min-h-[260px] py-4">
          <CountdownCard
            effectiveEndUnix={snapshot.round.effectiveEndUnix}
            paused={isPaused}
          />
          <div className="mt-2">
            <PoolDisplay
              lottery={lotteryPubkey}
              round={roundPubkey}
              currentShardIndex={snapshot.round.currentShardIndex}
              ticketPriceLamports={snapshot.round.ticketPriceLamports.toString()}
              initialPoolLamports={snapshot.round.poolLamports.toString()}
              roundState={snapshot.round.state}
              lotteryState={snapshot.lottery.state}
            />
          </div>
        </div>

        <div className="shrink-0 mb-3">
          <TicketsCard roundPubkey={roundPubkey} />
        </div>

        <div className="grid grid-cols-2 gap-2 shrink-0 h-32 mb-2">
          <RecentWinners />
          <PoolActivity />
        </div>

        <div className="grid grid-cols-2 gap-2 shrink-0">
          <HowItWorksCard
            ticketPriceLamports={snapshot.lottery.ticketPriceLamports}
            durationSeconds={snapshot.lottery.durationSeconds}
            poolBps={snapshot.lottery.splits.find((s) => s.isPool)?.bps ?? 0}
          />
          <TransparencyCard />
        </div>
      </main>

      {/* Mobile chat drawer */}
      <ChatDrawer />

      {/* Desktop layout */}
      <main className="hidden md:grid md:flex-1 md:grid-cols-12 gap-3 min-h-0">
        <div className="col-span-3 flex flex-col gap-3 min-h-0">
          <CountdownCard
            effectiveEndUnix={snapshot.round.effectiveEndUnix}
            paused={isPaused}
          />
          <TicketsCard roundPubkey={roundPubkey} />
          <HowItWorksCard
            ticketPriceLamports={snapshot.lottery.ticketPriceLamports}
            durationSeconds={snapshot.lottery.durationSeconds}
            poolBps={snapshot.lottery.splits.find((s) => s.isPool)?.bps ?? 0}
          />
          <TransparencyCard />
        </div>

        <div className="col-span-6 flex items-center justify-center">
          <PoolDisplay
            lottery={lotteryPubkey}
            round={roundPubkey}
            currentShardIndex={snapshot.round.currentShardIndex}
            ticketPriceLamports={snapshot.round.ticketPriceLamports.toString()}
            initialPoolLamports={snapshot.round.poolLamports.toString()}
            roundState={snapshot.round.state}
            lotteryState={snapshot.lottery.state}
          />
        </div>

        <div className="col-span-3 min-h-0">
          <LiveChatPlaceholder />
        </div>
      </main>

      <footer className="hidden md:grid grid-cols-2 gap-3 shrink-0 h-32">
        <RecentWinners />
        <PoolActivity />
      </footer>
    </div>
  );
}
