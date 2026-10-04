import { FakeDb, fakeClient, type Row, type Rpc, type View } from './engine';
import { DEMO_ORG, DEMO_USER, dayKey, seed, shift, travelFor } from './seed';
import { clientRpcs } from './rpcs';

/**
 * The demo database: the seeded company, the views the console reads, and the
 * functions it calls, each doing in memory what its namesake does in the live
 * database (supabase/migrations in Mr_Sales_Web). Writes change the demo for
 * this visit only; a reload starts the company afresh.
 */

const ME = 'Pardhu Karnati';
const now = () => new Date().toISOString();

const views: Record<string, View> = {
  current_reporting: db => db.rows('employees').filter(e => e.manager_id).map(e => ({
    org_id: e.org_id, employee_id: e.id, manager_id: e.manager_id, since: e.joined_at,
  })),

  /** One row per active person per day for the last 70 days, as the live view derives it. */
  attendance_days: db => {
    const out: Row[] = [];
    const settings = db.rows('org_settings')[0];
    const weekOff = Number(settings?.week_off_weekday ?? 0);
    const holiday = new Map(db.rows('holidays').map(h => [h.holiday_date as string, h.name as string]));
    const plans = new Map(db.rows('day_plans').map(p => [`${p.employee_id}|${p.work_date}`, p]));
    const leave = db.rows('leave_requests').filter(l => l.status === 'approved');
    const visits = new Map<string, Row[]>();
    for (const a of db.rows('activities')) {
      if (a.status !== 'completed' || !a.actual_start) continue;
      const k = `${a.employee_id}|${dayKey(new Date(a.actual_start as string))}`;
      (visits.get(k) ?? visits.set(k, []).get(k)!).push(a);
    }
    const today = dayKey(new Date());
    for (const e of db.rows('employees').filter(x => x.status === 'active')) {
      for (let i = 0; i < 70; i++) {
        const k = shift(today, -i);
        if (k < (e.joined_at as string)) break;
        const [y, m, d] = k.split('-').map(Number);
        const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
        const p = plans.get(`${e.id}|${k}`);
        const v = visits.get(`${e.id}|${k}`) ?? [];
        const onLeave = leave.some(l => l.employee_id === e.id && (l.from_date as string) <= k && (l.to_date as string) >= k);
        const status = holiday.has(k) ? 'holiday' : wd === weekOff ? 'weekOff' : onLeave ? 'leave' : p ? 'present' : 'absent';
        const times = v.map(a => a.actual_start as string).sort();
        out.push({
          org_id: e.org_id, employee_id: e.id, work_date: k,
          work_type: holiday.has(k) ? 'holiday' : wd === weekOff ? 'weekOff' : onLeave ? 'leave' : p?.work_type ?? null,
          declared_at: p?.declared_at ?? null, attendance_status: status,
          check_in: times[0] ?? null, check_out: times[times.length - 1] ?? null, visits: v.length,
          holiday_name: holiday.get(k) ?? null,
        });
      }
    }
    return out;
  },
};

/** Decide a set of rows of one kind, and leave the same trail the live functions leave. */
const decide = (table: string, entity: string, ids: string[], approve: boolean, reason: unknown, db: FakeDb) => {
  if (!approve && !String(reason ?? '').trim()) throw new Error('A rejection needs a reason.');
  for (const r of db.rows(table).filter(x => ids.includes(x.id as string))) {
    if (r.status !== 'pending') throw new Error('This was already decided.');
    Object.assign(r, { status: approve ? 'approved' : 'rejected', decided_at: now(), decided_by: null });
    db.mutable('approval_events').push({
      id: crypto.randomUUID(), org_id: DEMO_ORG, entity, entity_id: r.id, action: approve ? 'approved' : 'rejected',
      actor_id: null, actor_name: ME, reason: reason ?? null, at: now(),
    });
  }
  return null;
};

const audit = (db: FakeDb, action: string, entity: string, label: string, before: unknown = null, after: unknown = null, reason: unknown = null) =>
  db.mutable('audit_log').push({
    id: crypto.randomUUID(), org_id: DEMO_ORG, actor_user: DEMO_USER, actor_name: ME, action, entity,
    entity_id: null, entity_label: label, before_value: before, after_value: after, reason, at: now(),
  });

const rpcs: Record<string, Rpc> = {
  my_org_access: (_a, db) => [{
    org_name: 'Cleocure Lifesciences', status: 'active', disabled_modules: [], plan_code: 'growth', seat_limit: 25,
    seats_used: db.rows('app_users').filter(u => u.role === 'field' && u.status === 'active').length,
  }],
  travel_exceptions: (a, db) => travelFor({ employees: db.rows('employees'), activities: db.rows('activities') }, String(a.p_since ?? '2000-01-01')),
  decide_expenses: (a, db) => decide('expenses', 'expense', a.p_ids as string[], Boolean(a.p_approve), a.p_reason, db),
  decide_expense: (a, db) => decide('expenses', 'expense', [a.p_id as string], Boolean(a.p_approve), a.p_reason, db),
  decide_orders: (a, db) => decide('orders', 'order', a.p_ids as string[], Boolean(a.p_approve), a.p_reason, db),
  decide_order: (a, db) => decide('orders', 'order', [a.p_id as string], Boolean(a.p_approve), a.p_reason, db),
  decide_tour: (a, db) => decide('tour_plan_months', 'tour', [a.p_id as string], Boolean(a.p_approve), a.p_reason, db),
  decide_leave: (a, db) => decide('leave_requests', 'leave', [a.p_leave_id as string], Boolean(a.p_approve), a.p_reason, db),
  dismiss_setup_step: (a, db) => {
    const s = db.rows('org_settings')[0];
    const list = new Set((s.setup_dismissed as string[]) ?? []);
    if (a.p_dismissed === false) list.delete(String(a.p_step));
    else list.add(String(a.p_step));
    s.setup_dismissed = [...list];
    return 'Saved.';
  },
};

Object.assign(rpcs, clientRpcs(audit));

/** More functions register here as screens are rebuilt (see each live/*.ts). */
export const registerRpc = (name: string, f: Rpc) => {
  rpcs[name] = f;
};
export const demoAudit = audit;
export const DEMO_ME = ME;

let instance: FakeDb | null = null;
export const demoDb = () => (instance ??= new FakeDb(seed(), views, rpcs));
export const demoClient = () => fakeClient(demoDb(), { id: DEMO_USER, email: 'demo@mrsales.in' });
