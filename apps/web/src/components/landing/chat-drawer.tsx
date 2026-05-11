'use client';

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';

import { LiveChatPlaceholder } from '@/components/landing/live-chat-placeholder';

export function ChatDrawer() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        className={`md:hidden fixed inset-y-0 right-0 z-50 flex transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-[calc(100%-44px)]'
        }`}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle chat"
          className="self-start mt-[40%] -translate-y-1/2 pot-gradient backdrop-blur-sm p-2.5 rounded-l-lg shadow-lg shrink-0 relative"
        >
          <MessageCircle className="w-4 h-4 text-primary-foreground" />
          {!open && (
            <span className="absolute top-1.5 left-1.5 w-2 h-2 bg-success rounded-full animate-pulse" />
          )}
        </button>

        <div className="w-[85vw] max-w-[320px] h-full glass flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 p-3 border-b border-border/30 shrink-0">
            <span className="text-sm font-medium text-foreground">Chat</span>
            <span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
          </div>
          <div className="flex-1 min-h-0">
            <LiveChatPlaceholder hideHeader />
          </div>
        </div>
      </div>

      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}
    </>
  );
}
