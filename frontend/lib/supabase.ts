import { createClient } from '@supabase/supabase-js';

// Initialize the Supabase client securely using environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("⚠️ Supabase credentials are missing from .env.local!");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);