import type { FakeDb, Row, Rpc } from './engine';

/**
 * Pay in the demo: components, structures, dated salaries, the month's payroll
 * and releasing payslips, with the same arithmetic and the same refusals as
 * migrations 0106 to 0109 in Mr_Sales_Web. Also the company profile (0107) and
 * a person's own expense rule (0109).
 */

const ORG = '0d3a1f00-demo-4000-8000-c1e0c0e00001';
const now = () => new Date().toISOString();
const fail = (m: string): never => { throw new Error(m); };
const trim = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const pad = (n: number) => String(n).padStart(2, '0');
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

type Audit = (db: FakeDb, action: string, entity: string, label: string, before?: unknown, after?: unknown, reason?: unknown) => void;
type Line = { name: string; kind: 'earning' | 'deduction'; full: number; amount: number; oneOff?: boolean };

/** payroll_for: one person's month from their salary and attendance. */
export function payrollFor(db: FakeDb, employeeId: string, year: number, month: number, lopOverride: number | null = null) {
  const m0 = `${year}-${pad(month)}-01`;
  const dim = new Date(year, month, 0).getDate();
  const m1 = `${year}-${pad(month)}-${pad(dim)}`;
  const e = db.rows('employees').find(x => x.id === employeeId);
  const s = db.rows('employee_salaries').filter(x => x.employee_id === employeeId && (x.effective_from as string) <= m1)
    .sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)))[0];
  if (!e || !s) return { has_salary: false, basic: 0, days_in_month: dim, lop_days: 0, paid_days: dim, lines: [] as Line[], gross: 0, deductions: 0, net: 0 };
  const days = db.rows('attendance_days').filter(a => a.employee_id === employeeId && (a.work_date as string) >= m0 && (a.work_date as string) <= m1);
  const absent = days.filter(a => a.attendance_status === 'absent').length;
  const unpaidTypes = new Set(['unpaid', ...db.rows('leave_policies').filter(p => p.is_paid === false).map(p => p.type as string)]);
  const unpaid = days.filter(a => a.attendance_status === 'leave' && db.rows('leave_requests').some(l =>
    l.employee_id === employeeId && l.status === 'approved' && unpaidTypes.has(l.type as string)
    && (l.from_date as string) <= (a.work_date as string) && (l.to_date as string) >= (a.work_date as string))).length;
  const joined = e.joined_at as string;
  const before = joined > m0 ? Math.min(dim, Math.round((Date.parse(joined) - Date.parse(m0)) / 86_400_000)) : 0;
  const lop = Math.min(dim, Math.max(0, lopOverride ?? absent + unpaid + before));
  const paid = dim - lop;
  const share = paid / dim;
  const basic = Number(s.basic);
  const pb = Math.round(basic * share);
  const lines: Line[] = [{ name: 'Basic', kind: 'earning', full: basic, amount: pb }];
  let earn = pb;
  let ded = 0;
  const values = (s.component_values ?? {}) as Record<string, number>;
  for (const c of db.rows('salary_components').filter(x => x.is_active).sort((a, b) => Number(a.position) - Number(b.position) || String(a.name).localeCompare(String(b.name)))) {
    const v = values[c.id as string] != null ? Number(values[c.id as string]) : Number(c.amount);
    const full = c.calc === 'percent_of_basic' ? (basic * v) / 100 : v;
    if (c.kind === 'earning') {
      const amt = Math.round(full * share);
      if (amt > 0) { lines.push({ name: c.name as string, kind: 'earning', full: Math.round(full), amount: amt }); earn += amt; }
    } else {
      const amt = Math.round(c.calc === 'percent_of_basic' ? (pb * v) / 100 : paid > 0 ? v : 0);
      if (amt > 0) { lines.push({ name: c.name as string, kind: 'deduction', full: amt, amount: amt }); ded += amt; }
    }
  }
  return { has_salary: true, basic, days_in_month: dim, lop_days: lop, paid_days: paid, lines, gross: earn, deductions: ded, net: Math.max(0, earn - ded) };
}

