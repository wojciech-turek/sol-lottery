export const runtime = 'nodejs';

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-12 gap-6">
      <h1 className="text-3xl font-semibold">sol-lottery</h1>
      <p className="text-sm opacity-70 max-w-md text-center">
        Scaffolding ready. Wire the Anchor program, Prisma models, and Supabase auth next.
      </p>
      <ul className="text-sm grid gap-1 opacity-80">
        <li>• Frontend: Next.js 16 + Tailwind 4</li>
        <li>
          • On-chain: Anchor (run <code>pnpm anchor:build</code>)
        </li>
        <li>
          • Off-chain: Prisma via <code>@sol-lottery/db</code>
        </li>
        <li>
          • Indexer: <code>apps/indexer</code>
        </li>
      </ul>
    </main>
  );
}
