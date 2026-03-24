import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Only validate at runtime on the client, not at build time
let supabase: any = null;

if (typeof window !== 'undefined') {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

export { supabase };
export default supabase;
