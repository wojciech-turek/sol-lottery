/**
 * Gates `/admin/*`. Verifies the HMAC-signed session cookie; the deeper
 * `is_admin` lookup against Postgres lives in `app/admin/page.tsx`'s server
 * component (`requireAdmin()`), which redirects to `/` when missing.
 *
 * This proxy exists primarily to short-circuit unauthenticated `/admin`
 * traffic so it never reaches the page render.
 *
 * Next.js 16 note: the file convention is `proxy.ts` (renamed from
 * `middleware.ts` in v16.0). The exported function name is `proxy` and
 * the `runtime` config option is no longer accepted — proxies always run
 * on the Node.js runtime, which is what `node:crypto`-based session
 * verification needs.
 */
import { NextRequest, NextResponse } from 'next/server';

import { decodeSession, SESSION_COOKIE } from '@/lib/auth/session';

export function proxy(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const session = decodeSession(cookie);
  if (!session) {
    const url = new URL('/', req.url);
    url.searchParams.set('signin_required', '1');
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
