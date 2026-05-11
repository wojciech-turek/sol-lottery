import { AdminPageClient } from '@/components/admin/admin-page-client';
import { requireAdmin } from '@/lib/auth/require-admin';

/**
 * Auth gate only — `requireAdmin()` redirects unauthorized visitors. All
 * dynamic data is fetched client-side via `<AdminPageClient />` against
 * `/api/admin/lotteries` and refreshed by Supabase Realtime. No SSR data,
 * no `router.refresh()`, no chain reads.
 */
export default async function AdminPage() {
  await requireAdmin();
  return <AdminPageClient />;
}