export function payRpcs(audit: Audit): Record<string, Rpc> {
  const person = (db: FakeDb, id: unknown) => db.rows('employees').find(x => x.id === id) ?? fail('employee is not in this organisation');
  return {
    payroll_preview: (a, db) => {
      const y = Number(a.p_year); const m = Number(a.p_month);
      if (m < 1 || m > 12) fail('that is not a month');
      const last = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`;
      return db.rows('employees')
        .filter(e => e.status === 'active' && (e.joined_at as string) <= last)
        .sort((p, q) => String(p.name).localeCompare(String(q.name)))
        .map(e => {
          const ps = db.rows('payslips').find(p => p.employee_id === e.id && p.period_year === y && p.period_month === m);
          return {
            employee_id: e.id, name: e.name, code: e.code, designation: e.designation ?? '', hq: e.hq ?? '',
            ...payrollFor(db, e.id as string, y, m),
            released_at: ps?.released_at ?? null, released_net: ps?.net_pay ?? null, storage_path: ps?.storage_path ?? null,
          };
        });
    },
    payroll_person: (a, db) => [payrollFor(db, person(db, a.p_employee_id).id as string, Number(a.p_year), Number(a.p_month), a.p_lop_override == null ? null : Number(a.p_lop_override))],
    release_generated_payslip: (a, db) => {
      const e = person(db, a.p_employee_id);
      const y = Number(a.p_year); const m = Number(a.p_month);
      const lop = a.p_lop_override == null ? null : Number(a.p_lop_override);
      if (lop != null && !trim(a.p_lop_reason)) fail('say why the loss of pay is corrected');
      const p = payrollFor(db, e.id as string, y, m, lop);
      if (!p.has_salary) fail(`${e.name} has no salary for this month`);
      const extra = ((a.p_adjustments as { name: string; kind: Line['kind']; amount: number }[]) ?? []).map(x => {
        if (!trim(x.name) || !(Number(x.amount) > 0)) fail('each one-off line needs a name and an amount above zero');
        return { name: x.name.trim(), kind: x.kind, full: Math.round(Number(x.amount)), amount: Math.round(Number(x.amount)), oneOff: true };
      });
      const lines = [...p.lines, ...extra];
      const gross = lines.filter(l => l.kind === 'earning').reduce((s, l) => s + l.amount, 0);
      const deductions = lines.filter(l => l.kind === 'deduction').reduce((s, l) => s + l.amount, 0);
      const fields = { net_pay: Math.max(0, gross - deductions), gross, deductions, days_in_month: p.days_in_month, lop_days: p.lop_days, paid_days: p.paid_days, lines, storage_path: a.p_storage_path, released_at: now() };
      const old = db.rows('payslips').find(x => x.employee_id === e.id && x.period_year === y && x.period_month === m);
      const id = (old?.id as string) ?? crypto.randomUUID();
      if (old) Object.assign(old, fields);
      else db.mutable('payslips').push({ id, org_id: ORG, employee_id: e.id, period_year: y, period_month: m, ...fields });
      audit(db, old ? 'released a payslip again' : 'released a payslip', 'Payslip', `${e.name}, ${y}-${pad(m)}`, null, null, trim(a.p_lop_reason));
      return id;
    },
    save_salary_component: (a, db) => {
      const name = trim(a.p_name) ?? fail('a component needs a name');
      if (/^basic$/i.test(name)) fail('basic is set for each person');
      if (!['earning', 'deduction'].includes(String(a.p_kind))) fail('a component is an earning or a deduction');
      if (!['fixed', 'percent_of_basic'].includes(String(a.p_calc))) fail('a component is fixed or a percent of basic');
      const amount = Number(a.p_amount);
      if (!(amount >= 0) || (a.p_calc === 'percent_of_basic' && amount > 100)) fail('the amount must be 0 or more, and a percentage at most 100');
      if (db.rows('salary_components').some(c => c.id !== a.p_id && String(c.name).toLowerCase() === name.toLowerCase())) fail(`${name} is already a component`);
      const row = db.rows('salary_components').find(c => c.id === a.p_id);
      const next = { name, kind: a.p_kind, calc: a.p_calc, amount, position: Number(a.p_position ?? 0), is_active: a.p_is_active !== false, updated_at: now() };
      const id = (row?.id as string) ?? crypto.randomUUID();
      if (row) Object.assign(row, next); else db.mutable('salary_components').push({ id, org_id: ORG, ...next });
      audit(db, 'saved a pay component', 'Pay component', name);
      return id;
    },
    save_salary_structure: (a, db) => {
      const name = trim(a.p_name) ?? fail('a salary structure needs a name');
      if (!(Number(a.p_basic) > 0)) fail('the basic must be above zero');
      if (a.p_designation_id && !db.rows('designations').some(d => d.id === a.p_designation_id)) fail('role is not in this organisation');
      if (a.p_designation_id && db.rows('salary_structures').some(s => s.id !== a.p_id && s.designation_id === a.p_designation_id)) fail('this role already has a structure');
      if (a.p_is_default) for (const s of db.rows('salary_structures')) s.is_default = false;
      const row = db.rows('salary_structures').find(s => s.id === a.p_id);
      const next = { designation_id: a.p_designation_id ?? null, name, basic_pay: Number(a.p_basic), component_values: a.p_values ?? {}, is_default: Boolean(a.p_is_default), updated_at: now() };
      const id = (row?.id as string) ?? crypto.randomUUID();
      if (row) Object.assign(row, next); else db.mutable('salary_structures').push({ id, org_id: ORG, ...next });
      audit(db, 'saved a salary structure', 'Salary structure', name);
      return id;
    },
    set_employee_salary: (a, db) => {
      const e = person(db, a.p_employee_id);
      const from = String(a.p_effective_from ?? '') || fail('say from when the salary applies');
      if (!(Number(a.p_basic) > 0)) fail('the basic must be above zero');
      const released = db.rows('payslips').some(p => p.employee_id === e.id && `${p.period_year}-${pad(Number(p.period_month))}-${pad(new Date(Number(p.period_year), Number(p.period_month), 0).getDate())}` >= from);
      if (released) fail('a payslip is already released for a month on or after that date; choose a later date');
      const row = db.rows('employee_salaries').find(s => s.employee_id === e.id && s.effective_from === from);
      const next = { basic: Number(a.p_basic), component_values: a.p_values ?? {}, structure_id: a.p_structure_id ?? null, note: trim(a.p_note) };
      const id = (row?.id as string) ?? crypto.randomUUID();
      if (row) Object.assign(row, next); else db.mutable('employee_salaries').push({ id, org_id: ORG, employee_id: e.id, effective_from: from, created_at: now(), ...next });
      audit(db, 'set a salary', 'Salary', String(e.name), null, null, trim(a.p_note));
      return id;
    },
    my_company_profile: (_a, db) => {
      const s = db.rows('org_settings')[0] ?? {};
      return [{ name: 'Cleocure Lifesciences', address: s.company_address ?? null, state: s.company_state ?? null, hq: 'Hyderabad', gstin: s.company_gstin ?? null, pan: s.company_pan ?? null, website: s.company_website ?? null, logo_data: s.logo_data ?? null }];
    },
    update_company_profile: (a, db) => {
      const gstin = trim(a.p_gstin)?.toUpperCase() ?? null;
      const pan = trim(a.p_pan)?.toUpperCase() ?? null;
      if (gstin && !GSTIN.test(gstin)) fail('that is not a GSTIN');
      if (pan && !PAN.test(pan)) fail('that is not a PAN');
      Object.assign(db.rows('org_settings')[0], { company_address: trim(a.p_address), company_state: trim(a.p_state), company_gstin: gstin, company_pan: pan, company_website: trim(a.p_website) });
      audit(db, 'changed the company details', 'Company', 'Cleocure Lifesciences');
      return null;
    },
    set_company_logo: (a, db) => {
      const v = (a.p_logo_data as string | null) ?? null;
      if (v && (!/^data:image\/(png|jpeg|svg\+xml);base64,/.test(v) || v.length > 400_000)) fail('the logo must be a PNG, JPEG or SVG of at most about 290 KB');
      db.rows('org_settings')[0].logo_data = v;
      audit(db, v ? 'changed the logo' : 'removed the logo', 'Company', 'Cleocure Lifesciences');
      return null;
    },
    save_employee_expense_rule: (a, db) => {
      const e = person(db, a.p_employee_id);
      const n = (v: unknown) => (v == null ? null : Number(v));
      const f = { daily_allowance: n(a.p_daily_allowance), receipt_threshold: n(a.p_receipt_threshold), monthly_ceiling: n(a.p_monthly_ceiling) };
      if (Object.values(f).some(v => v != null && v < 0)) fail('expense amounts cannot be negative');
      const rest = db.rows('employee_expense_rules').filter(r => r.employee_id !== e.id);
      if (Object.values(f).every(v => v == null)) {
        db.replace('employee_expense_rules', rest);
        audit(db, 'removed a personal expense rule', 'Expense rule', String(e.name), null, null, trim(a.p_note));
        return null;
      }
      db.replace('employee_expense_rules', [...rest, { employee_id: e.id, org_id: ORG, ...f, note: trim(a.p_note), updated_at: now() }]);
      audit(db, 'set a personal expense rule', 'Expense rule', String(e.name), null, f, trim(a.p_note));
      return null;
    },
    save_travel_rates: (a, db) => {
      const e = person(db, a.p_employee_id);
      for (const r of (a.p_rates as { mode: string; local_rate: number; outstation_rate: number }[]) ?? []) {
        const row = db.rows('travel_rates').find(x => x.employee_id === e.id && x.mode === r.mode);
        const next = { local_rate: Number(r.local_rate ?? 0), outstation_rate: Number(r.outstation_rate ?? 0), updated_at: now() };
        if (row) Object.assign(row, next); else db.mutable('travel_rates').push({ id: crypto.randomUUID(), org_id: ORG, employee_id: e.id, mode: r.mode, ...next });
      }
      return null;
    },
  };
}

/** The demo company's pay: the standard components, two structures, and a salary for everyone but two newcomers. */
export function seedPay(T: Record<string, Row[]>, created: string) {
  const add = (t: string, r: Row) => (T[t] ??= []).push({ org_id: ORG, ...r });
  const comp = (name: string, kind: string, calc: string, amount: number, position: number) => {
    const id = crypto.randomUUID();
    add('salary_components', { id, name, kind, calc, amount, position, is_active: true, updated_at: created });
    return id;
  };
  const hra = comp('HRA', 'earning', 'percent_of_basic', 40, 10);
  comp('Conveyance', 'earning', 'fixed', 1600, 20);
  const special = comp('Special allowance', 'earning', 'fixed', 0, 30);
  comp('Provident fund', 'deduction', 'percent_of_basic', 12, 40);
  comp('Professional tax', 'deduction', 'fixed', 200, 50);
  const des = T.designations ?? [];
  const mr = des.find(d => /medical|^mr$/i.test(String(d.name)) || d.short_name === 'MR') ?? des[des.length - 1];
  const asm = des.find(d => /area|asm/i.test(String(d.name)) || d.short_name === 'ASM');
  const sMr = crypto.randomUUID();
  const sAsm = crypto.randomUUID();
  if (mr) add('salary_structures', { id: sMr, designation_id: mr.id, name: 'MR standard', basic_pay: 17000, component_values: { [special]: 4000 }, is_default: true, updated_at: created });
  if (asm) add('salary_structures', { id: sAsm, designation_id: asm.id, name: 'ASM standard', basic_pay: 34000, component_values: { [special]: 9000 }, is_default: false, updated_at: created });
  const people = (T.employees ?? []).filter(e => e.status === 'active').sort((a, b) => String(a.joined_at).localeCompare(String(b.joined_at)));
  people.slice(0, Math.max(0, people.length - 2)).forEach((e, i) => {
    const manager = asm && e.designation_id === asm.id;
    const basic = manager ? 34000 : 17000 + (i % 5) * 1000;
    const from = String(e.joined_at) > '2025-04-01' ? `${String(e.joined_at).slice(0, 7)}-01` : '2025-04-01';
    add('employee_salaries', { id: crypto.randomUUID(), employee_id: e.id, effective_from: from, basic, component_values: { [special]: manager ? 9000 : 4000, ...(i % 7 === 3 ? { [hra]: 50 } : {}) }, structure_id: manager ? sAsm : sMr, note: null, created_at: created });
  });
  T.employee_expense_rules ??= [];
}
