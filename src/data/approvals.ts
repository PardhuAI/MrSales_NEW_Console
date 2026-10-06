import { useEffect, useSyncExternalStore } from 'react';

/**
 * Approvals: what is waiting, and deciding it.
 *
 * The shape mirrors the live database exactly, so the demo store below is
 * swapped for the live one without touching a screen:
 *   expense days  → rpc decide_expenses(p_ids uuid[], p_approve, p_reason)  (0094)
 *   orders        → rpc decide_orders(p_ids uuid[], p_approve, p_reason)    (0095)
 *   tour months   → rpc decide_tour(p_id, p_approve, p_reason)
 *   leave         → rpc decide_leave(p_leave_id, p_approve, p_reason)
 * One call per kind, so a person approved together gets one message, as on the phone.
 */

export type Kind = 'expense' | 'order' | 'tour' | 'leave';

export const KIND_LABEL: Record<Kind, string> = {
  expense: 'Expense claims',
  order: 'Orders',
  tour: 'Tour plans',
  leave: 'Leave',
};

export type Person = { id: string; name: string; hq: string; territory: string; manager: string };

type Base = { id: string; personId: string; submittedAt: string };

export type ExpenseDay = Base & {
  kind: 'expense';
  date: string;
  amount: number;
  categories: string[];
  /** Where they worked that day, from the day plan. */
  station: string;
  /** Required above the allowance; shown to the approver. */
  reason?: string;
  /** A description of the bill, shown when there is no file to open (demo). */
  bill?: string;
  /** Paths of the bill files in storage (bucket "receipts"). */
  bills: string[];
  /** This person's daily allowance: their role's rule, else the company's. */
  allowance?: number;
};

export type Order = Base & {
  kind: 'order';
  number: string;
  client: string;
  stockist: string;
  lines: number;
  value: number;
  /** Discount given, in percent. */
  discount: number;
  /** The stockist's discount slab, where one is set; above it the order needs a look. */
  slab?: number;
};

export type TourMonth = Base & {
  kind: 'tour';
  month: string;
  workingDays: number;
  plannedDays: number;
  clients: number;
  outstation: number;
};

export type LeaveRequest = Base & {
  kind: 'leave';
  leaveType: string;
  from: string;
  to: string;
  days: number;
  reason: string;
  balanceAfter?: number;
};

export type Pending = ExpenseDay | Order | TourMonth | LeaveRequest;

export type Decision = {
  id: string;
  kind: Kind;
  personId: string;
  summary: string;
  value?: number;
  approved: boolean;
  reason?: string;
  by: string;
  at: string;
};

/**
 * Whether a request needs a closer look before it is approved: an expense day
 * above that person's daily allowance (their role's rule, else the company's), an order above its stockist's
 * discount slab (where one is set), a tour month with working days unplanned.
 */
export const needsLook = (p: Pending) =>
  (p.kind === 'expense' && p.amount > (p.allowance ?? state.allowance)) ||
  (p.kind === 'order' && p.slab !== undefined && p.discount > p.slab) ||
  (p.kind === 'tour' && p.plannedDays < p.workingDays);

export const valueOf = (p: Pending) =>
  p.kind === 'expense' ? p.amount : p.kind === 'order' ? p.value : 0;

/**
 * What an official calls a request: a person's month of expense days is one
 * claim, however many days it has; every order, tour month and leave is one.
 */
export const requestKey = (p: Pending) => {
  if (p.kind !== 'expense') return `${p.kind}:${p.id}`;
  // The month as it is in India, not in UTC: 1 September 00:00 IST is still
  // 31 August in UTC, and slicing the ISO string split one claim in two.
  const d = new Date(p.date);
  return `expense:${p.personId}:${d.getFullYear()}-${d.getMonth() + 1}`;
};

export const requestCount = (list: Pending[]) => new Set(list.map(requestKey)).size;

/** Whole days since it was sent. */
export const ageDays = (iso: string, now = state.now) =>
  Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));

// ── the store: one for the demo, one for the live database ─────────────

type State = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string;
  pending: Pending[];
  decided: Decision[];
  people: Map<string, Person>;
  allowance: number;
  now: Date;
};

export type ApprovalsSource = {
  load(): Promise<Omit<State, 'status' | 'error'>>;
  decide(items: Pending[], approve: boolean, reason?: string): Promise<void>;
  billUrl(path: string): Promise<string>;
};

let source: ApprovalsSource | null = null;
let state: State = {
  status: 'idle', error: '', pending: [], decided: [], people: new Map(), allowance: 0, now: new Date(),
};

let version = 0;
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  version++;
  listeners.forEach(l => l());
};

let inFlight: Promise<void> | null = null;

export const approvalsStore = {
  use(s: ApprovalsSource) {
    source = s;
    set({ status: 'idle' });
  },
  status: () => state.status,
  error: () => state.error,
  pending: () => state.pending,
  decided: () => state.decided,
  allowance: () => state.allowance,
  now: () => state.now,
  person: (id: string): Person =>
    state.people.get(id) ?? { id, name: 'Someone no longer on the roster', hq: '', territory: '', manager: '' },

  /** Reads everything waiting and decided. Calls in flight are shared. */
  load(): Promise<void> {
    if (!source) return Promise.resolve();
    if (inFlight) return inFlight;
    if (state.status === 'idle') set({ status: 'loading' });
    inFlight = source
      .load()
      .then(data => set({ ...data, status: 'ready', error: '' }))
      // A failed refresh keeps the last good queue on screen; only a first read fails the page.
      .catch(e => set({ status: state.status === 'ready' ? 'ready' : 'error', error: e instanceof Error ? e.message : String(e) }))
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  },

  /**
   * Decide some requests, one call per kind, so each person gets one message.
   * A rejection without a reason is refused here, as the database refuses it.
   * The queue is read again afterwards, so the screen shows what the database
   * holds rather than what we hoped it did.
   */
  async decide(ids: string[], approve: boolean, reason?: string): Promise<void> {
    const items = state.pending.filter(p => ids.includes(p.id));
    if (!items.length || !source) return;
    if (new Set(items.map(i => i.kind)).size > 1) throw new Error('Decide one kind at a time.');
    if (!approve && !reason?.trim()) throw new Error('A rejection needs a reason.');
    await source.decide(items, approve, reason?.trim());
    // Off the screen at once; the reload confirms it.
    set({ pending: state.pending.filter(p => !ids.includes(p.id)) });
    await approvalsStore.load();
  },

  billUrl: (path: string) => (source ? source.billUrl(path) : Promise.reject(new Error('No bills here.'))),

  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/**
 * Re-renders whenever the queue changes, loads it the first time it is needed,
 * and reads it again every minute while the tab is in front and on return to
 * it, so a request sent from the phone reaches the count without a refresh.
 */
let readAt = 0;
export const useApprovals = () => {
  useSyncExternalStore(approvalsStore.subscribe, () => version);
  useEffect(() => {
    if (state.status === 'idle') { readAt = Date.now(); void approvalsStore.load(); }
    const again = (olderThan: number) => {
      if (document.visibilityState !== 'visible' || Date.now() - readAt < olderThan) return;
      readAt = Date.now();
      void approvalsStore.load();
    };
    const t = window.setInterval(() => again(55_000), 60_000);
    const back = () => again(15_000);
    document.addEventListener('visibilitychange', back);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', back); };
  }, []);
  return approvalsStore;
};
