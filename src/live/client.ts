import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

// Written so the build can work it out: a live build then leaves the demo
// company, and everything only it needs, out of what the browser downloads.
export const isLive = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

export const supabase: SupabaseClient | null = isLive
  ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

/**
 * The database: the live project, or in demo mode the in-memory demo company,
 * which answers the same queries. Screens never know which.
 */
export function db(): SupabaseClient {
  if (isLive) return supabase!;
  if (!demo) throw new Error('The demo company is not loaded yet.');
  return demo() as SupabaseClient;
}

/**
 * The demo company is its own download, fetched only when there is no live
 * project (main.tsx loads it before the first screen), so the console a
 * company uses never carries it.
 */
let demo: (() => unknown) | null = null;
export async function loadDemo(): Promise<void> {
  if (isLive || demo) return;
  demo = (await import('../demo/fakedb')).demoClient;
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
