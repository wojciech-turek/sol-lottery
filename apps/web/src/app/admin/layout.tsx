import { Header } from '@/components/header';

export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="px-6 py-4 border-b border-white/5 flex items-center gap-3">
        <span className="w-5 h-5 rounded-md bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
          ⚙
        </span>
        <div>
          <h1 className="text-base font-semibold text-zinc-100">Admin Panel</h1>
          <p className="text-xs text-zinc-500">
            Restricted controls — handle with care.
          </p>
        </div>
      </div>
      <main className="flex-1">{children}</main>
    </div>
  );
}
