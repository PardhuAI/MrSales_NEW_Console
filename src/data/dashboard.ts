import { useEffect, useSyncExternalStore } from 'react';

/**
 * Everything the Dashboard shows, computed in one place from records.
 *
 * Management tracks, controls, guides and maintains the field force through
 * this screen (owner, 2026-10-04), so every figure here has one definition,
 * written down beside it, and the live loader computes it from the same rows
 * the phone writes. Nothing on the screen does arithmetic of its own.
 */

/** Today, as far as the field is concerned. */
export type DayState = 'working' | 'beforeStart' | 'weekOff' | 'holiday';

export type CallState = 'done' | 'planned' | 'missed' | 'started' | 'flagged';

export type CallMark = {
  /** Hours since midnight, India time; 10.5 is 10:30 am. */
  at: number;
  state: CallState;
  client: string;
  note?: string;
  /** The visit, so a mark can open it on the person's day. */
  id?: string;
  /** Its India day, "2026-10-05". */
  day?: string;
};

export type RibbonPerson = { id: string; name: string; hq: string; calls: CallMark[] };
export type RibbonGroup = { label: string; people: RibbonPerson[] };

export type Attention = {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  reason: string;
  action: string;
  to: string;
};

export type DayFigures = {
  /** Calls scheduled for the day: planned, done, missed and started. */
  planned: number;
  done: number;
  missed: number;
  /** Started on the phone and not finished. */
  started: number;
  /** Planned calls whose time has passed (today only). */
  dueByNow: number;
  /** Field people with at least one call done that day. */
  active: number;
  /** Active field people in the company (or in the manager's team). */
  team: number;
};

export type DashboardModel = {
  demo: boolean;
  orgName: string;
  now: Date;
  today: { date: Date; state: DayState; holidayName?: string } & DayFigures;
  /** The day the timeline shows: today, or the last working day when today has not started. */
  shown: { date: Date; isToday: boolean; startHour: number; endHour: number; groups: RibbonGroup[] } & DayFigures;
  attention: Attention[];
  month: {
    label: string;
    sales: number;
    target: number;
    /** The last finished month, for the first days of a month with nothing booked yet. */
    previous: { label: string; sales: number; target: number } | null;
    callsDone: number;
    /** Done calls whose location check passed, out of done calls that had a check. */
    verifiedShare: number | null;
    clientsVisited: number;
    clientsTotal: number;
    newClients: number;
    workingDaysLeft: number;
    year: { month: string; sales: number; target: number }[];
  };
  /** Calls done and missed on each of the last working days, oldest first. */
  trend: { date: string; label: string; done: number; missed: number }[];
  /** The same, for the range switch: the last 20 working days, this month, last month. */
  trends: {
    recent: { date: string; label: string; done: number; missed: number }[];
    thisMonth: { label: string; days: { date: string; label: string; done: number; missed: number }[] };
    lastMonth: { label: string; days: { date: string; label: string; done: number; missed: number }[] };
  };
  managers: {
    id: string;
    name: string;
    territory: string;
    team: number;
    doneWeek: number;
    plannedWeek: number;
    verifiedShare: number | null;
    sales: number;
    target: number;
  }[];
  /** The month the manager table's sales and the ranking read: the current one, or last month in its first week. */
  salesMonth: string;
  ranks: { basis: 'target' | 'calls'; month: string; top: Ranked[]; low: Ranked[] } | null;
};

export type Ranked = { id: string; name: string; hq: string; value: string };

export type DashboardSource = () => Promise<DashboardModel>;

// ── the store ──────────────────────────────────────────────────────────

type State = { status: 'idle' | 'loading' | 'ready' | 'error'; error: string; model: DashboardModel | null; at: Date | null };

let source: DashboardSource | null = null;
let state: State = { status: 'idle', error: '', model: null, at: null };
let version = 0;
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  version++;
  listeners.forEach(l => l());
};
let inFlight: Promise<void> | null = null;

export const dashboardStore = {
  use(s: DashboardSource) {
    source = s;
    state = { status: 'idle', error: '', model: null, at: null };
  },
  state: () => state,
  load(): Promise<void> {
    if (!source) return Promise.resolve();
    if (inFlight) return inFlight;
    if (!state.model) set({ status: 'loading' });
    inFlight = source()
      .then(model => set({ model, status: 'ready', error: '', at: new Date() }))
      .catch(e => set({ status: state.model ? 'ready' : 'error', error: e instanceof Error ? e.message : String(e) }))
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/**
 * The Dashboard's data: read on first view, every minute while it is in front,
 * and at once on return to the tab. Live news from the field reads it sooner.
 */
export function useDashboard() {
  useSyncExternalStore(dashboardStore.subscribe, () => version);
  useEffect(() => {
    if (state.status === 'idle' || (state.at && Date.now() - state.at.getTime() > 60_000)) void dashboardStore.load();
    const again = (olderThan: number) => {
      if (document.visibilityState === 'visible' && (!state.at || Date.now() - state.at.getTime() >= olderThan)) void dashboardStore.load();
    };
    const t = window.setInterval(() => again(55_000), 60_000);
    const back = () => again(15_000);
    document.addEventListener('visibilitychange', back);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', back); };
  }, []);
  return state;
}
