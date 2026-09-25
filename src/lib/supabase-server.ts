import 'server-only';
import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const isConfigured = Boolean(url && key);

export async function serverSupabase() {
  if (!url || !key) throw new Error('Supabase is not configured');
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() { return store.getAll(); },
      setAll(values: { name: string; value: string; options: CookieOptions }[]) {
        try { values.forEach(({ name, value, options }) => store.set(name, value, options)); }
        catch { /* Server Components cannot write cookies; route handlers can. */ }
      },
    },
  });
}
