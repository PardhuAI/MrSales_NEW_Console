import { db, readAll } from './client';
import { loadEmployees, type Employee } from './people';
import { categoryLabel } from './approvals';
import { workTypeLabel } from './field';
import { leaveLabel } from './team';
import { IST_TODAY, startOfDay, shiftDay, dayOf, hoursOf } from '../lib/days';

/**
 * Reports: one engine. A report is a month, whose data, and a set of columns
 * read from the tables the phone writes. The table on screen and the sheet
 * that is downloaded are the same rows, so they never disagree.
 */

export type ColKind = 'text' | 'num' | 'money' | 'pct' | 'day' | 'time';
/** sheetOnly: in the downloaded sheet, left off the screen to keep the table readable. */
export type Col = { key: string; header: string; kind?: ColKind; sheetOnly?: boolean };
export type Cell = string | number | null;
export type ReportRow = Record<string, Cell> & { _id: string };
export type Report = { columns: Col[]; rows: ReportRow[]; total?: Record<string, Cell>; note?: string };
export type Scope = { month: string; whose: string };

export type ReportKey = 'overview' | 'dcr' | 'adherence' | 'visits' | 'sales' | 'products' | 'targets' | 'attendance' | 'leave'
  | 'expenses' | 'clients' | 'orders' | 'expenseDays' | 'tour' | 'clientList' | 'attendanceDays';

export const CATALOGUE: { group: string; items: { key: ReportKey; name: string; about: string }[] }[] = [
  { group: 'Field work', items: [
    { key: 'dcr', name: 'Daily call report', about: 'One row per person per day: the day, the station, calls done and missed.' },
    { key: 'adherence', name: 'Call adherence', about: 'Calls planned against calls done, by person.' },
    { key: 'visits', name: 'Visit checks', about: 'Whether each person\'s visits were at the client, by person.' },
  ] },
  { group: 'Sales', items: [
    { key: 'sales', name: 'Sales', about: 'Primary sales and approved field orders, by person.' },
    { key: 'targets', name: 'Target against sales', about: 'Each person\'s target, what was sold, and the gap.' },
    { key: 'products', name: 'Product sales', about: 'Quantity and value by product, with each product\'s share.' },
    { key: 'orders', name: 'Orders', about: 'Every order in the month, with its value and status.' },
  ] },
  { group: 'People and money', items: [
    { key: 'attendance', name: 'Attendance', about: 'Days present, on leave, off and with no day plan, by person.' },
    { key: 'leave', name: 'Leave', about: 'Every leave request touching the month, with its decision.' },
    { key: 'expenses', name: 'Expense claims', about: 'Days claimed, amounts claimed, approved and waiting, by person.' },
  ] },
  { group: 'Clients and the company', items: [
    { key: 'clients', name: 'Client coverage', about: 'Clients each person holds, and how many were seen this month.' },
    { key: 'overview', name: 'Management summary', about: 'Calls, adherence, visit checks, sales, target and claims, one row per person.' },
  ] },
];

export const SHEETS: { key: ReportKey; name: string; about: string }[] = [
  { key: 'dcr', name: 'DCR', about: 'One row per person per day, in the shape the office keeps.' },
  { key: 'expenseDays', name: 'Expenses', about: 'Each day claimed, with the day it was, the amount and its status.' },
  { key: 'tour', name: 'Tour plan', about: 'The month as planned: each day, where, and the clients planned.' },
  { key: 'clientList', name: 'Client list', about: 'The client master, with type, area, owner and listing.' },
  { key: 'sales', name: 'Sales', about: 'Primary and field orders, with target and achievement, by person.' },
  { key: 'orders', name: 'Orders', about: 'Every order in the month, with value and status.' },
  { key: 'attendanceDays', name: 'Attendance', about: 'One row per person per day, with the reason the day is what it is.' },
];

