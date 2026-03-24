import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Never call createClient at module level — it runs during Next.js build
// ("Collecting page data") before env vars are available, causing build failures.
// Use getSupabaseClient() which lazily creates the client on first call.

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (_client) return _client;

  let url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

  if (!url || !key) return null;

  // Normalize: add https:// if the user omitted the scheme in Netlify UI
  if (!url.match(/^https?:\/\//i)) {
    url = 'https://' + url;
  }

  try {
    _client = createClient(url, key);
    return _client;
  } catch (err) {
    console.error('[Supabase] Failed to create client:', err);
    return null;
  }
}

export const isSupabaseConfigured = Boolean(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim() &&
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()
);
