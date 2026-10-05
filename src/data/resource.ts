import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * One way for every screen to read the database: a keyed, shared, cached read.
 *
 * Two screens asking for the same key share one request and one result. A
 * result is shown again at once on return to a screen and quietly read again
 * when it is older than a minute; a failed refresh keeps the last good result
 * on screen and says so, rather than blanking it. A write calls `invalidate`
 * with the keys it affects, so every screen showing them reads again.
 *
 * While the tab is in front, what is on screen is read again every minute, and
 * at once when the office comes back to the tab, so the field's work appears
 * without anyone pressing refresh. A hidden tab reads nothing. A report the
 * office asked for is theirs to re-run, and is left as it is.
 */

export type Resource<T> = {
  status: 'loading' | 'ready' | 'error';
  data: T | undefined;
  /** The message of the last failed read, if the last read failed. */
  error: string;
  at: Date | null;
  reload: () => Promise<void>;
};

type Entry = { status: 'loading' | 'ready' | 'error'; data: unknown; error: string; at: Date | null; inFlight: Promise<void> | null; stale: boolean };

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let version = 0;
const notify = () => {
  version++;
  listeners.forEach(l => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function read(key: string, loader: () => Promise<unknown>): Promise<void> {
  const e = entries.get(key) ?? { status: 'loading', data: undefined, error: '', at: null, inFlight: null, stale: false };
  entries.set(key, e);
  if (e.inFlight) return e.inFlight;
  e.inFlight = loader()
    .then(data => Object.assign(e, { data, status: 'ready', error: '', at: new Date(), stale: false }))
    .catch(err => Object.assign(e, { status: e.at ? 'ready' : 'error', error: err instanceof Error ? err.message : String(err) }))
    .then(() => {
      e.inFlight = null;
      notify();
    });
  notify();
  return e.inFlight;
}

/** Marks keys (or every key starting with a prefix ending in ':') as needing a fresh read. */
export function invalidate(...keys: string[]) {
  for (const [k, e] of entries) {
    if (keys.some(x => k === x || (x.endsWith(':') && k.startsWith(x)))) e.stale = true;
  }
  notify();
}

/** Forgets everything; used at sign-out so one login never sees another's data. */
export function forgetAll() {
  entries.clear();
  notify();
}

export function useResource<T>(key: string | null, loader: () => Promise<T>, maxAgeMs = 60_000): Resource<T> {
  useSyncExternalStore(subscribe, () => version);
  const e = key ? entries.get(key) : undefined;
  // The loader closes over the screen's arguments, which the key names.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(() => (key ? read(key, loader) : Promise.resolve()), [key]);
  useEffect(() => {
    if (!key) return;
    const cur = entries.get(key);
    if (!cur || cur.stale || (cur.at && Date.now() - cur.at.getTime() > maxAgeMs && !cur.inFlight)) void load();
  });
  if (!key) return { status: 'loading', data: undefined, error: '', at: null, reload: load };
  return {
    status: e?.status ?? 'loading',
    data: e?.data as T | undefined,
    error: e?.error ?? '',
    at: e?.at ?? null,
    reload: load,
  };
}

/** Keys that hold a result somebody asked for, read again only when they ask. */
const ON_REQUEST = ['reports:'];
const EVERY = 60_000;

function freshen(olderThan: number) {
  const now = Date.now();
  let any = false;
  for (const [k, e] of entries) {
    if (ON_REQUEST.some(p => k.startsWith(p)) || e.inFlight || e.stale || !e.at) continue;
    if (now - e.at.getTime() >= olderThan) { e.stale = true; any = true; }
  }
  // Screens showing a stale key read it again; the rest wait until they are opened.
  if (any) notify();
}

if (typeof window !== 'undefined') {
  window.setInterval(() => { if (document.visibilityState === 'visible') freshen(EVERY - 5_000); }, EVERY);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') freshen(15_000); });
}
