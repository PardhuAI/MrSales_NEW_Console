import { db, readAll } from './client';
import { loadEmployees } from './people';
import { categoryLabel } from './approvals';
import { IST_TODAY, weekdayOf } from '../lib/days';

/**
 * Expenses and pay: each person's monthly claim, day by day, and the payslips
 * released for a month. Reads the same tables as the old console (expenses,
 * day_plans, org_settings, holidays, approval_events, payslips) and writes
 * through the same functions (decide_expenses, release_payslip).
 */

const call = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(error.message.replace(/^./, x => x.toUpperCase()));
  return data;
};

const daysOf = (month: string) => {
  const n = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
};

// ── expense claims ────────────────────────────────────────────────────

export type DayKind = 'worked' | 'leave' | 'holiday' | 'weekOff' | 'noPlan';

export type ClaimDay = {
  date: string;
  kind: DayKind;
  place: string;
  holiday: string | null;
  expense: null | {
    id: string; amount: number; categories: string[]; status: string; bills: string[];
    note: string | null; travel: string | null;
  };
};

export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'draft' | 'none';

export type Claim = {
  personId: string; name: string; hq: string; manager: string;
  days: ClaimDay[];
  status: ClaimStatus;
  claimed: number; approved: number; waiting: number;
  daysClaimed: number; daysWorked: number;
  /** A claim on a day with no day plan: the office calls this "no intimation". */
  noPlan: number;
  /** Days above the bill threshold with no bill attached. */
  noBill: number;
  sentAt: string | null;
  trail: { action: string; by: string; reason: string | null; at: string }[];
};

export type ClaimsModel = { month: string; allowance: number; billAbove: number; claims: Claim[] };

type ExpenseRow = {
  id: string; employee_id: string; work_date: string; amount: number; categories: string[] | null;
  description: string | null; remarks: string | null; destination: string | null; travel_mode: string | null;
  status: string; receipt_paths: string[] | null; submitted_at: string | null;
};

export async function loadClaims(month: string): Promise<ClaimsModel> {
  const sb = db();
  const days = daysOf(month);
  const [first, last] = [days[0], days[days.length - 1]];
  const [employees, settings, holidays, expenses, plans] = await Promise.all([
    loadEmployees(),
    sb.from('org_settings').select('daily_allowance, week_off_weekday, receipt_threshold').maybeSingle(),
    sb.from('holidays').select('holiday_date, name').gte('holiday_date', first).lte('holiday_date', last),
    readAll<ExpenseRow>((a, b) => sb.from('expenses')
      .select('id, employee_id, work_date, amount, categories, description, remarks, destination, travel_mode, status, receipt_paths, submitted_at')
      .gte('work_date', first).lte('work_date', last).order('work_date').range(a, b)),
    readAll<{ employee_id: string; work_date: string; work_type: string; cluster_name: string | null; areas: { name: string } | null }>((a, b) =>
      sb.from('day_plans').select('employee_id, work_date, work_type, cluster_name, areas(name)').gte('work_date', first).lte('work_date', last).range(a, b) as never),
  ]);
  for (const r of [settings, holidays]) if (r.error) throw new Error(`Could not read the claim rules: ${r.error.message}`);
  const ids = expenses.map(e => e.id);
  const events = ids.length
    ? await readAll<{ entity_id: string; action: string; actor_name: string | null; reason: string | null; at: string }>((a, b) =>
      sb.from('approval_events').select('entity_id, action, actor_name, reason, at').eq('entity', 'expense').in('entity_id', ids).order('at').range(a, b))
    : [];

  const allowance = Number(settings.data?.daily_allowance ?? 0);
  const billAbove = Number(settings.data?.receipt_threshold ?? 0);
  const weekOff = Number(settings.data?.week_off_weekday ?? 0);
  const holiday = new Map((holidays.data ?? []).map(h => [h.holiday_date as string, h.name as string]));
  const plan = new Map(plans.map(p => [`${p.employee_id}|${p.work_date}`, p]));
  const today = IST_TODAY();

  const people = [...employees.values()].filter(e => (e.status === 'active' && e.role === 'MR') || expenses.some(x => x.employee_id === e.id));
  const claims = people.map((e): Claim => {
    const mine = new Map(expenses.filter(x => x.employee_id === e.id && x.status !== 'cancelled').map(x => [x.work_date, x]));
    const list: ClaimDay[] = days.filter(k => k <= today && (!e.joinedAt || k >= e.joinedAt)).map(k => {
      const p = plan.get(`${e.id}|${k}`);
      const x = mine.get(k);
      const kind: DayKind = p ? (p.work_type === 'leave' ? 'leave' : p.work_type === 'holiday' ? 'holiday' : 'worked')
        : holiday.has(k) ? 'holiday' : weekdayOf(k) === weekOff ? 'weekOff' : 'noPlan';
      return {
        date: k, kind, holiday: holiday.get(k) ?? null,
        place: p?.cluster_name || p?.areas?.name || x?.destination || '',
        expense: x ? {
          id: x.id, amount: Number(x.amount), categories: (x.categories ?? []).map(categoryLabel), status: x.status,
          bills: x.receipt_paths ?? [], note: [x.remarks, x.description].find(t => t?.trim() && !/^daily allowance$/i.test(t.trim())) ?? null,
          travel: x.travel_mode ? `${x.travel_mode}${x.destination ? ` to ${x.destination}` : ''}` : null,
        } : null,
      };
    });
    const xs = list.flatMap(d => d.expense ? [d.expense] : []);
    const st = xs.map(x => x.status);
    const status: ClaimStatus = !xs.length ? 'none' : st.includes('pending') ? 'pending' : st.includes('rejected') ? 'rejected' : st.every(s => s === 'approved') ? 'approved' : 'draft';
    const sum = (f: (s: string) => boolean) => xs.filter(x => f(x.status)).reduce((s, x) => s + x.amount, 0);
    const sent = [...mine.values()].map(x => x.submitted_at).filter(Boolean).sort() as string[];
    const xids = new Set(xs.map(x => x.id));
    return {
      personId: e.id, name: e.name, hq: e.hq, manager: e.manager,
      days: list, status,
      claimed: sum(s => s !== 'draft'), approved: sum(s => s === 'approved'), waiting: sum(s => s === 'pending'),
      daysClaimed: xs.length, daysWorked: list.filter(d => d.kind === 'worked').length,
      noPlan: list.filter(d => d.expense && d.kind !== 'worked').length,
      noBill: billAbove ? xs.filter(x => x.amount > billAbove && !x.bills.length).length : 0,
      sentAt: sent[sent.length - 1] ?? null,
      trail: events.filter(v => xids.has(v.entity_id)).map(v => ({ action: v.action, by: v.actor_name ?? 'Someone', reason: v.reason, at: v.at })),
    };
  }).sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || b.claimed - a.claimed || a.name.localeCompare(b.name));
  return { month, allowance, billAbove, claims };
}

