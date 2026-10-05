import { db, readAll } from './client';
import { loadEmployees, type Employee } from './people';
import { loadGeo } from './geo';
import { IST_TODAY, dayMonth, dayOf, shiftDay, startOfDay, weekdayOf } from '../lib/days';

/**
 * The Team section: the roster, a person's record, joining, managers, the
 * reporting line, attendance, leave and tasks. Writes go through the same
 * functions as the old console (create_employee, update_employee,
 * reassign_manager, hand_over_clients, set_employee_status, the document
 * functions, decide_leave, assign_task), and each keeps its own rules.
 */

const must = <T,>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`Could not read ${what}: ${r.error.message}`);
  return r.data as T;
};
const call = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(error.message.replace(/^./, x => x.toUpperCase()));
  return data;
};

// ── the roster ────────────────────────────────────────────────────────

export type Person = Employee & {
  mobile: string | null; email: string | null; department: string; designationId: string | null; bloodGroup: string | null;
  login: 'phone' | 'office' | 'suspended' | 'none';
  reports: number;
  clients: number;
  /** A move already decided and dated ahead (a transfer, or a cover with its end). */
  next: { managerId: string | null; manager: string; from: string; until: string | null } | null;
  /** The day a cover in force ends, and the person goes back to their own manager. */
  coverUntil: string | null;
};

export type RosterModel = {
  people: Person[];
  roles: { id: string; name: string; short: string; appView: 'field' | 'manager'; active: boolean }[];
  territories: { id: string; name: string; hq: string }[];
};

export async function loadRoster(): Promise<RosterModel> {
  const sb = db();
  const [employees, extra, users, roles, geo, owners, lines] = await Promise.all([
    loadEmployees(),
    readAll<{ id: string; mobile: string | null; email: string | null; department: string; designation_id: string | null; blood_group: string | null }>((a, b) =>
      sb.from('employees').select('id, mobile, email, department, designation_id, blood_group').range(a, b)),
    sb.from('app_users').select('employee_id, role, status'),
    sb.from('designations').select('id, name, short_name, app_view, is_active, rank').order('rank').order('name'),
    loadGeo(),
    readAll<{ owner_employee_id: string | null }>((a, b) => sb.from('clients').select('owner_employee_id').range(a, b)),
    readAll<{ employee_id: string; manager_id: string | null; period: string }>((a, b) =>
      sb.from('manager_assignments').select('employee_id, manager_id, period').range(a, b)),
  ]);
  const u = (must(users, 'logins') ?? []) as { employee_id: string | null; role: string; status: string }[];
  const more = new Map(extra.map(e => [e.id, e]));
  const list = [...employees.values()];
  const clientCount = new Map<string, number>();
  for (const c of owners) if (c.owner_employee_id) clientCount.set(c.owner_employee_id, (clientCount.get(c.owner_employee_id) ?? 0) + 1);
  // The dated line: "[2026-10-05,2026-10-20)". What is ahead of today, and a cover in force.
  const today = IST_TODAY();
  const span = (period: string) => {
    const m = /^\[([^,]*),([^)\]]*)[)\]]$/.exec(period);
    return { from: m?.[1] ?? '', until: m?.[2] || null };
  };
  const ahead = new Map<string, { managerId: string | null; from: string; until: string | null }>();
  const coverUntil = new Map<string, string>();
  for (const l of lines) {
    const { from, until } = span(l.period);
    if (from > today) {
      const known = ahead.get(l.employee_id);
      if (!known || from < known.from) ahead.set(l.employee_id, { managerId: l.manager_id, from, until });
    } else if (until && until > today && lines.some(o => o.employee_id === l.employee_id && span(o.period).from === until)) {
      coverUntil.set(l.employee_id, until);
    }
  }
  const nameOf = (id: string | null) => (id && employees.get(id)?.name) || 'nobody';
  return {
    people: list.map(e => {
      const x = more.get(e.id);
      const logins = u.filter(l => l.employee_id === e.id);
      return {
        ...e,
        mobile: x?.mobile ?? null, email: x?.email ?? null, department: x?.department ?? '', designationId: x?.designation_id ?? null, bloodGroup: x?.blood_group ?? null,
        login: logins.some(l => l.status === 'active' && l.role === 'field') ? 'phone' : logins.some(l => l.status === 'active') ? 'office' : logins.length ? 'suspended' : 'none',
        reports: list.filter(r => r.managerId === e.id && r.status === 'active').length,
        clients: clientCount.get(e.id) ?? 0,
        next: ahead.has(e.id) ? { ...ahead.get(e.id)!, manager: nameOf(ahead.get(e.id)!.managerId) } : null,
        coverUntil: coverUntil.get(e.id) ?? null,
      } as Person;
    }),
    roles: ((must(roles, 'roles') ?? []) as { id: string; name: string; short_name: string; app_view: string; is_active: boolean }[])
      .map(r => ({ id: r.id, name: r.name, short: r.short_name, appView: r.app_view === 'manager' ? 'manager' : 'field', active: r.is_active })),
    territories: geo.territories.map(t => ({ id: t.id, name: t.name, hq: t.hq })),
  };
}

