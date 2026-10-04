import { db, readAll } from './client';
import { loadEmployees } from './people';
import { IST_TODAY, shiftDay } from '../lib/days';

/**
 * What Today shows besides the field: the first-run checklist, and the views
 * for HR, Finance and IT. Each figure is read from the same table or function
 * the old console reads (Mr_Sales_Web/src/data/live.ts), scoped by row-level
 * security to the signed-in person.
 */

const must = <T,>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`Could not read ${what}: ${r.error.message}`);
  return r.data as T;
};

// ── first run ─────────────────────────────────────────────────────────

export type SetupStep = {
  key: string;
  title: string;
  body: string;
  done: boolean;
  to: string;
  action: string;
  optional?: boolean;
};

/**
 * Everything between a new organisation and a rep signing in, in the order it
 * has to happen (the old console's SetupGuide). A step a company has declined
 * is stored on the organisation (`org_settings.setup_dismissed`), so it stays
 * declined on every machine.
 */
export async function loadSetup(): Promise<SetupStep[]> {
  const sb = db();
  const head = { count: 'exact' as const, head: true };
  const [settings, roles, users, regions, territories, areas, people, reporting] = await Promise.all([
    sb.from('org_settings').select('setup_dismissed').maybeSingle(),
    sb.from('designations').select('id, name, short_name, app_view, is_active'),
    sb.from('app_users').select('role, employee_id, status'),
    sb.from('regions').select('id', head),
    sb.from('territories').select('id', head),
    sb.from('areas').select('id', head),
    sb.from('employees').select('id, mobile_role, status'),
    sb.from('current_reporting').select('employee_id, manager_id'),
  ]);
  const dismissed = must(settings, 'your setup list')?.setup_dismissed as string[] | null ?? [];
  const r = must(roles, 'your roles') as { name: string; short_name: string; app_view: string; is_active: boolean }[];
  const u = must(users, 'logins') as { role: string; employee_id: string | null; status: string }[];
  const e = must(people, 'people') as { id: string; mobile_role: string; status: string }[];
  const rep = must(reporting, 'the reporting line') as { employee_id: string; manager_id: string | null }[];
  for (const x of [regions, territories, areas]) must(x, 'your geography');

  const managerRole = r.find(x => x.app_view === 'manager' && x.is_active);
  const fieldRole = r.find(x => x.app_view === 'field' && x.is_active);
  const field = e.filter(x => x.mobile_role === 'MR' && x.status === 'active');
  const managed = new Set(rep.filter(x => x.manager_id).map(x => x.employee_id));
  const unmanaged = field.filter(x => !managed.has(x.id)).length;
  const plural = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`;

  const steps: SetupStep[] = [
    {
      key: 'roles', title: 'Name the roles in your company',
      body: 'What you call your field people, and what you call whoever approves their day. Each person is added against one, and it decides which app they open.',
      done: r.length > 0, to: '/settings/roles', action: 'Name your roles',
    },
    {
      key: 'office-access', title: 'Give your office access', optional: true,
      body: 'HR, IT or finance colleagues each get their own login here, with only what their job needs. They can finish this list with you.',
      done: u.some(x => !['field', 'owner'].includes(x.role)), to: '/settings/logins/invite', action: 'Invite a colleague',
    },
    {
      key: 'geo', title: 'Set up your geography',
      body: 'A region, a territory inside it and an area inside that. People and clients are both placed in them; a rep posted to no area opens an empty app.',
      done: (regions.count ?? 0) > 0 && (territories.count ?? 0) > 0 && (areas.count ?? 0) > 0, to: '/settings/geography', action: 'Add geography',
    },
    {
      key: 'managers', title: managerRole ? `Add your ${managerRole.name.toLowerCase()}s` : 'Add whoever approves the day',
      body: 'They approve their team\'s day plans, tours, leave and expenses on the manager app. Add them before the field people, so there is someone to report to.',
      done: e.some(x => x.mobile_role === 'ASM'), to: '/team/new', action: managerRole ? `Add a ${managerRole.short_name}` : 'Add a manager',
    },
    {
      key: 'field', title: fieldRole ? `Add your ${fieldRole.name.toLowerCase()}s` : 'Add your field people',
      body: 'Choose each person\'s role, territory, area and manager as you add them.',
      done: field.length > 0, to: '/team/new', action: fieldRole ? `Add a ${fieldRole.short_name}` : 'Add a rep',
    },
    {
      key: 'reporting', title: 'Check everybody reports to somebody',
      body: unmanaged
        ? `${plural(unmanaged, 'person has', 'people have')} nobody over them, so their leave, tour plan and expense claim would be sent and then wait for ever.`
        : 'Whoever approves a person\'s leave, tour plan and claims. Set as people are added, and changed here when someone moves on.',
      done: field.length > 0 && unmanaged === 0, to: '/team/org-chart', action: 'Open the org chart',
    },
    {
      key: 'logins', title: 'Give them phone logins',
      body: 'Adding a person does not open the app for them. A phone login sets a first password and emails them a link to choose their own.',
      done: u.some(x => x.role === 'field'), to: '/settings/logins', action: 'Give logins',
    },
  ];
  return steps.filter(s => !dismissed.includes(s.key));
}

export async function dismissSetupStep(key: string) {
  const { error } = await db().rpc('dismiss_setup_step', { p_step: key, p_dismissed: true });
  if (error) throw new Error(error.message);
}

// ── HR ────────────────────────────────────────────────────────────────

export type HrModel = {
  today: string;
  /** The day the attendance figures describe: today, or the last working day when today is not one. */
  day: { date: string; isToday: boolean; present: number; leave: number; absent: number; off: 'weekOff' | 'holiday' | null; holidayName: string | null };
  todayOff: 'weekOff' | 'holiday' | null;
  todayHolidayName: string | null;
  headcount: number;
  joinedThisMonth: { id: string; name: string; joinedAt: string }[];
  leaveWaiting: { id: string; personId: string; name: string; type: string; from: string; to: string; days: number; reason: string; appliedAt: string }[];
  awayThisWeek: { personId: string; name: string; from: string; to: string; type: string }[];
  documents: { id: string; personId: string; name: string; title: string; category: string; expiresAt: string }[];
};

export async function loadHr(): Promise<HrModel> {
  const sb = db();
  const today = IST_TODAY();
  const [people, attendance, leave, docs] = await Promise.all([
    loadEmployees(),
    readAll<{ employee_id: string; work_date: string; attendance_status: string; holiday_name: string | null }>((a, b) => sb.from('attendance_days')
      .select('employee_id, work_date, attendance_status, holiday_name').gte('work_date', shiftDay(today, -10)).lte('work_date', today).range(a, b)),
    sb.from('leave_requests').select('id, employee_id, type, from_date, to_date, days, reason, status, applied_at')
      .in('status', ['pending', 'approved']).gte('to_date', shiftDay(today, -1)).order('applied_at'),
    sb.from('documents').select('id, employee_id, title, category, expires_at').not('expires_at', 'is', null)
      .lte('expires_at', shiftDay(today, 30)).order('expires_at'),
  ]);
  const lv = must(leave, 'leave requests') as { id: string; employee_id: string; type: string; from_date: string; to_date: string; days: number; reason: string | null; status: string; applied_at: string }[];
  const dc = must(docs, 'documents') as { id: string; employee_id: string | null; title: string; category: string; expires_at: string }[];
  const active = [...people.values()].filter(p => p.status === 'active');
  const nameOf = (id: string) => people.get(id)?.name ?? 'Someone no longer on the roster';
  const activeIds = new Set(active.map(p => p.id));

  const byDay = new Map<string, typeof attendance>();
  for (const a of attendance) if (activeIds.has(a.employee_id)) byDay.set(a.work_date, [...(byDay.get(a.work_date) ?? []), a]);
  const offOf = (rows: typeof attendance) => {
    if (!rows.length) return null;
    if (rows.every(r => r.attendance_status === 'holiday')) return 'holiday' as const;
    if (rows.every(r => r.attendance_status === 'weekOff')) return 'weekOff' as const;
    return null;
  };
  const todayRows = byDay.get(today) ?? [];
  const todayOff = offOf(todayRows);
  let day = today;
  if (todayOff) {
    for (let i = 1; i <= 10; i++) {
      const k = shiftDay(today, -i);
      if ((byDay.get(k) ?? []).length && !offOf(byDay.get(k)!)) { day = k; break; }
    }
  }
  const rows = byDay.get(day) ?? [];
  const leaveLabel = (t: string) => ({ casual: 'Casual leave', sick: 'Sick leave', earned: 'Earned leave', unpaid: 'Leave without pay', compensatory: 'Compensatory leave' } as Record<string, string>)[t] ?? `${t[0]?.toUpperCase() ?? ''}${t.slice(1)} leave`;
  const monthStart = `${today.slice(0, 7)}-01`;

  return {
    today,
    day: {
      date: day, isToday: day === today,
      present: rows.filter(r => r.attendance_status === 'present').length,
      leave: rows.filter(r => r.attendance_status === 'leave').length,
      absent: rows.filter(r => r.attendance_status === 'absent').length,
      off: offOf(rows), holidayName: rows[0]?.holiday_name ?? null,
    },
    todayOff,
    todayHolidayName: todayRows[0]?.holiday_name ?? null,
    headcount: active.length,
    joinedThisMonth: active.filter(p => p.joinedAt >= monthStart).map(p => ({ id: p.id, name: p.name, joinedAt: p.joinedAt })),
    leaveWaiting: lv.filter(l => l.status === 'pending').map(l => ({
      id: l.id, personId: l.employee_id, name: nameOf(l.employee_id), type: leaveLabel(l.type), from: l.from_date, to: l.to_date,
      days: l.days, reason: l.reason?.trim() || 'No reason given.', appliedAt: l.applied_at,
    })),
    awayThisWeek: lv.filter(l => l.status === 'approved' && l.from_date <= shiftDay(today, 7) && l.to_date >= today)
      .map(l => ({ personId: l.employee_id, name: nameOf(l.employee_id), from: l.from_date, to: l.to_date, type: leaveLabel(l.type) })),
    documents: dc.filter(d => d.employee_id && activeIds.has(d.employee_id)).map(d => ({
      id: d.id, personId: d.employee_id!, name: nameOf(d.employee_id!), title: d.title, category: d.category, expiresAt: d.expires_at,
    })),
  };
}

// ── Finance ───────────────────────────────────────────────────────────

export type FinanceModel = {
  today: string;
  /** The claim month this view reads: the current one, or last month in the first week, when it is being closed. */
  monthLabel: string;
  closing: boolean;
  nextLabel: string;
  /** Drafts already started for the current month, when the view reads last month. */
  draftsNow: number;
  allowance: number;
  billAbove: number;
  waiting: { claims: number; days: number; amount: number; oldestSent: string | null };
  month: { claimed: number; approved: number; pending: number; rejected: number; draft: number; people: number; allowancePart: number; abovePart: number };
  lastMonth: { label: string; approved: number; people: number };
  aboveAllowance: { id: string; personId: string; name: string; date: string; amount: number; categories: string[]; note: string | null; status: string; bills: number }[];
  byPerson: { personId: string; name: string; days: number; amount: number; perDay: number }[];
  orders: { count: number; value: number };
  payroll: { label: string; released: number; netPaid: number } | null;
};

const CATEGORY: Record<string, string> = {
  dailyAllowance: 'Daily allowance', travel: 'Travel', food: 'Food', lodging: 'Lodging', courier: 'Courier', phone: 'Phone', other: 'Other',
};
export const categoryLabel = (c: string) => CATEGORY[c] ?? c.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, x => x.toUpperCase());

export async function loadFinance(): Promise<FinanceModel> {
  const sb = db();
  const today = IST_TODAY();
  const [y, m] = today.split('-').map(Number);
  const prev = new Date(y, m - 2, 1);
  const [py, pm] = [prev.getFullYear(), prev.getMonth() + 1];
  const mk = (a: number, b: number) => `${a}-${String(b).padStart(2, '0')}`;
  const [people, settings, expenses, orders, payslips] = await Promise.all([
    loadEmployees(),
    sb.from('org_settings').select('daily_allowance, receipt_threshold').maybeSingle(),
    readAll<{ id: string; employee_id: string; work_date: string; amount: number; categories: string[] | null; description: string | null; remarks: string | null; status: string; receipt_paths: string[] | null; submitted_at: string | null }>((a, b) => sb.from('expenses')
      .select('id, employee_id, work_date, amount, categories, description, remarks, status, receipt_paths, submitted_at')
      .gte('work_date', `${mk(py, pm)}-01`).order('work_date').range(a, b)),
    sb.from('orders').select('total').eq('status', 'pending'),
    sb.from('payslips').select('net_pay, released_at').eq('period_year', py).eq('period_month', pm),
  ]);
  const st = must(settings, 'company rules');
  const allowance = Number(st?.daily_allowance ?? 0);
  const nameOf = (id: string) => people.get(id)?.name ?? 'Someone no longer on the roster';
  // In a month's first week the claims being sent and decided are last month's,
  // so that is the month this view reads, and it says so.
  const early = Number(today.slice(8)) <= 7;
  const [fy, fm] = early ? [py, pm] : [y, m];
  const thisMonth = expenses.filter(e => e.work_date.startsWith(mk(fy, fm)));
  const lastMonth = expenses.filter(e => e.work_date.startsWith(mk(py, pm)));
  const draftsNow = expenses.filter(e => e.work_date.startsWith(mk(y, m)) && e.status === 'draft');
  const sum = (l: typeof expenses) => l.reduce((s, e) => s + Number(e.amount), 0);
  const pending = expenses.filter(e => e.status === 'pending');
  // Claimed means sent: waiting, approved or rejected. The same word on Expense
  // claims counts the same rows, so the two screens give one figure.
  const sent = thisMonth.filter(e => e.status === 'pending' || e.status === 'approved' || e.status === 'rejected');
  const da = (e: (typeof expenses)[number]) => ((e.categories ?? []).includes('dailyAllowance') ? Math.min(Number(e.amount), allowance) : 0);
  const per = new Map<string, { days: number; amount: number }>();
  for (const e of sent) {
    const p = per.get(e.employee_id) ?? { days: 0, amount: 0 };
    p.days++;
    p.amount += Number(e.amount);
    per.set(e.employee_id, p);
  }
  const ord = must(orders, 'orders') as { total: number }[];
  const pay = must(payslips, 'payslips') as { net_pay: number }[];
  const label = (a: number, b: number) => new Date(a, b - 1, 1).toLocaleDateString('en-IN', { month: 'long' });

  return {
    today,
    monthLabel: label(fy, fm),
    closing: early,
    nextLabel: label(y, m),
    draftsNow: sum(draftsNow),
    allowance,
    billAbove: Number(st?.receipt_threshold ?? 0),
    waiting: {
      claims: new Set(pending.map(e => `${e.employee_id}|${e.work_date.slice(0, 7)}`)).size,
      days: pending.length,
      amount: sum(pending),
      oldestSent: pending.map(e => e.submitted_at).filter(Boolean).sort()[0] ?? null,
    },
    month: {
      claimed: sum(sent),
      approved: sum(thisMonth.filter(e => e.status === 'approved')),
      pending: sum(thisMonth.filter(e => e.status === 'pending')),
      rejected: sum(thisMonth.filter(e => e.status === 'rejected')),
      draft: sum(thisMonth.filter(e => e.status === 'draft')),
      people: per.size,
      allowancePart: sent.reduce((s, e) => s + da(e), 0),
      abovePart: sent.reduce((s, e) => s + Number(e.amount) - da(e), 0),
    },
    lastMonth: {
      label: label(py, pm),
      approved: sum(lastMonth.filter(e => e.status === 'approved')),
      people: new Set(lastMonth.filter(e => e.status === 'approved').map(e => e.employee_id)).size,
    },
    aboveAllowance: expenses
      .filter(e => (e.status === 'pending' || e.status === 'approved' || e.status === 'rejected') && e.work_date.startsWith(mk(fy, fm)) && allowance > 0 && Number(e.amount) > allowance)
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 6)
      .map(e => ({
        id: e.id, personId: e.employee_id, name: nameOf(e.employee_id), date: e.work_date, amount: Number(e.amount),
        categories: (e.categories ?? []).map(categoryLabel), note: e.description || e.remarks, status: e.status, bills: e.receipt_paths?.length ?? 0,
      })),
    byPerson: [...per.entries()].map(([id, p]) => ({ personId: id, name: nameOf(id), days: p.days, amount: p.amount, perDay: p.days ? p.amount / p.days : 0 }))
      .sort((a, b) => b.perDay - a.perDay),
    orders: { count: ord.length, value: ord.reduce((s, o) => s + Number(o.total), 0) },
    payroll: pay.length ? { label: label(py, pm), released: pay.length, netPaid: pay.reduce((s, p) => s + Number(p.net_pay), 0) } : null,
  };
}

// ── IT ────────────────────────────────────────────────────────────────

export type ItModel = {
  logins: { office: number; phone: number; suspended: number; firstPassword: { email: string; role: string }[] };
  noLogin: { id: string; name: string; hq: string }[];
  phones: { registered: number; field: number; quiet: { id: string; name: string; lastSeen: string | null }[] };
  lastFromPhone: string | null;
  changes: { id: string; who: string; action: string; label: string; at: string }[];
};

export async function loadIt(): Promise<ItModel> {
  const sb = db();
  const today = IST_TODAY();
  const [people, users, devices, last, audit] = await Promise.all([
    loadEmployees(),
    sb.from('app_users').select('role, employee_id, status, email, must_change_password'),
    sb.from('employees').select('id, last_device_id, status, mobile_role'),
    sb.from('activities').select('updated_at').order('updated_at', { ascending: false }).limit(1),
    sb.from('audit_log').select('id, actor_name, action, entity_label, at').order('at', { ascending: false }).limit(6),
  ]);
  const u = must(users, 'logins') as { role: string; employee_id: string | null; status: string; email: string | null; must_change_password: boolean }[];
  const d = must(devices, 'phones') as { id: string; last_device_id: string | null; status: string; mobile_role: string }[];
  const withLogin = new Set(u.filter(x => x.role === 'field' && x.employee_id).map(x => x.employee_id));
  const field = [...people.values()].filter(p => p.status === 'active' && p.role);
  const threeDays = new Date(Date.parse(`${shiftDay(today, -3)}T00:00:00+05:30`)).toISOString();
  return {
    logins: {
      office: u.filter(x => x.role !== 'field' && x.status === 'active').length,
      phone: u.filter(x => x.role === 'field' && x.status === 'active').length,
      suspended: u.filter(x => x.status === 'suspended').length,
      firstPassword: u.filter(x => x.must_change_password && x.status === 'active').map(x => ({ email: x.email ?? 'a login', role: x.role })),
    },
    noLogin: field.filter(p => !withLogin.has(p.id)).map(p => ({ id: p.id, name: p.name, hq: p.hq })),
    phones: {
      registered: d.filter(x => x.status === 'active' && x.last_device_id).length,
      field: field.length,
      quiet: field.filter(p => withLogin.has(p.id) && (!p.lastSeenAt || p.lastSeenAt < threeDays))
        .map(p => ({ id: p.id, name: p.name, lastSeen: p.lastSeenAt })),
    },
    lastFromPhone: (must(last, 'the latest visit') as { updated_at: string }[])[0]?.updated_at ?? null,
    changes: (must(audit, 'the audit log') as { id: string; actor_name: string; action: string; entity_label: string | null; at: string }[])
      .map(a => ({ id: a.id, who: a.actor_name, action: a.action, label: a.entity_label ?? '', at: a.at })),
  };
}
