import { Pause, Sparkles } from 'lucide-react';

export type StatusBannerKind =
  | 'paused'
  | 'pendingDisable'
  | 'disabled'
  | 'resolving';

const COPY: Record<StatusBannerKind, { label: string; sub: string }> = {
  paused: {
    label: 'Lottery paused',
    sub: 'Tickets are on hold while the operator pauses the round. The countdown is frozen.',
  },
  pendingDisable: {
    label: 'Winding down',
    sub: 'This is the final round — no new lottery will roll over after it resolves.',
  },
  disabled: {
    label: 'Lottery disabled',
    sub: 'No new tickets and no further rounds. The pool will pay out the last winner.',
  },
  resolving: {
    label: 'Drawing the winner',
    sub: 'The round has ended. The resolver is fetching verifiable randomness from ORAO — the winner will be announced shortly.',
  },
};

export function PausedBanner({ state }: { state: StatusBannerKind }) {
  const { label, sub } = COPY[state];
  const Icon = state === 'resolving' ? Sparkles : Pause;
  return (
    <div className="glass rounded-lg px-3 py-2 md:px-4 md:py-2.5 flex items-center gap-3 border-l-2 border-l-primary">
      <Icon
        className={`w-4 h-4 text-primary shrink-0 ${state === 'resolving' ? 'animate-pulse' : ''}`}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <p className="text-foreground text-xs md:text-sm font-medium">{label}</p>
        <p className="text-muted-foreground text-[10px] md:text-xs leading-snug">
          {sub}
        </p>
      </div>
    </div>
  );
}