/** A move already decided, in words: "Moves to Rajesh Verma on 1 November". */
export function nextMove(p: Pick<Person, 'next' | 'coverUntil'>): string {
  if (p.next) {
    if (p.next.until) return `Covered by ${p.next.manager} from ${dayMonth(p.next.from)} to ${dayMonth(p.next.until)}`;
    return p.next.managerId ? `Moves to ${p.next.manager} on ${dayMonth(p.next.from)}` : `Reports to nobody from ${dayMonth(p.next.from)}`;
  }
  return p.coverUntil ? `On cover until ${dayMonth(p.coverUntil)}, then back to their own manager` : '';
}

// ── joining and correcting ────────────────────────────────────────────

export type PersonInput = {
  code: string; name: string; designationId: string; department: string; territoryId: string; hq: string;
  joinedAt: string; managerId: string | null; mobile: string; email: string;
};

/** The roster row only (invite_field_employee); the phone login is a separate, deliberate act. */
export const createPerson = async (p: PersonInput) => (await call('invite_field_employee', {
  p_code: p.code, p_name: p.name, p_designation_id: p.designationId, p_department: p.department, p_territory_id: p.territoryId,
  p_hq: p.hq, p_joined_at: p.joinedAt, p_manager_id: p.managerId, p_mobile: p.mobile || null, p_email: p.email,
})) as string;

export const updatePerson = async (id: string, p: Omit<PersonInput, 'code' | 'joinedAt' | 'managerId'>) => {
  await call('update_employee', {
    p_id: id, p_name: p.name, p_designation_id: p.designationId, p_department: p.department, p_territory_id: p.territoryId,
    p_hq: p.hq, p_mobile: p.mobile || null, p_email: p.email || null,
  });
};

export const changeManager = async (employeeId: string, managerId: string | null, from: string, until: string | null, reason: string) => {
  await call('reassign_manager', { p_employee_id: employeeId, p_new_manager_id: managerId, p_effective_from: from, p_until: until, p_reason: reason });
};
export const handOverClients = async (from: string, to: string, reason: string) => (await call('hand_over_clients', { p_from: from, p_to: to, p_reason: reason })) as string;
export const setPersonStatus = async (id: string, status: 'active' | 'inactive', reason: string) => (await call('set_employee_status', { p_id: id, p_status: status, p_reason: reason })) as string;

// ── one person's record ───────────────────────────────────────────────

export type PersonRecord = {
  months: string[];
  month: Record<string, {
    target: number; sold: number; primary: number; orders: number;
    planned: number; done: number; missed: number; unplanned: number; verified: number; checked: number; fake: number;
    workingDays: number; fieldDays: number; leaveDays: number;
    clientsSeen: number; byType: Record<string, number>;
    orderCount: number; orderValue: number; noStockist: number;
    claimed: number; claimStatus: string | null;
  }>;
  recent: { id: string; at: string; client: string; status: string; verdict: string | null; mocked: boolean }[];
  days: { date: string; planned: number; done: number; missed: number; plan: boolean }[];
  clients: { id: string; name: string; type: string; lastVisit: string | null; visits: number }[];
  orders: { id: string; number: string; at: string; client: string; total: number; status: string }[];
  leave: { id: string; type: string; from: string; to: string; days: number; status: string; reason: string }[];
  expenses: { month: string; days: number; amount: number; status: string }[];
  documents: { id: string; title: string; category: string; at: string; expires: string | null; path: string }[];
  payslips: { year: number; month: number; net: number; at: string }[];
  audit: { id: string; who: string; action: string; at: string; before: string | null; after: string | null; reason: string | null }[];
};

