import { db, readAll } from './client';
import type { ApprovalsSource, Decision, Kind, Pending, Person } from '../data/approvals';
import { loadPeople } from './people';

/**
 * Approvals against the live database. Every read is scoped by row-level
 * security to what the signed-in person may see; every decision goes through
 * the same functions the phone uses, so the rep gets the same single message.
 *
 *   expense days → decide_expenses(p_ids, p_approve, p_reason)
 *   orders       → decide_orders(p_ids, p_approve, p_reason)
 *   tour months  → decide_tour(p_id, p_approve, p_reason)
 *   leave        → decide_leave(p_leave_id, p_approve, p_reason)
 */

const CATEGORY: Record<string, string> = {
  dailyAllowance: 'Daily allowance',
  travel: 'Travel',
  food: 'Food',
  lodging: 'Lodging',
  courier: 'Courier',
  phone: 'Phone',
  other: 'Other',
};
export const categoryLabel = (c: string) =>
  CATEGORY[c] ?? c.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, x => x.toUpperCase());

const LEAVE: Record<string, string> = {
  casual: 'Casual leave',
  sick: 'Sick leave',
  earned: 'Earned leave',
  privilege: 'Privilege leave',
  unpaid: 'Leave without pay',
};
const leaveLabel = (t: string) => LEAVE[t?.toLowerCase()] ?? `${t?.replace(/^./, x => x.toUpperCase()) ?? 'Leave'}`;

const monthName = (y: number, m: number) =>
  new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

/** Local midnight for a YYYY-MM-DD date, so a day never slips across time zones. */
const localDay = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toISOString();
};

/** Working days in a month: not the company's week off, not a holiday. */
function workingDays(y: number, m: number, weekOff: number, holidays: Set<string>) {
  let n = 0;
  const days = new Date(y, m, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const date = new Date(y, m - 1, d);
    const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (date.getDay() !== weekOff && !holidays.has(key)) n++;
  }
  return n;
}

type ExpenseRow = {
  id: string; employee_id: string; work_date: string; amount: number; categories: string[] | null;
  description: string | null; remarks: string | null; destination: string | null; travel_mode: string | null;
  receipt_paths: string[] | null; submitted_at: string | null; created_at: string;
};
type OrderRow = {
  id: string; employee_id: string; total: number; discount_percent: number | null; submitted_at: string | null; created_at: string;
  clients: { name: string } | null; stockists: { name: string } | null; order_items: { count: number }[];
};
type TourRow = {
  id: string; employee_id: string; plan_year: number; plan_month: number; submitted_at: string | null; created_at: string;
  tour_plan_days: { work_type: string | null; tour_type: string | null; client_names: string[] | null; client_ids: string[] | null }[];
};
type LeaveRow = {
  id: string; employee_id: string; type: string; from_date: string; to_date: string; days: number; reason: string | null; applied_at: string;
};
type EventRow = { id: string; entity: string; entity_id: string; action: string; actor_name: string | null; reason: string | null; at: string };

