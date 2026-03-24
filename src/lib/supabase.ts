import { createClient } from '@supabase/supabase-js';

const envSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const envSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const hasSupabaseConfig = Boolean(envSupabaseUrl && envSupabaseAnonKey);

// Keep client initialization stable in SSR/build by falling back to safe placeholder values.
const supabaseUrl = envSupabaseUrl || 'https://placeholder.supabase.co';
const supabaseAnonKey = envSupabaseAnonKey || 'placeholder-anon-key';

if (typeof window !== 'undefined' && !hasSupabaseConfig) {
  console.error(
    'Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const isSupabaseConfigured = hasSupabaseConfig;

export default supabase;
