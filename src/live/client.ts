import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { demoClient } from '../demo/fakedb';

/**
 * The connection, and whether there is one.
 *
 * Two modes, both real. With VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
 * set, the console signs in and reads the live database. Without them it runs on
 * the labelled demo data, which is what design reviews and screenshots use. A
 * missing configuration chooses demo mode; it is never shown as an error, and a
 * live failure is never quietly replaced by demo data.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isLive = Boolean(url && key);

export const supabase: SupabaseClient | null = isLive
  ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

/**
 * The database: the live project, or in demo mode the in-memory demo company,
 * which answers the same queries. Screens never know which.
 */
export function db(): SupabaseClient {
  return supabase ?? (demoClient() as unknown as SupabaseClient);
}

/** Reads every row of a query, a page at a time (the API returns 1,000 at most). */
export async function readAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  size = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) return out;
  }
}