export const liveApprovals: ApprovalsSource = {
  async load() {
    const sb = db();
    const [people, settings, holidays, expenses, orders, tours, leave, events] = await Promise.all([
      loadPeople(),
      sb.from('org_settings').select('daily_allowance, week_off_weekday').maybeSingle(),
      sb.from('holidays').select('holiday_date'),
      readAll<ExpenseRow>((a, b) => sb.from('expenses')
        .select('id, employee_id, work_date, amount, categories, description, remarks, destination, travel_mode, receipt_paths, submitted_at, created_at')
        .eq('status', 'pending').order('work_date').range(a, b)),
      readAll<OrderRow>((a, b) => sb.from('orders')
        .select('id, employee_id, total, discount_percent, submitted_at, created_at, clients(name), stockists(name), order_items(count)')
        .eq('status', 'pending').order('created_at').range(a, b) as never),
      readAll<TourRow>((a, b) => sb.from('tour_plan_months')
        .select('id, employee_id, plan_year, plan_month, submitted_at, created_at, tour_plan_days(work_type, tour_type, client_names, client_ids)')
        .eq('status', 'pending').range(a, b) as never),
      readAll<LeaveRow>((a, b) => sb.from('leave_requests')
        .select('id, employee_id, type, from_date, to_date, days, reason, applied_at')
        .eq('status', 'pending').order('applied_at').range(a, b)),
      sb.from('approval_events')
        .select('id, entity, entity_id, action, actor_name, reason, at')
        .in('action', ['approved', 'rejected'])
        .order('at', { ascending: false })
        .limit(300),
    ]);
    for (const r of [settings, holidays, events]) if (r.error) throw new Error(r.error.message);

    const allowance = Number(settings.data?.daily_allowance ?? 0);
    // A role's own daily allowance, where HR rules set one; the company's otherwise.
    const allowanceOf = await roleAllowances(allowance);
    const weekOff = settings.data?.week_off_weekday ?? 0;
    const holidaySet = new Set((holidays.data ?? []).map(h => h.holiday_date as string));

    const pending: Pending[] = [
      ...expenses.map((e): Pending => {
        const cats = (e.categories ?? []).map(categoryLabel);
        const note = [e.remarks, e.description].find(t => t && t.trim() && !/^daily allowance$/i.test(t.trim()));
        const files = e.receipt_paths ?? [];
        return {
          kind: 'expense',
          id: e.id,
          personId: e.employee_id,
          submittedAt: e.submitted_at ?? e.created_at,
          date: localDay(e.work_date),
          amount: Number(e.amount),
          categories: cats.length ? cats : ['Expense'],
          station: e.destination || people.get(e.employee_id)?.hq || '',
          reason: note ?? undefined,
          bill: files.length ? `${files.length} ${files.length === 1 ? 'bill' : 'bills'} attached` : undefined,
          bills: files,
          allowance: allowanceOf(e.employee_id),
        };
      }),
      ...orders.map((o): Pending => ({
        kind: 'order',
        id: o.id,
        personId: o.employee_id,
        submittedAt: o.submitted_at ?? o.created_at,
        number: `Order ${o.id.slice(0, 8).toUpperCase()}`,
        client: o.clients?.name ?? 'Client',
        stockist: o.stockists?.name ?? 'no stockist named',
        lines: o.order_items?.[0]?.count ?? 0,
        value: Number(o.total),
        discount: Number(o.discount_percent ?? 0),
      })),
      ...tours.map((t): Pending => {
        const days = t.tour_plan_days ?? [];
        const worked = days.filter(d => !['leave', 'holiday'].includes((d.work_type ?? '').toLowerCase()));
        return {
          kind: 'tour',
          id: t.id,
          personId: t.employee_id,
          submittedAt: t.submitted_at ?? t.created_at,
          month: monthName(t.plan_year, t.plan_month),
          workingDays: workingDays(t.plan_year, t.plan_month, weekOff, holidaySet),
          plannedDays: worked.length,
          clients: worked.reduce((s, d) => s + Math.max(d.client_ids?.length ?? 0, d.client_names?.length ?? 0), 0),
          outstation: worked.filter(d => (d.tour_type ?? '').toLowerCase() === 'outstation').length,
        };
      }),
      ...leave.map((l): Pending => ({
        kind: 'leave',
        id: l.id,
        personId: l.employee_id,
        submittedAt: l.applied_at,
        leaveType: leaveLabel(l.type),
        from: localDay(l.from_date),
        to: localDay(l.to_date),
        days: l.days,
        reason: l.reason?.trim() || 'No reason given.',
      })),
    ];

    const decided = await decisionsFrom((events.data ?? []) as EventRow[], people);
    return { pending, decided, people, allowance, now: new Date() };
  },

  async decide(items, approve, reason) {
    const sb = db();
    const ids = items.map(i => i.id);
    const kind = items[0].kind;
    const p_reason = reason ?? null;
    const run = async (fn: string, args: Record<string, unknown>) => {
      const { error } = await sb.rpc(fn, args);
      if (error) throw new Error(error.message);
    };
    if (kind === 'expense') return run('decide_expenses', { p_ids: ids, p_approve: approve, p_reason });
    if (kind === 'order') return run('decide_orders', { p_ids: ids, p_approve: approve, p_reason });
    for (const id of ids) {
      if (kind === 'tour') await run('decide_tour', { p_id: id, p_approve: approve, p_reason });
      else await run('decide_leave', { p_leave_id: id, p_approve: approve, p_reason });
    }
  },

  async billUrl(path) {
    const { data, error } = await db().storage.from('receipts').createSignedUrl(path, 600);
    if (error) throw new Error(`The bill could not be opened: ${error.message}`);
    return data.signedUrl;
  },
};

const ENTITY: Record<string, Kind> = { expense: 'expense', order: 'order', tour: 'tour', leave: 'leave' };

