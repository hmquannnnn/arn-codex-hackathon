import { createClient } from '@supabase/supabase-js';

/** Server-only service-role connection, always in the configured schema. */
export function createDb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase credentials are not configured');
  return createClient(url, key, {
    db: { schema: process.env.KITLY_DB_SCHEMA || 'public' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
