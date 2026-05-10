import { fetchActiveLottery } from '@/lib/chain/server';
import { Header } from '@/components/header';
import { CountdownCard } from '@/components/landing/countdown-card';
import { TicketsCard } from '@/components/landing/tickets-card';
import { HowItWorksCard } from '@/components/landing/how-it-works-card';
import { TransparencyCard } from '@/components/landing/transparency-card';
import { PoolDisplay } from '@/components/landing/pool-display';
import { BuyTicketCta } from '@/components/landing/buy-ticket-cta';
import { LiveChatPlaceholder } from '@/components/landing/live-chat-placeholder';
import { RecentWinners } from '@/components/landing/recent-winners';
import { PoolActivity } from '@/components/landing/pool-activity';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const snapshot = await fetchActiveLottery().catch((err) => {
    console.error('[home] fetchActiveLottery failed', err);
    return null;
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      {snapshot ? (
        <>
          <main className="flex-1 grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_340px] gap-4 p-4">
            {/* Left column */}
            <aside className="grid auto-rows-min gap-3">
              <CountdownCard
                effectiveEndUnix={snapshot.round.effectiveEndUnix}
              />
              <TicketsCard roundPubkey={snapshot.round.round.toBase58()} />
              <HowItWorksCard
                ticketPriceLamports={snapshot.lottery.ticketPriceLamports}
                durationSeconds={snapshot.lottery.durationSeconds}
                poolBps={
                  snapshot.lottery.splits.find((s) => s.isPool)?.bps ?? 0
                }
              />
              <TransparencyCard />
            </aside>

            {/* Center */}
            <section className="flex flex-col items-center justify-center gap-8 py-12">
              <PoolDisplay
                roundPubkey={snapshot.round.round.toBase58()}
                initialPoolLamports={snapshot.round.poolLamports.toString()}
              />
              <BuyTicketCta
                lottery={snapshot.lottery.lottery.toBase58()}
                round={snapshot.round.round.toBase58()}
                currentShardIndex={snapshot.round.currentShardIndex}
                ticketPriceLamports={snapshot.round.ticketPriceLamports.toString()}
                roundState={snapshot.round.state}
                lotteryState={snapshot.lottery.state}
              />
            </section>

            {/* Right column */}
            <aside>
              <LiveChatPlaceholder />
            </aside>
          </main>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 border-t border-white/5">
            <RecentWinners />
            <PoolActivity />
          </section>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center p-12">
          <div
            className="relative h-48 w-48 rounded-full border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-amber-500/0 flex items-center justify-center"
            aria-hidden
          >
            <span className="absolute inset-0 rounded-full animate-ping bg-amber-500/5" />
            <span className="text-5xl">🎟️</span>
          </div>
          <div className="grid gap-2">
            <h1 className="text-3xl text-zinc-100 font-semibold tracking-tight">
              First lottery starting soon
            </h1>
            <p className="text-sm text-zinc-500 max-w-md mx-auto leading-relaxed">
              We&apos;re lining up the very first round of people&apos;s pot.
              Connect your wallet now so you&apos;re ready the moment tickets
              go on sale.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-amber-400/70">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            Stay tuned
          </div>
        </div>
      )}
    </div>
  );
}