/**
 * The decision log, as people think of it: a batch of expense days or orders
 * decided together by one person is one decision, not twenty rows.
 */
async function decisionsFrom(events: EventRow[], people: Map<string, Person>): Promise<Decision[]> {
  const sb = db();
  const idsOf = (k: string) => events.filter(e => e.entity === k).map(e => e.entity_id);
  const [exp, ord, tour, lv] = await Promise.all([
    idsOf('expense').length ? sb.from('expenses').select('id, employee_id, work_date, amount').in('id', idsOf('expense')) : { data: [], error: null },
    idsOf('order').length ? sb.from('orders').select('id, employee_id, total, clients(name)').in('id', idsOf('order')) : { data: [], error: null },
    idsOf('tour').length ? sb.from('tour_plan_months').select('id, employee_id, plan_year, plan_month').in('id', idsOf('tour')) : { data: [], error: null },
    idsOf('leave').length ? sb.from('leave_requests').select('id, employee_id, type, days, from_date').in('id', idsOf('leave')) : { data: [], error: null },
  ]);
  const rec = new Map<string, Record<string, unknown>>();
  for (const r of [exp, ord, tour, lv]) for (const row of (r.data ?? []) as Record<string, unknown>[]) rec.set(row.id as string, row);

  type Bucket = { kind: Kind; personId: string; approved: boolean; by: string; reason?: string; at: string; rows: Record<string, unknown>[] };
  const buckets = new Map<string, Bucket>();
  for (const e of events) {
    const kind = ENTITY[e.entity];
    const row = rec.get(e.entity_id);
    if (!kind || !row) continue;
    const minute = e.at.slice(0, 16);
    const key = kind === 'expense' || kind === 'order'
      ? `${kind}|${row.employee_id}|${e.action}|${e.actor_name}|${minute}`
      : `${kind}|${e.id}`;
    const b = buckets.get(key) ?? {
      kind, personId: row.employee_id as string, approved: e.action === 'approved',
      by: e.actor_name ?? 'Someone', reason: e.reason ?? undefined, at: e.at, rows: [],
    };
    b.rows.push(row);
    buckets.set(key, b);
  }

  const fmtDay = (d: string) => new Date(localDay(d)).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
  return [...buckets.entries()].map(([key, b]): Decision => {
    let summary = '';
    let value: number | undefined;
    if (b.kind === 'expense') {
      value = b.rows.reduce((s, r) => s + Number(r.amount), 0);
      summary = b.rows.length === 1 ? `${fmtDay(b.rows[0].work_date as string)} · expense day` : `${b.rows.length} expense days`;
    } else if (b.kind === 'order') {
      value = b.rows.reduce((s, r) => s + Number(r.total), 0);
      const c = (b.rows[0].clients as { name?: string } | null)?.name;
      summary = b.rows.length === 1 ? `Order for ${c ?? 'a client'}` : `${b.rows.length} orders`;
    } else if (b.kind === 'tour') {
      summary = monthName(b.rows[0].plan_year as number, b.rows[0].plan_month as number);
    } else {
      const r = b.rows[0];
      summary = `${leaveLabel(r.type as string)}, ${r.days} ${r.days === 1 ? 'day' : 'days'} · ${fmtDay(r.from_date as string)}`;
    }
    void people;
    return { id: key, kind: b.kind, personId: b.personId, summary, value, approved: b.approved, reason: b.reason, by: b.by, at: b.at };
  }).sort((a, b) => b.at.localeCompare(a.at));
}

/**
 * Each person's daily allowance: their role's expense rule (HR rules), else
 * the company's. The same order the database uses (expense_rule_for), so what
 * an approver sees as "over" is what the phone told the rep.
 */
async function roleAllowances(company: number): Promise<(personId: string) => number> {
  const sb = db();
  const [people, rules] = await Promise.all([
    sb.from('employees').select('id, designation_id'),
    sb.from('expense_rules').select('designation_id, daily_allowance').not('designation_id', 'is', null),
  ]);
  // A project without the HR policy tables (0104) has only the company figure.
  if (people.error || rules.error) return () => company;
  const byRole = new Map((rules.data ?? []).map(r => [r.designation_id as string, Number(r.daily_allowance)]));
  const roleOf = new Map((people.data ?? []).map(p => [p.id as string, p.designation_id as string | null]));
  return id => {
    const role = roleOf.get(id);
    const own = role ? byRole.get(role) : undefined;
    return own ?? company;
  };
}