export async function loadPersonRecord(id: string): Promise<PersonRecord> {
  const sb = db();
  const today = IST_TODAY();
  const [y, m] = today.split('-').map(Number);
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(y, m - 1 - (11 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const from = `${months[0]}-01`;
  const [acts, plans, sales, targets, orders, leave, expenses, docs, pay, audit, clients, settings, holidays] = await Promise.all([
    readAll<{ id: string; status: string; is_unplanned: boolean | null; geo_verdict: string | null; geo_mocked: boolean | null; actual_start: string | null; scheduled_start: string; client_id: string; clients: { name: string; type: string } | null }>((a, b) =>
      sb.from('activities').select('id, status, is_unplanned, geo_verdict, geo_mocked, actual_start, scheduled_start, client_id, clients(name, type)').eq('employee_id', id)
        .gte('scheduled_start', startOfDay(shiftDay(today, -100))).order('scheduled_start', { ascending: false }).range(a, b) as never),
    sb.from('day_plans').select('work_date').eq('employee_id', id).gte('work_date', shiftDay(today, -100)),
    readAll<{ sale_date: string; amount: number; source: string }>((a, b) => sb.from('sales_records').select('sale_date, amount, source').eq('employee_id', id).gte('sale_date', from).range(a, b)),
    sb.from('targets').select('period_year, period_month, amount').eq('employee_id', id).gte('period_year', Number(months[0].slice(0, 4))),
    sb.from('orders').select('id, created_at, total, status, stockist_id, clients(name)').eq('employee_id', id).order('created_at', { ascending: false }),
    sb.from('leave_requests').select('id, type, from_date, to_date, days, status, reason').eq('employee_id', id).order('from_date', { ascending: false }),
    readAll<{ work_date: string; amount: number; status: string }>((a, b) => sb.from('expenses').select('work_date, amount, status').eq('employee_id', id).gte('work_date', from).range(a, b)),
    sb.from('documents').select('id, title, category, released_at, expires_at, storage_path').eq('employee_id', id).order('released_at', { ascending: false }),
    sb.from('payslips').select('period_year, period_month, net_pay, released_at').eq('employee_id', id).order('period_year', { ascending: false }).order('period_month', { ascending: false }),
    sb.from('audit_log').select('id, actor_name, action, at, before_value, after_value, reason').eq('entity_id', id).order('at', { ascending: false }).limit(50),
    sb.from('clients').select('id, name, type, last_visit_at, total_visits').eq('owner_employee_id', id).order('name'),
    sb.from('org_settings').select('week_off_weekday').maybeSingle(),
    sb.from('holidays').select('holiday_date'),
  ]);
  const weekOff = Number(must(settings, 'company rules')?.week_off_weekday ?? 0);
  const hol = new Set(((must(holidays, 'holidays') ?? []) as { holiday_date: string }[]).map(h => h.holiday_date));
  const lv = (must(leave, 'leave') ?? []) as { id: string; type: string; from_date: string; to_date: string; days: number; status: string; reason: string }[];
  const ord = (must(orders, 'orders') ?? []) as unknown as { id: string; created_at: string; total: number; status: string; stockist_id: string | null; clients: { name: string } | null }[];
  const planDays = new Set(((must(plans, 'day plans') ?? []) as { work_date: string }[]).map(p => p.work_date));

  const month: PersonRecord['month'] = {};
  for (const k of months) {
    const daysIn = new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0).getDate();
    let working = 0;
    let leaveDays = 0;
    for (let d = 1; d <= daysIn; d++) {
      const key = `${k}-${String(d).padStart(2, '0')}`;
      if (key > today) break;
      const work = weekdayOf(key) !== weekOff && !hol.has(key);
      if (work) working++;
      if (work && lv.some(l => l.status === 'approved' && l.from_date <= key && l.to_date >= key)) leaveDays++;
    }
    const mine = acts.filter(a => dayOf(a.actual_start ?? a.scheduled_start).startsWith(k));
    const done = mine.filter(a => a.status === 'completed');
    const byType: Record<string, number> = {};
    for (const a of done) byType[a.clients?.type ?? 'other'] = (byType[a.clients?.type ?? 'other'] ?? 0) + 1;
    const ex = expenses.filter(e => e.work_date.startsWith(k) && e.status !== 'draft');
    const sl = sales.filter(s => s.sale_date.startsWith(k));
    const mo = ord.filter(o => o.created_at.slice(0, 7) === k && o.status !== 'draft');
    month[k] = {
      target: ((must(targets, 'targets') ?? []) as { period_year: number; period_month: number; amount: number }[]).filter(t => `${t.period_year}-${String(t.period_month).padStart(2, '0')}` === k).reduce((s, t) => s + Number(t.amount), 0),
      primary: sl.filter(s => s.source !== 'order').reduce((s, x) => s + Number(x.amount), 0),
      orders: sl.filter(s => s.source === 'order').reduce((s, x) => s + Number(x.amount), 0),
      sold: sl.reduce((s, x) => s + Number(x.amount), 0),
      planned: mine.length, done: done.length, missed: mine.filter(a => a.status === 'missed').length, unplanned: mine.filter(a => a.is_unplanned).length,
      verified: done.filter(a => a.geo_verdict === 'verified').length, checked: done.filter(a => a.geo_verdict === 'verified' || a.geo_verdict === 'outOfRange').length,
      fake: done.filter(a => a.geo_mocked || a.geo_verdict === 'suspect').length,
      workingDays: working, fieldDays: new Set(done.map(a => dayOf(a.actual_start ?? a.scheduled_start))).size, leaveDays,
      clientsSeen: new Set(done.map(a => a.client_id)).size, byType,
      orderCount: mo.length, orderValue: mo.filter(o => o.status !== 'rejected').reduce((s, o) => s + Number(o.total), 0), noStockist: mo.filter(o => !o.stockist_id && o.status !== 'rejected').length,
      claimed: ex.reduce((s, e) => s + Number(e.amount), 0),
      claimStatus: ex.length ? (ex.some(e => e.status === 'pending') ? 'waiting' : ex.every(e => e.status === 'approved') ? 'approved' : 'partly approved') : null,
    };
  }
  const dayMap = new Map<string, { planned: number; done: number; missed: number }>();
  for (const a of acts) {
    const k = dayOf(a.actual_start ?? a.scheduled_start);
    const d = dayMap.get(k) ?? { planned: 0, done: 0, missed: 0 };
    d.planned++;
    if (a.status === 'completed') d.done++;
    if (a.status === 'missed') d.missed++;
    dayMap.set(k, d);
  }
  const expByMonth = new Map<string, { days: number; amount: number; statuses: Set<string> }>();
  for (const e of expenses) {
    const k = e.work_date.slice(0, 7);
    const x = expByMonth.get(k) ?? { days: 0, amount: 0, statuses: new Set<string>() };
    x.days++;
    x.amount += Number(e.amount);
    x.statuses.add(e.status);
    expByMonth.set(k, x);
  }
  return {
    months,
    month,
    recent: acts.slice(0, 10).map(a => ({ id: a.id, at: a.actual_start ?? a.scheduled_start, client: a.clients?.name ?? 'A client', status: a.status, verdict: a.geo_verdict, mocked: Boolean(a.geo_mocked) || a.geo_verdict === 'suspect' })),
    days: [...new Set([...dayMap.keys(), ...planDays])].filter(k => k <= today && k >= shiftDay(today, -30)).sort().reverse()
      .map(k => ({ date: k, plan: planDays.has(k), ...(dayMap.get(k) ?? { planned: 0, done: 0, missed: 0 }) })),
    clients: ((must(clients, 'clients') ?? []) as { id: string; name: string; type: string; last_visit_at: string | null; total_visits: number }[]).map(c => ({ id: c.id, name: c.name, type: c.type, lastVisit: c.last_visit_at, visits: c.total_visits })),
    orders: ord.filter(o => o.status !== 'draft').map(o => ({ id: o.id, number: o.id.slice(0, 8).toUpperCase(), at: o.created_at, client: o.clients?.name ?? 'A client', total: Number(o.total), status: o.status })),
    leave: lv.map(l => ({ id: l.id, type: l.type, from: l.from_date, to: l.to_date, days: l.days, status: l.status, reason: l.reason })),
    expenses: [...expByMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([k, x]) => ({ month: k, days: x.days, amount: x.amount, status: x.statuses.has('pending') ? 'waiting' : x.statuses.has('draft') && x.statuses.size === 1 ? 'draft, not sent' : x.statuses.has('rejected') ? 'partly rejected' : 'approved' })),
    documents: ((must(docs, 'documents') ?? []) as { id: string; title: string; category: string; released_at: string; expires_at: string | null; storage_path: string }[]).map(d => ({ id: d.id, title: d.title, category: d.category, at: d.released_at, expires: d.expires_at, path: d.storage_path })),
    payslips: ((must(pay, 'payslips') ?? []) as { period_year: number; period_month: number; net_pay: number; released_at: string }[]).map(p => ({ year: p.period_year, month: p.period_month, net: Number(p.net_pay), at: p.released_at })),
    audit: ((must(audit, 'the audit log') ?? []) as { id: string; actor_name: string; action: string; at: string; before_value: string | null; after_value: string | null; reason: string | null }[]).map(a => ({ id: a.id, who: a.actor_name, action: a.action, at: a.at, before: a.before_value, after: a.after_value, reason: a.reason })),
  };
}

// ── documents ─────────────────────────────────────────────────────────

export const DOCUMENT_CATEGORIES = ['ID proof', 'Offer letter', 'Appointment letter', 'Address proof', 'Education', 'Bank details', 'Licence', 'Other'] as const;
const DOC_MIME: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
export const DOCUMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const DOCUMENT_MAX = 20 * 1024 * 1024;

export function documentProblem(f: File): string | null {
  const ext = f.name.toLowerCase().split('.').pop();
  const ok = DOC_MIME[f.type] || ['pdf', 'jpg', 'jpeg', 'png'].includes(ext ?? '');
  if (!ok) return 'Upload a PDF, JPG or PNG file.';
  if (f.size > DOCUMENT_MAX) return `That file is ${(f.size / 1024 / 1024).toFixed(1)} MB; the limit is 20 MB.`;
  if (!f.size) return 'That file is empty.';
  return null;
}

/** File first, then the record; if the record is refused, the file is removed again. */
export async function uploadDocument(orgId: string, employeeId: string, file: File, title: string, category: string, expires: string | null) {
  const problem = documentProblem(file);
  if (problem) throw new Error(problem);
  const ext = file.name.toLowerCase().split('.').pop() === 'jpeg' ? 'jpg' : file.name.toLowerCase().split('.').pop();
  const path = `${orgId}/employee/${employeeId}/${crypto.randomUUID()}.${ext}`;
  const sb = db();
  const { error } = await sb.storage.from('documents').upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw new Error(`The upload did not finish: ${error.message}`);
  try {
    return (await call('add_employee_document', { p_employee_id: employeeId, p_title: title, p_category: category, p_storage_path: path, p_expires_at: expires })) as string;
  } catch (e) {
    await sb.storage.from('documents').remove([path]);
    throw e;
  }
}

export async function removeDocument(id: string) {
  const path = (await call('remove_employee_document', { p_id: id })) as string;
  if (path) await db().storage.from('documents').remove([path]);
}

export async function documentUrl(path: string) {
  const { data, error } = await db().storage.from('documents').createSignedUrl(path, 600);
  if (error) throw new Error(`The document could not be opened: ${error.message}`);
  return data.signedUrl;
}

// ── managers ──────────────────────────────────────────────────────────

export type ManagerRow = {
  id: string; name: string; code: string; hq: string; territory: string; managerId: string | null; manager: string;
  team: { id: string; name: string; hq: string; doneWeek: number; plannedWeek: number; done30: number; missed30: number; sales: number; target: number; lastSeen: string | null; clients: number }[];
  doneWeek: number; plannedWeek: number; verified: number; checked: number; sales: number; target: number; leaveDays: number; claimed: number; clientsAdded: number;
  year: { month: string; sales: number; target: number }[];
};

export async function loadManagers(): Promise<{ managers: ManagerRow[]; unmanaged: { id: string; name: string; hq: string }[]; monthKey: string }> {
  const sb = db();
  const today = IST_TODAY();
  const mk = today.slice(0, 7);
  const weekStart = shiftDay(today, -((weekdayOf(today) + 6) % 7));
  const [y, m] = today.split('-').map(Number);
  const yearStart = (() => { const d = new Date(y, m - 12, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
  const [employees, acts, sales, targets, leave, expenses, clients] = await Promise.all([
    loadEmployees(),
    readAll<{ employee_id: string; status: string; geo_verdict: string | null; scheduled_start: string; actual_start: string | null }>((a, b) =>
      sb.from('activities').select('employee_id, status, geo_verdict, scheduled_start, actual_start').gte('scheduled_start', startOfDay(shiftDay(today, -30))).lt('scheduled_start', startOfDay(shiftDay(today, 1))).range(a, b)),
    readAll<{ employee_id: string | null; sale_date: string; amount: number }>((a, b) => sb.from('sales_records').select('employee_id, sale_date, amount').gte('sale_date', `${yearStart}-01`).range(a, b)),
    readAll<{ employee_id: string; period_year: number; period_month: number; amount: number }>((a, b) => sb.from('targets').select('employee_id, period_year, period_month, amount').gte('period_year', Number(yearStart.slice(0, 4))).range(a, b)),
    sb.from('leave_requests').select('employee_id, days, from_date').eq('status', 'approved').gte('from_date', `${mk}-01`),
    readAll<{ employee_id: string; amount: number; status: string }>((a, b) => sb.from('expenses').select('employee_id, amount, status').gte('work_date', `${mk}-01`).neq('status', 'draft').range(a, b)),
    readAll<{ owner_employee_id: string | null; created_at: string }>((a, b) => sb.from('clients').select('owner_employee_id, created_at').range(a, b)),
  ]);
  const lv = (must(leave, 'leave') ?? []) as { employee_id: string; days: number }[];
  const all = [...employees.values()];
  const active = all.filter(e => e.status === 'active');
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(y, m - 1 - (11 - i), 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const sold = (ids: Set<string>, k: string) => sales.filter(s => s.employee_id && ids.has(s.employee_id) && s.sale_date.startsWith(k)).reduce((t, s) => t + Number(s.amount), 0);
  const tgt = (ids: Set<string>, k: string) => targets.filter(t => ids.has(t.employee_id) && `${t.period_year}-${String(t.period_month).padStart(2, '0')}` === k).reduce((t, s) => t + Number(s.amount), 0);
  const managerIds = new Set(active.filter(e => e.managerId).map(e => e.managerId!));
  const managers = active.filter(e => managerIds.has(e.id) || e.role === 'ASM').map((mgr): ManagerRow => {
    const team = active.filter(e => e.managerId === mgr.id);
    const ids = new Set(team.map(e => e.id));
    const tActs = acts.filter(a => ids.has(a.employee_id));
    const week = tActs.filter(a => dayOf(a.actual_start ?? a.scheduled_start) >= weekStart);
    const done30 = tActs.filter(a => a.status === 'completed');
    return {
      id: mgr.id, name: mgr.name, code: mgr.code, hq: mgr.hq, territory: mgr.territory, managerId: mgr.managerId, manager: mgr.managerId ? mgr.manager : '',
      team: team.map(e => {
        const one = new Set([e.id]);
        const mine = tActs.filter(a => a.employee_id === e.id);
        const wk = mine.filter(a => dayOf(a.actual_start ?? a.scheduled_start) >= weekStart);
        return {
          id: e.id, name: e.name, hq: e.hq, doneWeek: wk.filter(a => a.status === 'completed').length, plannedWeek: wk.filter(a => a.status !== 'planned' || dayOf(a.scheduled_start) < today).length,
          done30: mine.filter(a => a.status === 'completed').length, missed30: mine.filter(a => a.status === 'missed').length,
          sales: sold(one, mk), target: tgt(one, mk), lastSeen: e.lastSeenAt, clients: clients.filter(c => c.owner_employee_id === e.id).length,
        };
      }).sort((a, b) => a.name.localeCompare(b.name)),
      doneWeek: week.filter(a => a.status === 'completed').length,
      plannedWeek: week.filter(a => a.status !== 'planned' || dayOf(a.scheduled_start) < today).length,
      verified: done30.filter(a => a.geo_verdict === 'verified').length,
      checked: done30.filter(a => a.geo_verdict === 'verified' || a.geo_verdict === 'outOfRange').length,
      sales: sold(ids, mk), target: tgt(ids, mk),
      leaveDays: lv.filter(l => ids.has(l.employee_id)).reduce((s, l) => s + l.days, 0),
      claimed: expenses.filter(e => ids.has(e.employee_id)).reduce((s, e) => s + Number(e.amount), 0),
      clientsAdded: clients.filter(c => c.owner_employee_id && ids.has(c.owner_employee_id) && c.created_at.slice(0, 7) === mk).length,
      year: months.map(k => ({ month: k, sales: sold(ids, k), target: tgt(ids, k) })),
    };
  }).filter(x => x.team.length || all.some(e => e.id === x.id && e.role === 'ASM')).sort((a, b) => a.name.localeCompare(b.name));
  return {
    managers,
    unmanaged: active.filter(e => e.role === 'MR' && !e.managerId).map(e => ({ id: e.id, name: e.name, hq: e.hq })),
    monthKey: mk,
  };
}

// ── attendance ────────────────────────────────────────────────────────

export type AttendanceModel = {
  month: string;
  days: string[];
  people: { id: string; name: string; hq: string; managerId: string | null; cells: Record<string, { status: string; workType: string | null; visits: number; declaredAt: string | null; holiday: string | null }> }[];
  managers: { id: string; name: string }[];
};

export async function loadAttendance(month: string): Promise<AttendanceModel> {
  const sb = db();
  const today = IST_TODAY();
  const daysIn = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const days = Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const [employees, rows] = await Promise.all([
    loadEmployees(),
    readAll<{ employee_id: string; work_date: string; attendance_status: string; work_type: string | null; visits: number; declared_at: string | null; holiday_name: string | null }>((a, b) =>
      sb.from('attendance_days').select('employee_id, work_date, attendance_status, work_type, visits, declared_at, holiday_name').gte('work_date', days[0]).lte('work_date', days[days.length - 1]).range(a, b)),
  ]);
  const people = [...employees.values()].filter(e => e.status === 'active' && e.role).sort((a, b) => a.name.localeCompare(b.name));
  const managerIds = new Set(people.map(p => p.managerId).filter(Boolean) as string[]);
  return {
    month, days: days.filter(d => d <= today),
    people: people.map(e => ({
      id: e.id, name: e.name, hq: e.hq, managerId: e.managerId,
      cells: Object.fromEntries(rows.filter(r => r.employee_id === e.id).map(r => [r.work_date, { status: r.attendance_status, workType: r.work_type, visits: r.visits, declaredAt: r.declared_at, holiday: r.holiday_name }])),
    })),
    managers: [...managerIds].map(id => ({ id, name: employees.get(id)?.name ?? 'Someone' })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ── leave ─────────────────────────────────────────────────────────────

export const LEAVE_LABEL: Record<string, string> = { casual: 'Casual leave', sick: 'Sick leave', earned: 'Earned leave', privilege: 'Privilege leave', unpaid: 'Leave without pay', compensatory: 'Compensatory leave' };
export const leaveLabel = (t: string) => LEAVE_LABEL[t?.toLowerCase()] ?? `${t?.replace(/^./, x => x.toUpperCase()) ?? 'Leave'}`;

export type LeaveRow = { id: string; personId: string; person: string; type: string; from: string; to: string; days: number; reason: string; status: string; appliedAt: string; decidedAt: string | null; decidedBy: string; decisionReason: string | null };

export async function loadLeave(): Promise<LeaveRow[]> {
  const sb = db();
  const [employees, rows, events] = await Promise.all([
    loadEmployees(),
    readAll<{ id: string; employee_id: string; type: string; from_date: string; to_date: string; days: number; reason: string | null; status: string; applied_at: string; decided_at: string | null }>((a, b) =>
      sb.from('leave_requests').select('id, employee_id, type, from_date, to_date, days, reason, status, applied_at, decided_at').order('from_date', { ascending: false }).range(a, b)),
    readAll<{ entity_id: string; action: string; actor_name: string; reason: string | null }>((a, b) => sb.from('approval_events').select('entity_id, action, actor_name, reason').eq('entity', 'leave').in('action', ['approved', 'rejected']).range(a, b)),
  ]);
  return rows.map(l => {
    const ev = events.filter(e => e.entity_id === l.id).pop();
    return {
      id: l.id, personId: l.employee_id, person: employees.get(l.employee_id)?.name ?? 'Someone no longer here', type: l.type, from: l.from_date, to: l.to_date, days: l.days,
      reason: l.reason?.trim() || 'No reason given.', status: l.status, appliedAt: l.applied_at, decidedAt: l.decided_at, decidedBy: ev?.actor_name ?? '', decisionReason: ev?.reason ?? null,
    };
  });
}

export const decideLeave = async (id: string, approve: boolean, reason: string) => { await call('decide_leave', { p_leave_id: id, p_approve: approve, p_reason: reason || null }); };

// ── tasks ─────────────────────────────────────────────────────────────

export type TaskRow = { id: string; title: string; description: string | null; personId: string; person: string; by: string; clientId: string | null; client: string | null; due: string | null; status: string; createdAt: string; completedAt: string | null };
export type TaskClient = { id: string; name: string; place: string; ownerId: string | null };

export async function loadTasks(): Promise<{ tasks: TaskRow[]; people: { id: string; name: string; hq: string }[]; clients: TaskClient[] }> {
  const sb = db();
  const [employees, rows, clients] = await Promise.all([
    loadEmployees(),
    readAll<{ id: string; assignee_id: string; assigner_id: string | null; client_id: string | null; title: string; description: string | null; due_date: string | null; status: string; completed_at: string | null; created_at: string }>((a, b) =>
      sb.from('tasks').select('id, assignee_id, assigner_id, client_id, title, description, due_date, status, completed_at, created_at').order('created_at', { ascending: false }).range(a, b)),
    readAll<{ id: string; name: string; city: string | null; owner_employee_id: string | null; is_active: boolean }>((a, b) =>
      sb.from('clients').select('id, name, city, owner_employee_id, is_active').order('name').range(a, b)),
  ]);
  const clientName = new Map(clients.map(c => [c.id, c.name]));
  return {
    tasks: rows.map(t => ({ id: t.id, title: t.title, description: t.description, personId: t.assignee_id, person: employees.get(t.assignee_id)?.name ?? 'Someone no longer here', by: t.assigner_id ? employees.get(t.assigner_id)?.name ?? 'Someone' : 'Head office', clientId: t.client_id, client: t.client_id ? clientName.get(t.client_id) ?? 'A client no longer listed' : null, due: t.due_date, status: t.status, createdAt: t.created_at, completedAt: t.completed_at })),
    people: [...employees.values()].filter(e => e.status === 'active' && e.role).map(e => ({ id: e.id, name: e.name, hq: e.hq })).sort((a, b) => a.name.localeCompare(b.name)),
    clients: clients.filter(c => c.is_active).map(c => ({ id: c.id, name: c.name, place: c.city ?? '', ownerId: c.owner_employee_id })),
  };
}

export const assignTask = async (personId: string, title: string, description: string, due: string | null, clientId: string | null) =>
  (await call('assign_task', { p_id: crypto.randomUUID(), p_assignee_id: personId, p_title: title, p_description: description || null, p_due_date: due, p_client_id: clientId })) as string;
