import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'WARNING: SUPABASE_URL or SUPABASE_ANON_KEY is not defined in environment variables. ' +
    'The Supabase client will fail to initialize queries.'
  );
}

// Regular client: uses the service role key if available to bypass Row Level Security (RLS)
// since the backend is a secure, trusted environment that already enforces user-specific filtering.
// Falls back to the anonymous key if the service role key is not defined.
const databaseKey = supabaseServiceKey || supabaseAnonKey || 'placeholder-key';

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  databaseKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

// Admin client reference kept for backwards compatibility
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl || '', supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })
  : null;
