import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Never call createClient at module level — it runs during Next.js build
// ("Collecting page data") before env vars are available, causing build failures.
// Use getSupabaseClient() which lazily creates the client on first call.

let _client: SupabaseClient | null = null;
let _serviceRoleClient: SupabaseClient | null = null;

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

/**
 * Get Supabase service role client for server-side operations that need to bypass RLS
 * Only use this on the server side - never expose the service role key to the client!
 */
export function getSupabaseServiceRoleClient(): SupabaseClient | null {
  if (_serviceRoleClient) return _serviceRoleClient;

  let url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

  if (!url || !serviceRoleKey) return null;

  // Normalize: add https:// if the user omitted the scheme
  if (!url.match(/^https?:\/\//i)) {
    url = 'https://' + url;
  }

  try {
    _serviceRoleClient = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    return _serviceRoleClient;
  } catch (err) {
    console.error('[Supabase Service Role] Failed to create client:', err);
    return null;
  }
}

export const isSupabaseConfigured = Boolean(
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim() &&
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()
);
