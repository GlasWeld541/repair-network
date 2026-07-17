import { createBrowserClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Repair Network data lives in the `network` schema of the shared Rex Supabase
// project (the Rex app uses `public`). Point every client at `network`.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'network' },
});

export function createAdminClient() {
  return createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? supabaseAnonKey,
    {
      db: { schema: 'network' },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}