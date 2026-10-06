import { db, readAll } from './client';
import { loadEmployees } from './people';

/**
 * Pay: the company's components, role structures, each person's dated salary,
 * and the month's payroll. The month itself is computed by the database
 * (payroll_preview, migration 0106); what is here is reading, saving, and a
 * full-month calculator that mirrors it, for forms that show the totals as the
 * office types. Seen and changed by owner, HR and finance only.
 */

const call = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(error.message.replace(/^./, x => x.toUpperCase()));
  return data;
};

export const PAY_ROLES = ['owner', 'hr', 'finance'];
export const mayPay = (role: string) => PAY_ROLES.includes(role);

export type Component = {
  id: string; name: string; kind: 'earning' | 'deduction'; calc: 'fixed' | 'percent_of_basic';
  amount: number; position: number; active: boolean;
};
export type Structure = {
  id: string; designationId: string | null; designation: string; name: string;
  basic: number; values: Record<string, number>; isDefault: boolean;
};
export type Role = { id: string; name: string };
export type PaySetup = { components: Component[]; structures: Structure[]; roles: Role[] };

export type Line = { name: string; kind: 'earning' | 'deduction'; full: number; amount: number; oneOff?: boolean };

/** One person's whole month at full pay: the same arithmetic as payroll_for with no loss of pay. */
export function monthOf(basic: number, values: Record<string, number>, components: Component[]) {
  const lines: Line[] = [{ name: 'Basic', kind: 'earning', full: basic, amount: Math.round(basic) }];
  let gross = Math.round(basic);
  let deductions = 0;
  for (const c of [...components].filter(c => c.active).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))) {
    const v = values[c.id] ?? c.amount;
    const amount = Math.round(c.calc === 'percent_of_basic' ? (basic * v) / 100 : v);
    if (amount <= 0) continue;
    lines.push({ name: c.name, kind: c.kind, full: amount, amount });
    if (c.kind === 'earning') gross += amount;
    else deductions += amount;
  }
  return { lines, gross, deductions, net: Math.max(0, gross - deductions) };
}

/** How a component is worked out, in words: "40% of basic", "₹1,600". */
export const howWorked = (c: Pick<Component, 'calc' | 'amount'>, v = c.amount) =>
  c.calc === 'percent_of_basic' ? `${v}% of basic` : `₹${Math.round(v).toLocaleString('en-IN')}`;

type ComponentRow = { id: string; name: string; kind: Component['kind']; calc: Component['calc']; amount: number | string; position: number; is_active: boolean };
type StructureRow = { id: string; designation_id: string | null; name: string; basic_pay: number | string; component_values: Record<string, number> | null; is_default: boolean | null; designations: { name: string } | { name: string }[] | null };

const toComponent = (r: ComponentRow): Component => ({ id: r.id, name: r.name, kind: r.kind, calc: r.calc, amount: Number(r.amount), position: r.position, active: r.is_active });
const toStructure = (r: StructureRow): Structure => {
  const d = Array.isArray(r.designations) ? r.designations[0] : r.designations;
  return {
    id: r.id, designationId: r.designation_id, designation: d?.name ?? (r.designation_id ? 'This role' : 'Every role'), name: r.name,
    basic: Number(r.basic_pay), values: numbers(r.component_values), isDefault: r.is_default === true,
  };
};
const numbers = (o: Record<string, unknown> | null) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, Number(v)]));

export async function loadPaySetup(): Promise<PaySetup> {
  const sb = db();
  const [components, structures, roles] = await Promise.all([
    readAll<ComponentRow>((a, b) => sb.from('salary_components').select('id, name, kind, calc, amount, position, is_active').order('position').order('name').range(a, b)),
    readAll<StructureRow>((a, b) => sb.from('salary_structures').select('id, designation_id, name, basic_pay, component_values, is_default, designations(name)').order('name').range(a, b)),
    sb.from('designations').select('id, name, is_active').order('rank').order('name'),
  ]);
  if (roles.error) throw new Error(roles.error.message);
  return {
    components: components.map(toComponent),
    structures: structures.map(toStructure),
    roles: ((roles.data ?? []) as { id: string; name: string; is_active: boolean }[]).filter(r => r.is_active).map(r => ({ id: r.id, name: r.name })),
  };
}

export const saveComponent = (c: Omit<Component, 'id'> & { id?: string | null }) =>
  call('save_salary_component', { p_id: c.id ?? null, p_name: c.name.trim(), p_kind: c.kind, p_calc: c.calc, p_amount: c.amount, p_position: c.position, p_is_active: c.active }) as Promise<string>;

export const saveStructure = (s: { id?: string | null; designationId: string | null; name: string; basic: number; values: Record<string, number>; isDefault: boolean }) =>
  call('save_salary_structure', { p_id: s.id ?? null, p_designation_id: s.designationId, p_name: s.name.trim(), p_basic: s.basic, p_values: s.values, p_is_default: s.isDefault }) as Promise<string>;

