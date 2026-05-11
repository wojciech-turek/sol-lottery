import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

export function createClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Supabase renamed the anon key to the "publishable key" in their newer
  // dashboard — same role (public, RLS-gated), new name.
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set',
    );
  }
  return createBrowserClient(url, publishableKey);
}

let browserClient: SupabaseClient | null = null;

// Singleton so every consumer (Realtime channels, auth helpers) shares one
// websocket. Creating fresh clients in hooks would open a new WS per render.
export function getBrowserSupabase(): SupabaseClient {
  if (!browserClient) browserClient = createClient();
  return browserClient;
}
