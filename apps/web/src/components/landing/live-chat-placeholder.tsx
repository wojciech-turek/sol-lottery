import { MessageCircle } from 'lucide-react';

export function LiveChatPlaceholder({ hideHeader }: { hideHeader?: boolean }) {
  return (
    <div className="glass rounded-lg h-full flex flex-col overflow-hidden">
      {!hideHeader && (
        <div className="px-3 py-2 border-b border-border/50 flex items-center gap-1.5 shrink-0">
          <MessageCircle className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground text-[10px] uppercase tracking-wider">
            Live chat
          </span>
          <span className="ml-auto w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
        </div>
      )}
      <div className="flex-1 overflow-y-auto scroll-thin p-2 md:p-2 space-y-2 min-h-0">
        <Message author="Admin" body="Integrated live chat coming soon!" />
        <Message
          author="Admin"
          body={
            <>
              Hop into our Telegram to chat with other players —{' '}
              <span className="text-primary">@Example</span>
            </>
          }
        />
      </div>
    </div>
  );
}

function Message({
  author,
  body,
}: {
  author: string;
  body: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-secondary/50 border border-border/50 px-3 py-2">
      <div className="text-[9px] uppercase tracking-wider text-primary mb-0.5">
        {author}
      </div>
      <div className="text-xs text-foreground leading-relaxed">{body}</div>
    </div>
  );
}