/** Approve or reject the days still waiting in one claim, in one call, so the person gets one message. */
export const decideClaim = async (ids: string[], approve: boolean, reason: string) =>
  (await call('decide_expenses', { p_ids: ids, p_approve: approve, p_reason: reason || null })) as number;

export async function billUrl(path: string) {
  const { data, error } = await db().storage.from('receipts').createSignedUrl(path, 600);
  if (error) throw new Error(`The bill could not be opened: ${error.message}`);
  return data.signedUrl;
}

// ── payroll ───────────────────────────────────────────────────────────

export type PayRow = {
  personId: string; name: string; code: string; hq: string; designation: string;
  net: number | null; releasedAt: string | null; file: string | null;
  /** Net pay the month before, to show what changed. */
  before: number | null;
};

export type PayrollModel = { month: string; rows: PayRow[]; months: string[] };

export async function loadPayroll(month: string): Promise<PayrollModel> {
  const sb = db();
  const [y, m] = month.split('-').map(Number);
  const prev = new Date(y, m - 2, 1);
  const [employees, slips] = await Promise.all([
    loadEmployees(),
    readAll<{ employee_id: string; period_year: number; period_month: number; net_pay: number; storage_path: string | null; released_at: string | null }>((a, b) =>
      sb.from('payslips').select('employee_id, period_year, period_month, net_pay, storage_path, released_at')
        .order('period_year', { ascending: false }).order('period_month', { ascending: false }).range(a, b)),
  ]);
  const at = (yy: number, mm: number, id: string) => slips.find(s => s.period_year === yy && s.period_month === mm && s.employee_id === id);
  const rows = [...employees.values()]
    .filter(e => e.status === 'active' || at(y, m, e.id))
    .map((e): PayRow => {
      const s = at(y, m, e.id);
      const b = at(prev.getFullYear(), prev.getMonth() + 1, e.id);
      return {
        personId: e.id, name: e.name, code: e.code, hq: e.hq, designation: e.designation,
        net: s ? Number(s.net_pay) : null, releasedAt: s?.released_at ?? null, file: s?.storage_path || null,
        before: b ? Number(b.net_pay) : null,
      };
    })
    .sort((a, b) => Number(a.net != null) - Number(b.net != null) || a.name.localeCompare(b.name));
  const months = [...new Set(slips.map(s => `${s.period_year}-${String(s.period_month).padStart(2, '0')}`))];
  return { month, rows, months };
}

export const PAYSLIP_ACCEPT = '.pdf,application/pdf';

export function payslipProblem(f: File): string | null {
  if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) return 'A payslip is sent as a PDF.';
  if (f.size === 0) return 'That file is empty.';
  if (f.size > 20 * 1024 * 1024) return `That file is ${(f.size / 1048576).toFixed(1)} MB. The limit is 20 MB.`;
  return null;
}

/**
 * Releases one person's payslip for a month: the net pay, and the PDF if one
 * is attached (in the documents bucket's payslips folder, which the person
 * may read on the phone). Releasing again replaces the month's payslip, as
 * release_payslip does.
 */
export async function releasePayslip(orgId: string, personId: string, month: string, net: number, file: File | null) {
  const [y, m] = month.split('-').map(Number);
  let path = '';
  const sb = db();
  if (file) {
    const problem = payslipProblem(file);
    if (problem) throw new Error(problem);
    path = `${orgId}/payslips/${personId}/${month}-${crypto.randomUUID().slice(0, 8)}.pdf`;
    const { error } = await sb.storage.from('documents').upload(path, file, { contentType: 'application/pdf', upsert: false });
    if (error) throw new Error(`The PDF did not finish uploading: ${error.message}`);
  }
  try {
    return (await call('release_payslip', { p_employee_id: personId, p_year: y, p_month: m, p_net_pay: net, p_storage_path: path })) as string;
  } catch (e) {
    if (path) await sb.storage.from('documents').remove([path]);
    throw e;
  }
}

export async function payslipUrl(path: string) {
  const { data, error } = await db().storage.from('documents').createSignedUrl(path, 600);
  if (error) throw new Error(`The payslip could not be opened: ${error.message}`);
  return data.signedUrl;
}