// ── each person's salary ──────────────────────────────────────────────

export type Salary = { id: string; employeeId: string; from: string; basic: number; values: Record<string, number>; structureId: string | null; note: string | null; createdAt: string };
export type SalaryPerson = { id: string; name: string; code: string; designation: string; designationId: string | null; hq: string; current: Salary | null; next: Salary | null };
export type SalariesModel = PaySetup & { people: SalaryPerson[]; history: Salary[] };

type SalaryDbRow = { id: string; employee_id: string; effective_from: string; basic: number | string; component_values: Record<string, number> | null; structure_id: string | null; note: string | null; created_at: string };
const toSalary = (r: SalaryDbRow): Salary => ({
  id: r.id, employeeId: r.employee_id, from: r.effective_from, basic: Number(r.basic), values: numbers(r.component_values),
  structureId: r.structure_id, note: r.note, createdAt: r.created_at,
});

export async function loadSalaries(today: string): Promise<SalariesModel> {
  const sb = db();
  const [setup, employees, rows, roles] = await Promise.all([
    loadPaySetup(),
    loadEmployees(),
    readAll<SalaryDbRow>((a, b) => sb.from('employee_salaries').select('id, employee_id, effective_from, basic, component_values, structure_id, note, created_at').order('effective_from', { ascending: false }).range(a, b)),
    readAll<{ id: string; designation_id: string | null }>((a, b) => sb.from('employees').select('id, designation_id').range(a, b)),
  ]);
  const roleOf = new Map(roles.map(r => [r.id, r.designation_id]));
  const history = rows.map(toSalary);
  const people = [...employees.values()]
    .filter(e => e.status === 'active')
    .map(e => {
      const mine = history.filter(s => s.employeeId === e.id);
      return {
        id: e.id, name: e.name, code: e.code, designation: e.designation, designationId: roleOf.get(e.id) ?? null, hq: e.hq,
        current: mine.find(s => s.from <= today) ?? null,
        next: [...mine].reverse().find(s => s.from > today) ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { ...setup, people, history };
}

export const setSalary = (s: { employeeId: string; from: string; basic: number; values: Record<string, number>; structureId: string | null; note: string }) =>
  call('set_employee_salary', { p_employee_id: s.employeeId, p_effective_from: s.from, p_basic: s.basic, p_values: s.values, p_structure_id: s.structureId, p_note: s.note.trim() || null }) as Promise<string>;

/** The structure a person starts from: their role's, else the company's default. */
export const structureFor = (designationId: string | null, structures: Structure[]) =>
  structures.find(s => s.designationId && s.designationId === designationId) ?? structures.find(s => s.isDefault) ?? null;

// ── the month ─────────────────────────────────────────────────────────

export type PayslipRow = {
  employeeId: string; name: string; code: string; designation: string; hq: string;
  hasSalary: boolean; basic: number; daysInMonth: number; lopDays: number; paidDays: number;
  lines: Line[]; gross: number; deductions: number; net: number;
  releasedAt: string | null; releasedNet: number | null; file: string | null;
};

type PreviewRow = {
  employee_id: string; name: string; code: string; designation: string; hq: string; has_salary: boolean;
  basic: number | string; days_in_month: number; lop_days: number | string; paid_days: number | string;
  lines: Line[] | null; gross: number | string; deductions: number | string; net: number | string;
  released_at: string | null; released_net: number | string | null; storage_path: string | null;
};

export async function loadPayrollMonth(month: string): Promise<PayslipRow[]> {
  const [y, m] = month.split('-').map(Number);
  const rows = ((await call('payroll_preview', { p_year: y, p_month: m })) ?? []) as PreviewRow[];
  return rows.map(r => ({
    employeeId: r.employee_id, name: r.name, code: r.code ?? '', designation: r.designation ?? '', hq: r.hq ?? '',
    hasSalary: r.has_salary, basic: Number(r.basic), daysInMonth: r.days_in_month, lopDays: Number(r.lop_days), paidDays: Number(r.paid_days),
    lines: (r.lines ?? []).map(l => ({ ...l, full: Number(l.full), amount: Number(l.amount) })),
    gross: Number(r.gross), deductions: Number(r.deductions), net: Number(r.net),
    releasedAt: r.released_at, releasedNet: r.released_net == null ? null : Number(r.released_net), file: r.storage_path || null,
  }));
}

/** One person's month again, with a corrected loss of pay: the database's own figures. */
export async function loadPayslipFor(row: PayslipRow, month: string, lopOverride: number | null): Promise<PayslipRow> {
  if (lopOverride === null) return row;
  const [y, m] = month.split('-').map(Number);
  const r = ((await call('payroll_person', { p_employee_id: row.employeeId, p_year: y, p_month: m, p_lop_override: lopOverride })) as PreviewRow[] | null)?.[0];
  if (!r) return row;
  return {
    ...row, hasSalary: r.has_salary, basic: Number(r.basic), daysInMonth: r.days_in_month, lopDays: Number(r.lop_days), paidDays: Number(r.paid_days),
    lines: (r.lines ?? []).map(l => ({ ...l, full: Number(l.full), amount: Number(l.amount) })),
    gross: Number(r.gross), deductions: Number(r.deductions), net: Number(r.net),
  };
}

/** The one-off lines added on top of the month, as the database adds them on release. */
export function withOneOff(row: PayslipRow, oneOff: { name: string; kind: Line['kind']; amount: number }[]): PayslipRow {
  const lines = [...row.lines, ...oneOff.map(o => ({ name: o.name.trim(), kind: o.kind, full: Math.round(o.amount), amount: Math.round(o.amount), oneOff: true }))];
  const gross = lines.filter(l => l.kind === 'earning').reduce((s, l) => s + l.amount, 0);
  const deductions = lines.filter(l => l.kind === 'deduction').reduce((s, l) => s + l.amount, 0);
  return { ...row, lines, gross, deductions, net: Math.max(0, gross - deductions) };
}

/** Uploads the PDF and releases the payslip; the file is removed again if the release is refused. */
export async function releaseGenerated(args: {
  orgId: string; month: string; employeeId: string; pdf: Blob;
  oneOff: { name: string; kind: Line['kind']; amount: number }[]; lopOverride: number | null; lopReason: string;
}) {
  const [y, m] = args.month.split('-').map(Number);
  const sb = db();
  const path = `${args.orgId}/payslips/${args.employeeId}/${args.month}-${crypto.randomUUID().slice(0, 8)}.pdf`;
  const up = await sb.storage.from('documents').upload(path, args.pdf, { contentType: 'application/pdf', upsert: false });
  if (up.error) throw new Error(`The payslip did not finish uploading: ${up.error.message}`);
  try {
    return (await call('release_generated_payslip', {
      p_employee_id: args.employeeId, p_year: y, p_month: m, p_storage_path: path,
      p_adjustments: args.oneOff.map(o => ({ name: o.name.trim(), kind: o.kind, amount: o.amount })),
      p_lop_override: args.lopOverride, p_lop_reason: args.lopOverride === null ? null : args.lopReason.trim(),
    })) as string;
  } catch (e) {
    await sb.storage.from('documents').remove([path]);
    throw e;
  }
}

// ── the company ───────────────────────────────────────────────────────

export type Company = { name: string; address: string; state: string; hq: string; gstin: string; pan: string; website: string; logo: string | null };

export async function loadCompany(): Promise<Company> {
  const rows = ((await call('my_company_profile', {})) ?? []) as { name: string; address: string | null; state: string | null; hq: string | null; gstin: string | null; pan: string | null; website: string | null; logo_data: string | null }[];
  const r = rows[0];
  return {
    name: r?.name ?? '', address: r?.address ?? '', state: r?.state ?? '', hq: r?.hq ?? '',
    gstin: r?.gstin ?? '', pan: r?.pan ?? '', website: r?.website ?? '', logo: r?.logo_data ?? null,
  };
}

export const saveCompany = (c: Pick<Company, 'address' | 'state' | 'gstin' | 'pan' | 'website'>) =>
  call('update_company_profile', { p_address: c.address, p_state: c.state, p_gstin: c.gstin, p_pan: c.pan, p_website: c.website });

export const setLogo = (dataUrl: string | null) => call('set_company_logo', { p_logo_data: dataUrl });

// ── one person's expense rule and travel rates ────────────────────────

export type ExpenseFigures = { allowance: number | null; billAbove: number | null; ceiling: number | null };
export type PersonExpense = {
  /** Their own figures; null where they follow their role or the company. */
  own: (ExpenseFigures & { note: string | null; updatedAt: string }) | null;
  /** What applies to them now, and where each figure comes from. */
  applies: { allowance: number; billAbove: number | null; ceiling: number | null };
  from: { allowance: Source; billAbove: Source; ceiling: Source };
  role: string;
};
type Source = 'person' | 'role' | 'company' | 'none';

/** The same order as expense_rule_for: the person, then their role, then the company. */
export async function loadPersonExpense(employeeId: string): Promise<PersonExpense> {
  const sb = db();
  const emp = await sb.from('employees').select('designation_id, designation').eq('id', employeeId).maybeSingle();
  if (emp.error) throw new Error(emp.error.message);
  const roleId = (emp.data?.designation_id as string | null) ?? null;
  const [own, rules, settings] = await Promise.all([
    sb.from('employee_expense_rules').select('daily_allowance, receipt_threshold, monthly_ceiling, note, updated_at').eq('employee_id', employeeId).maybeSingle(),
    sb.from('expense_rules').select('designation_id, daily_allowance, receipt_threshold, monthly_ceiling'),
    sb.from('org_settings').select('daily_allowance, receipt_threshold').maybeSingle(),
  ]);
  for (const r of [own, rules, settings]) if (r.error) throw new Error(r.error.message);
  const n = (v: unknown) => (v == null ? null : Number(v));
  const o = own.data;
  const role = (rules.data ?? []).find(r => roleId && r.designation_id === roleId);
  const company = (rules.data ?? []).find(r => r.designation_id == null);
  const pick = (p: number | null, r: number | null, c: number | null): [number | null, Source] =>
    p != null ? [p, 'person'] : r != null ? [r, 'role'] : c != null ? [c, 'company'] : [null, 'none'];
  const [allowance, aFrom] = pick(n(o?.daily_allowance), role ? n(role.daily_allowance) : null, n(settings.data?.daily_allowance) ?? 350);
  const [billAbove, bFrom] = pick(n(o?.receipt_threshold), role ? n(role.receipt_threshold) : null, n(settings.data?.receipt_threshold));
  const [ceiling, cFrom] = pick(n(o?.monthly_ceiling), role ? n(role.monthly_ceiling) : null, company ? n(company.monthly_ceiling) : null);
  return {
    own: o ? { allowance: n(o.daily_allowance), billAbove: n(o.receipt_threshold), ceiling: n(o.monthly_ceiling), note: o.note as string | null, updatedAt: o.updated_at as string } : null,
    applies: { allowance: allowance ?? 350, billAbove, ceiling },
    from: { allowance: aFrom, billAbove: bFrom, ceiling: cFrom },
    role: (emp.data?.designation as string | null) ?? '',
  };
}

/** All three null removes their own rule, so they follow their role again. */
export const savePersonExpense = (employeeId: string, f: ExpenseFigures, note: string) =>
  call('save_employee_expense_rule', { p_employee_id: employeeId, p_daily_allowance: f.allowance, p_receipt_threshold: f.billAbove, p_monthly_ceiling: f.ceiling, p_note: note.trim() || null });

export const TRAVEL_MODES = ['bike', 'car', 'bus', 'train', 'flight', 'auto', 'taxi'] as const;
export type TravelRate = { mode: string; local: number; outstation: number };

export async function loadTravelRates(employeeId: string): Promise<TravelRate[]> {
  const { data, error } = await db().from('travel_rates').select('mode, local_rate, outstation_rate').eq('employee_id', employeeId);
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => ({ mode: r.mode as string, local: Number(r.local_rate), outstation: Number(r.outstation_rate) }));
}

export const saveTravelRates = (employeeId: string, rates: TravelRate[]) =>
  call('save_travel_rates', { p_employee_id: employeeId, p_rates: rates.map(r => ({ mode: r.mode, local_rate: r.local, outstation_rate: r.outstation })) });

/** Every person with their own expense rule, for the company's list. */
export async function loadPersonalRules(): Promise<{ employeeId: string; name: string; figures: ExpenseFigures; note: string | null }[]> {
  const rows = await readAll<{ employee_id: string; daily_allowance: number | string | null; receipt_threshold: number | string | null; monthly_ceiling: number | string | null; note: string | null; employees: { name: string } | { name: string }[] | null }>((a, b) =>
    db().from('employee_expense_rules').select('employee_id, daily_allowance, receipt_threshold, monthly_ceiling, note, employees(name)').range(a, b));
  const n = (v: unknown) => (v == null ? null : Number(v));
  return rows.map(r => {
    const e = Array.isArray(r.employees) ? r.employees[0] : r.employees;
    return { employeeId: r.employee_id, name: e?.name ?? 'Someone', figures: { allowance: n(r.daily_allowance), billAbove: n(r.receipt_threshold), ceiling: n(r.monthly_ceiling) }, note: r.note };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** Everything about one person's pay the caller may see: salary history only for owner, HR and finance. */
export async function loadPersonPay(employeeId: string, role: string) {
  const sb = db();
  const pay = mayPay(role);
  const [setup, salaries, expense, travel] = await Promise.all([
    pay ? loadPaySetup() : Promise.resolve(null),
    pay ? readAll<SalaryDbRow>((a, b) => sb.from('employee_salaries').select('id, employee_id, effective_from, basic, component_values, structure_id, note, created_at').eq('employee_id', employeeId).order('effective_from', { ascending: false }).range(a, b)) : Promise.resolve([]),
    loadPersonExpense(employeeId),
    loadTravelRates(employeeId),
  ]);
  return { setup, salaries: salaries.map(toSalary), expense, travel };
}
export type PersonPayModel = Awaited<ReturnType<typeof loadPersonPay>>;
