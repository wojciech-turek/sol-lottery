export function LiveChatPlaceholder() {
  return (
    <div className="rounded-lg border border-white/5 bg-zinc-900/50 p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full border border-zinc-500/40 inline-block" />
          Live chat
        </span>
        <span className="w-2 h-2 rounded-full bg-emerald-400" />
      </div>
      <div className="flex-1 overflow-y-auto grid gap-3 text-sm">
        <Message
          author="Admin"
          body="Integrated live chat coming soon!"
        />
        <Message
          author="Admin"
          body={
            <>
              Check out our Telegram to engage with other users and get
              notified at <span className="text-amber-400">@Example</span>
            </>
          }
        />
      </div>
    </div>
  );
}

function Message({ author, body }: { author: string; body: React.ReactNode }) {
  return (
    <div className="rounded-md bg-zinc-900 border border-white/5 p-3">
      <div className="text-[10px] uppercase tracking-wider text-amber-400 mb-1">
        {author}
      </div>
      <div className="text-sm text-zinc-200">{body}</div>
    </div>
  );
}