/** The old console recorded its exports under shorter names; they read the same here. */
const OLD_KIND: Record<string, string> = { tourPlan: 'Tour plan', exp: 'Expenses', att: 'Attendance', client: 'Client list', targets: 'Target against sales', overview: 'Management summary', leave: 'Leave' };
export const reportName = (k: string) => CATALOGUE.flatMap(g => g.items).find(i => i.key === k)?.name ?? SHEETS.find(s => s.key === k)?.name ?? OLD_KIND[k] ?? k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, x => x.toUpperCase());

const days = (month: string) => {
  const n = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const today = IST_TODAY();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`).filter(d => d <= today);
};
const range = (month: string) => {
  const d = days(month);
  const last = d[d.length - 1] ?? `${month}-01`;
  const end = `${month}-${String(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()).padStart(2, '0')}`;
  return { first: `${month}-01`, last, end, from: startOfDay(`${month}-01`), to: startOfDay(shiftDay(last, 1)) };
};
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

/** The people a scope covers: everyone, a manager's whole line, or one person. */
export function peopleIn(all: Map<string, Employee>, whose: string, keep: (e: Employee) => boolean) {
  if (whose === 'all') return [...all.values()].filter(keep);
  if (whose.startsWith('team:')) {
    const top = whose.slice(5);
    const under = new Set<string>();
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of all.values()) if (!under.has(e.id) && e.managerId && (e.managerId === top || under.has(e.managerId))) { under.add(e.id); grew = true; }
    }
    return [...all.values()].filter(e => under.has(e.id) && keep(e));
  }
  const one = all.get(whose);
  return one ? [one] : [];
}

type Act = { employee_id: string; client_id: string | null; status: string; scheduled_start: string; actual_start: string | null; geo_verdict: string | null; geo_mocked: boolean | null; is_unplanned: boolean | null; clients: { type: string } | null };

export async function runReport(key: ReportKey, scope: Scope): Promise<Report> {
  const sb = db();
  const { first, last, end, from, to } = range(scope.month);
  const [y, m] = scope.month.split('-').map(Number);
  const employees = await loadEmployees();
  const fieldish = (e: Employee) => e.status === 'active' && e.role === 'MR';
  const anyone = () => true;
  const people = peopleIn(employees, scope.whose, scope.whose === 'all' || scope.whose.startsWith('team:') ? fieldish : anyone);
  const ids = new Set(people.map(p => p.id));
  const person = (e: Employee) => ({ person: e.name, code: e.code, hq: e.hq });
  const personCols: Col[] = [{ key: 'person', header: 'Person' }, { key: 'code', header: 'Code', sheetOnly: true }, { key: 'hq', header: 'Headquarters' }];

  const acts = () => readAll<Act>((a, b) => sb.from('activities')
    .select('employee_id, client_id, status, scheduled_start, actual_start, geo_verdict, geo_mocked, is_unplanned, clients(type)')
    .gte('scheduled_start', from).lt('scheduled_start', to).range(a, b) as never).then(r => r.filter(x => ids.has(x.employee_id)));
  const sales = () => readAll<{ employee_id: string | null; product_id: string | null; quantity: number | null; amount: number; source: string }>((a, b) =>
    sb.from('sales_records').select('employee_id, product_id, quantity, amount, source').gte('sale_date', first).lte('sale_date', end).range(a, b));
  const targets = () => readAll<{ employee_id: string; amount: number }>((a, b) =>
    sb.from('targets').select('employee_id, amount').eq('period_year', y).eq('period_month', m).range(a, b));
  const expenses = () => readAll<{ id: string; employee_id: string; work_date: string; amount: number; categories: string[] | null; status: string; receipt_paths: string[] | null; destination: string | null }>((a, b) =>
    sb.from('expenses').select('id, employee_id, work_date, amount, categories, status, receipt_paths, destination').gte('work_date', first).lte('work_date', last).neq('status', 'cancelled').order('work_date').range(a, b))
    .then(r => r.filter(x => ids.has(x.employee_id)));
  const attendance = () => readAll<{ employee_id: string; work_date: string; attendance_status: string; work_type: string | null; visits: number; holiday_name: string | null }>((a, b) =>
    sb.from('attendance_days').select('employee_id, work_date, attendance_status, work_type, visits, holiday_name').gte('work_date', first).lte('work_date', last).range(a, b))
    .then(r => r.filter(x => ids.has(x.employee_id)));
  const calls = (list: Act[]) => {
    const done = list.filter(x => x.status === 'completed');
    const planned = list.filter(x => !x.is_unplanned);
    const missed = list.filter(x => x.status === 'missed').length;
    const checked = done.filter(x => x.geo_verdict);
    const atClient = done.filter(x => x.geo_verdict === 'verified' && !x.geo_mocked).length;
    return { done: done.length, planned: planned.length, plannedDone: planned.filter(x => x.status === 'completed').length, missed, unplanned: list.filter(x => x.is_unplanned).length, checked: checked.length, atClient, unverified: done.length - atClient };
  };
  const by = <T extends { employee_id: string | null }>(list: T[], id: string) => list.filter(x => x.employee_id === id);
  const sum = (rows: ReportRow[], keys: string[]) => Object.fromEntries(keys.map(k => [k, rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)]));

  switch (key) {
    case 'overview': {
      const [a, s, t, x] = await Promise.all([acts(), sales(), targets(), expenses()]);
      const rows = people.map(e => {
        const c = calls(by(a, e.id));
        const sold = by(s, e.id).reduce((n, r) => n + Number(r.amount), 0);
        const target = t.filter(r => r.employee_id === e.id).reduce((n, r) => n + Number(r.amount), 0);
        return { _id: e.id, ...person(e), plannedDone: c.plannedDone, planned: c.planned, done: c.done, missed: c.missed, adherence: pct(c.plannedDone, c.planned), unverified: c.unverified, sales: sold, target, achievement: pct(sold, target), claimed: by(x, e.id).filter(r => r.status !== 'draft').reduce((n, r) => n + Number(r.amount), 0) };
      });
      const tot = sum(rows, ['planned', 'plannedDone', 'done', 'missed', 'unverified', 'sales', 'target', 'claimed']);
      return {
        columns: [...personCols, { key: 'planned', header: 'Planned', kind: 'num' }, { key: 'done', header: 'Done', kind: 'num' }, { key: 'missed', header: 'Missed', kind: 'num' }, { key: 'adherence', header: 'Adherence', kind: 'pct' }, { key: 'unverified', header: 'Not checked at the client', kind: 'num' }, { key: 'sales', header: 'Sales', kind: 'money' }, { key: 'target', header: 'Target', kind: 'money' }, { key: 'achievement', header: 'Achievement', kind: 'pct' }, { key: 'claimed', header: 'Claimed', kind: 'money' }],
        rows, total: { person: 'Everyone', ...tot, adherence: pct(Number(tot.plannedDone), Number(tot.planned)), achievement: pct(Number(tot.sales), Number(tot.target)) },
        note: 'Adherence is planned calls done out of planned calls. Sales count every sales record, as targets do.',
      };
    }
    case 'dcr': {
      const [a, plans] = await Promise.all([acts(), readAll<{ employee_id: string; work_date: string; work_type: string; cluster_name: string | null; areas: { name: string } | null }>((p, q) =>
        sb.from('day_plans').select('employee_id, work_date, work_type, cluster_name, areas(name)').gte('work_date', first).lte('work_date', last).range(p, q) as never)]);
      const rows: ReportRow[] = [];
      for (const e of people) {
        for (const d of days(scope.month)) {
          const plan = plans.find(p => p.employee_id === e.id && p.work_date === d);
          const list = by(a, e.id).filter(x => dayOf(x.actual_start ?? x.scheduled_start) === d);
          if (!plan && !list.length) continue;
          const done = list.filter(x => x.status === 'completed');
          const starts = done.map(x => x.actual_start).filter(Boolean).sort() as string[];
          rows.push({
            _id: `${e.id}|${d}`, date: d, ...person(e), day: plan ? workTypeLabel(plan.work_type) : 'No day plan', station: plan?.cluster_name || plan?.areas?.name || '',
            done: done.length, missed: list.filter(x => x.status === 'missed').length,
            doctors: done.filter(x => x.clients?.type === 'doctor').length, chemists: done.filter(x => x.clients?.type === 'chemist').length,
            first: starts[0] ?? null, last: starts[starts.length - 1] ?? null,
          });
        }
      }
      rows.sort((p, q) => String(p.date).localeCompare(String(q.date)) || String(p.person).localeCompare(String(q.person)));
      return { columns: [{ key: 'date', header: 'Date', kind: 'day' }, { key: 'person', header: 'Person' }, { key: 'hq', header: 'Headquarters' }, { key: 'day', header: 'The day' }, { key: 'station', header: 'Station' }, { key: 'done', header: 'Calls done', kind: 'num' }, { key: 'missed', header: 'Missed', kind: 'num' }, { key: 'doctors', header: 'Doctors', kind: 'num' }, { key: 'chemists', header: 'Chemists', kind: 'num' }, { key: 'first', header: 'First call', kind: 'time' }, { key: 'last', header: 'Last call', kind: 'time' }], rows, total: { date: 'Total', ...sum(rows, ['done', 'missed', 'doctors', 'chemists']) } };
    }
    case 'adherence': {
      const a = await acts();
      const rows = people.map(e => { const c = calls(by(a, e.id)); return { _id: e.id, ...person(e), planned: c.planned, plannedDone: c.plannedDone, missed: c.missed, unplanned: c.unplanned, adherence: pct(c.plannedDone, c.planned) }; });
      const tot = sum(rows, ['planned', 'plannedDone', 'missed', 'unplanned']);
      return { columns: [...personCols, { key: 'planned', header: 'Planned', kind: 'num' }, { key: 'plannedDone', header: 'Planned and done', kind: 'num' }, { key: 'missed', header: 'Missed', kind: 'num' }, { key: 'unplanned', header: 'Unplanned calls', kind: 'num' }, { key: 'adherence', header: 'Adherence', kind: 'pct' }], rows, total: { person: 'Everyone', ...tot, adherence: pct(Number(tot.plannedDone), Number(tot.planned)) } };
    }
    case 'visits': {
      const a = await acts();
      const rows = people.map(e => {
        const done = by(a, e.id).filter(x => x.status === 'completed');
        const n = (f: (x: Act) => boolean) => done.filter(f).length;
        const at = n(x => x.geo_verdict === 'verified' && !x.geo_mocked);
        return { _id: e.id, ...person(e), done: done.length, atClient: at, outside: n(x => x.geo_verdict === 'outOfRange'), noLocation: n(x => !x.geo_verdict || x.geo_verdict === 'unavailable'), fake: n(x => x.geo_verdict === 'suspect' || Boolean(x.geo_mocked)), share: pct(at, done.length) };
      });
      const tot = sum(rows, ['done', 'atClient', 'outside', 'noLocation', 'fake']);
      return { columns: [...personCols, { key: 'done', header: 'Visits done', kind: 'num' }, { key: 'atClient', header: 'At the client', kind: 'num' }, { key: 'outside', header: 'Outside the radius', kind: 'num' }, { key: 'noLocation', header: 'No location', kind: 'num' }, { key: 'fake', header: 'Fake location', kind: 'num' }, { key: 'share', header: 'At the client, share', kind: 'pct' }], rows, total: { person: 'Everyone', ...tot, share: pct(Number(tot.atClient), Number(tot.done)) } };
    }
    case 'sales':
    case 'targets': {
      const [s, t] = await Promise.all([sales(), targets()]);
      const rows = people.map(e => {
        const mine = by(s, e.id);
        const primary = mine.filter(r => r.source !== 'order').reduce((n, r) => n + Number(r.amount), 0);
        const orders = mine.filter(r => r.source === 'order').reduce((n, r) => n + Number(r.amount), 0);
        const target = t.filter(r => r.employee_id === e.id).reduce((n, r) => n + Number(r.amount), 0);
        return { _id: e.id, ...person(e), primary, orders, total: primary + orders, target, achievement: pct(primary + orders, target), gap: target ? Math.max(target - primary - orders, 0) : null };
      });
      const tot = sum(rows, ['primary', 'orders', 'total', 'target', 'gap']);
      const cols: Col[] = key === 'sales'
        ? [...personCols, { key: 'primary', header: 'Primary sales', kind: 'money' }, { key: 'orders', header: 'Field orders', kind: 'money' }, { key: 'total', header: 'Total', kind: 'money' }, { key: 'target', header: 'Target', kind: 'money' }, { key: 'achievement', header: 'Achievement', kind: 'pct' }]
        : [...personCols, { key: 'target', header: 'Target', kind: 'money' }, { key: 'total', header: 'Sold', kind: 'money' }, { key: 'gap', header: 'Still to sell', kind: 'money' }, { key: 'achievement', header: 'Achievement', kind: 'pct' }];
      return { columns: cols, rows, total: { person: 'Everyone', ...tot, achievement: pct(Number(tot.total), Number(tot.target)) }, note: 'Field orders are approved orders, recorded as sales when a manager approves them.' };
    }
    case 'products': {
      const [s, products] = await Promise.all([sales(), sb.from('products').select('id, name, sku')]);
      const mine = s.filter(r => r.employee_id && ids.has(r.employee_id) && r.product_id);
      const all = mine.reduce((n, r) => n + Number(r.amount), 0);
      const rows = (products.data ?? []).map(p => {
        const list = mine.filter(r => r.product_id === p.id);
        const amount = list.reduce((n, r) => n + Number(r.amount), 0);
        return { _id: p.id as string, product: p.name as string, sku: (p.sku as string) ?? '', quantity: list.reduce((n, r) => n + Number(r.quantity ?? 0), 0), amount, share: pct(amount, all) };
      }).filter(r => r.amount || r.quantity).sort((a, b) => b.amount - a.amount);
      return { columns: [{ key: 'product', header: 'Product' }, { key: 'sku', header: 'Code' }, { key: 'quantity', header: 'Quantity', kind: 'num' }, { key: 'amount', header: 'Value', kind: 'money' }, { key: 'share', header: 'Share', kind: 'pct' }], rows, total: { product: 'Every product', ...sum(rows, ['quantity', 'amount']) }, note: 'Sales recorded without a product are left out here.' };
    }
    case 'orders': {
      const rows = (await readAll<{ id: string; employee_id: string; total: number; status: string; created_at: string; clients: { name: string } | null; stockists: { name: string } | null }>((a, b) =>
        sb.from('orders').select('id, employee_id, total, status, created_at, clients(name), stockists(name)').gte('created_at', from).lt('created_at', to).order('created_at').range(a, b) as never))
        .filter(o => ids.has(o.employee_id))
        .map(o => ({ _id: o.id, date: dayOf(o.created_at), number: o.id.slice(0, 8).toUpperCase(), person: employees.get(o.employee_id)?.name ?? '', client: o.clients?.name ?? '', stockist: o.stockists?.name ?? 'None named', value: Number(o.total), status: o.status.replace(/^./, x => x.toUpperCase()) }));
      return { columns: [{ key: 'date', header: 'Date', kind: 'day' }, { key: 'number', header: 'Order' }, { key: 'person', header: 'Person' }, { key: 'client', header: 'Client' }, { key: 'stockist', header: 'Stockist' }, { key: 'value', header: 'Value', kind: 'money' }, { key: 'status', header: 'Status' }], rows, total: { date: 'Total', ...sum(rows, ['value']) } };
    }
    case 'attendance': {
      const att = await attendance();
      const rows = people.map(e => {
        const mine = by(att, e.id);
        const n = (s: string) => mine.filter(r => r.attendance_status === s).length;
        return { _id: e.id, ...person(e), present: n('present'), leave: n('leave'), holiday: n('holiday'), weekOff: n('weekOff'), noPlan: n('absent') };
      });
      return { columns: [...personCols, { key: 'present', header: 'Present', kind: 'num' }, { key: 'leave', header: 'On leave', kind: 'num' }, { key: 'holiday', header: 'Holidays', kind: 'num' }, { key: 'weekOff', header: 'Week off', kind: 'num' }, { key: 'noPlan', header: 'No day plan', kind: 'num' }], rows, total: { person: 'Everyone', ...sum(rows, ['present', 'leave', 'holiday', 'weekOff', 'noPlan']) }, note: 'A day counts as present when a day plan was filed or a call was made, as on the phone.' };
    }
    case 'attendanceDays': {
      const att = await attendance();
      const rows = att.map(r => ({ _id: `${r.employee_id}|${r.work_date}`, date: r.work_date, ...person(employees.get(r.employee_id)!), status: ({ present: 'Present', leave: 'On leave', holiday: 'Holiday', weekOff: 'Week off', absent: 'No day plan' } as Record<string, string>)[r.attendance_status] ?? r.attendance_status, because: r.holiday_name ?? (r.work_type ? workTypeLabel(r.work_type) : ''), visits: r.visits }))
        .sort((a, b) => a.date.localeCompare(b.date) || a.person.localeCompare(b.person));
      return { columns: [{ key: 'date', header: 'Date', kind: 'day' }, { key: 'person', header: 'Person' }, { key: 'code', header: 'Code', sheetOnly: true }, { key: 'status', header: 'Status' }, { key: 'because', header: 'Because' }, { key: 'visits', header: 'Calls done', kind: 'num' }], rows };
    }
    case 'leave': {
      const rows = (await readAll<{ id: string; employee_id: string; type: string; from_date: string; to_date: string; days: number; status: string; reason: string | null }>((a, b) =>
        sb.from('leave_requests').select('id, employee_id, type, from_date, to_date, days, status, reason').lte('from_date', end).gte('to_date', first).order('from_date').range(a, b)))
        .filter(l => ids.has(l.employee_id))
        .map(l => ({ _id: l.id, person: employees.get(l.employee_id)?.name ?? '', type: leaveLabel(l.type), from: l.from_date, to: l.to_date, days: l.days, status: ({ pending: 'Waiting', approved: 'Approved', rejected: 'Not approved', cancelled: 'Withdrawn' } as Record<string, string>)[l.status] ?? l.status, reason: l.reason ?? '' }));
      return { columns: [{ key: 'person', header: 'Person' }, { key: 'type', header: 'Leave' }, { key: 'from', header: 'From', kind: 'day' }, { key: 'to', header: 'To', kind: 'day' }, { key: 'days', header: 'Days', kind: 'num' }, { key: 'status', header: 'Status' }, { key: 'reason', header: 'Reason' }], rows };
    }
    case 'expenses': {
      const x = await expenses();
      const rows = people.map(e => {
        const mine = by(x, e.id);
        const s = (f: (st: string) => boolean) => mine.filter(r => f(r.status)).reduce((n, r) => n + Number(r.amount), 0);
        return { _id: e.id, ...person(e), days: mine.length, claimed: s(st => st !== 'draft'), approved: s(st => st === 'approved'), waiting: s(st => st === 'pending'), rejected: s(st => st === 'rejected'), notSent: s(st => st === 'draft') };
      });
      return { columns: [...personCols, { key: 'days', header: 'Days', kind: 'num' }, { key: 'claimed', header: 'Claimed', kind: 'money' }, { key: 'approved', header: 'Approved', kind: 'money' }, { key: 'waiting', header: 'Waiting', kind: 'money' }, { key: 'rejected', header: 'Rejected', kind: 'money' }, { key: 'notSent', header: 'Not sent yet', kind: 'money' }], rows, total: { person: 'Everyone', ...sum(rows, ['days', 'claimed', 'approved', 'waiting', 'rejected', 'notSent']) } };
    }
    case 'expenseDays': {
      const x = await expenses();
      const rows = x.map(r => ({ _id: r.id, date: r.work_date, ...person(employees.get(r.employee_id)!), place: r.destination ?? '', amount: Number(r.amount), for: (r.categories ?? []).map(categoryLabel).join(', '), bills: (r.receipt_paths ?? []).length, status: ({ draft: 'Not sent', pending: 'Waiting', approved: 'Approved', rejected: 'Rejected' } as Record<string, string>)[r.status] ?? r.status }));
      return { columns: [{ key: 'date', header: 'Date', kind: 'day' }, { key: 'person', header: 'Person' }, { key: 'code', header: 'Code', sheetOnly: true }, { key: 'place', header: 'Place' }, { key: 'for', header: 'For' }, { key: 'amount', header: 'Amount', kind: 'money' }, { key: 'bills', header: 'Bills', kind: 'num' }, { key: 'status', header: 'Status' }], rows, total: { date: 'Total', ...sum(rows, ['amount', 'bills']) } };
    }
    case 'tour': {
      const tdays = await readAll<{ employee_id: string; work_date: string; work_type: string | null; tour_type: string | null; client_names: string[] | null; areas: { name: string } | null }>((a, b) =>
        sb.from('tour_plan_days').select('employee_id, work_date, work_type, tour_type, client_names, areas(name)').gte('work_date', first).lte('work_date', end).order('work_date').range(a, b) as never);
      const rows = tdays.filter(d => ids.has(d.employee_id)).map(d => ({ _id: `${d.employee_id}|${d.work_date}`, date: d.work_date, ...person(employees.get(d.employee_id)!), day: workTypeLabel(d.work_type), area: d.areas?.name ?? '', tour: d.tour_type ?? '', clients: (d.client_names ?? []).join(', ') }));
      return { columns: [{ key: 'date', header: 'Date', kind: 'day' }, { key: 'person', header: 'Person' }, { key: 'code', header: 'Code', sheetOnly: true }, { key: 'day', header: 'The day' }, { key: 'area', header: 'Area' }, { key: 'tour', header: 'Tour type' }, { key: 'clients', header: 'Clients planned' }], rows };
    }
    case 'clients':
    case 'clientList': {
      const [list, a] = await Promise.all([
        readAll<{ id: string; name: string; type: string; listing: string; owner_employee_id: string | null; areas: { name: string } | null }>((p, q) => sb.from('clients').select('id, name, type, listing, owner_employee_id, areas(name)').order('name').range(p, q) as never),
        key === 'clients' ? acts() : Promise.resolve([] as Act[]),
      ]);
      if (key === 'clientList') {
        const rows = list.filter(c => scope.whose === 'all' || (c.owner_employee_id && ids.has(c.owner_employee_id))).map(c => ({ _id: c.id, client: c.name, type: c.type.replace(/^./, x => x.toUpperCase()), area: c.areas?.name ?? '', owner: c.owner_employee_id ? employees.get(c.owner_employee_id)?.name ?? '' : 'Nobody', listing: c.listing === 'unlisted' ? 'Unlisted' : 'Listed' }));
        return { columns: [{ key: 'client', header: 'Client' }, { key: 'type', header: 'Type' }, { key: 'area', header: 'Area' }, { key: 'owner', header: 'Held by' }, { key: 'listing', header: 'Listing' }], rows };
      }
      const rows = people.map(e => {
        const mine = list.filter(c => c.owner_employee_id === e.id && c.listing !== 'unlisted');
        const seen = new Set(by(a, e.id).filter(x => x.status === 'completed').map(x => x.client_id));
        const visited = mine.filter(c => seen.has(c.id)).length;
        return { _id: e.id, ...person(e), clients: mine.length, visited, notVisited: mine.length - visited, coverage: pct(visited, mine.length) };
      });
      const tot = sum(rows, ['clients', 'visited', 'notVisited']);
      return { columns: [...personCols, { key: 'clients', header: 'Listed clients', kind: 'num' }, { key: 'visited', header: 'Seen this month', kind: 'num' }, { key: 'notVisited', header: 'Not seen', kind: 'num' }, { key: 'coverage', header: 'Coverage', kind: 'pct' }], rows, total: { person: 'Everyone', ...tot, coverage: pct(Number(tot.visited), Number(tot.clients)) } };
    }
  }
}

/** A cell as the office reads it in a sheet: plain numbers, dates as dates, times in India. */
export function sheetValue(c: Col, v: Cell): string {
  if (v == null) return '';
  if (c.kind === 'time') return typeof v === 'string' ? `${String(Math.floor(hoursOf(v))).padStart(2, '0')}:${String(Math.round((hoursOf(v) % 1) * 60)).padStart(2, '0')}` : '';
  if (c.kind === 'pct') return `${v}%`;
  return String(v);
}

// ── downloads, recorded as export jobs ───────────────────────────────

export type ExportJob = { id: string; kind: string; status: string; path: string | null; at: string; month: string; whose: string; error: string | null };

export async function loadExports(): Promise<ExportJob[]> {
  const { data, error } = await db().from('export_jobs').select('id, kind, status, storage_path, created_at, params, error').order('created_at', { ascending: false }).limit(30);
  if (error) throw new Error(`Could not read the downloads: ${error.message}`);
  return (data ?? []).map(r => {
    const p = (r.params ?? {}) as Record<string, unknown>;
    return { id: r.id as string, kind: r.kind as string, status: r.status as string, path: (r.storage_path as string | null) ?? null, at: r.created_at as string, month: String(p.month ?? ''), whose: String(p.whoseLabel ?? p.scope ?? ''), error: (r.error as string | null) ?? null };
  });
}

/**
 * Records the export (request_export), keeps a copy under the account that
 * asked for it (documents/{org}/exports/{user}/), and marks it ready
 * (complete_export). The office gets the sheet either way; a failed upload is
 * recorded as failed rather than pretended.
 */
export async function recordExport(orgId: string, userId: string, kind: string, params: Record<string, unknown>, csv: string) {
  const sb = db();
  const { data: jobId, error } = await sb.rpc('request_export', { p_kind: kind, p_params: params });
  if (error) throw new Error(error.message);
  const path = `${orgId}/exports/${userId}/${jobId}.csv`;
  const up = await sb.storage.from('documents').upload(path, new Blob(['﻿' + csv], { type: 'text/csv' }), { contentType: 'text/csv', upsert: true });
  const done = await sb.rpc('complete_export', up.error
    ? { p_job_id: jobId, p_storage_path: null, p_failed: true, p_error: `The copy was not kept: ${up.error.message}` }
    : { p_job_id: jobId, p_storage_path: path, p_failed: false, p_error: null });
  if (done.error) throw new Error(done.error.message);
  return { jobId: jobId as string, kept: !up.error };
}

export async function exportUrl(path: string) {
  const { data, error } = await db().storage.from('documents').createSignedUrl(path, 600);
  if (error) throw new Error(`The sheet could not be opened: ${error.message}`);
  return data.signedUrl;
}
