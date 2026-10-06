import { db, readAll } from './client';
import { loadEmployees } from './people';

/**
 * Settings and the account pages. Every write goes through the function the
 * old console calls, which keeps its own rules and refusals:
 * update_org_settings, the geography and role functions, set_field_login,
 * set_login_status, upsert_holiday, the invite-user and field-password-reset
 * edge functions, and the platform ticket and invoice functions.
 */

const sentence = (m: string) => {
  const t = m.trim();
  // An email address or code at the start keeps its own case.
  const head = /^\S*[@_]\S*/.test(t) ? t : `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
  return `${head}${/[.!?]$/.test(t) ? '' : '.'}`;
};
const call = async (fn: string, args: Record<string, unknown> = {}) => {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(sentence(error.message));
  return data;
};
/** An edge function's refusal is in its JSON body; the client's own message is only "non-2xx". */
async function invoke(fn: string, body: Record<string, unknown>) {
  const { data, error } = await db().functions.invoke(fn, { body });
  if (!error) return data as Record<string, unknown>;
  let message = error.message;
  const res = (error as { context?: Response }).context;
  if (res && typeof res.json === 'function') {
    try {
      const b = await res.json();
      if (typeof b?.error === 'string') message = b.error;
      else if (typeof b?.message === 'string') message = b.message;
    } catch { /* keep the client's message */ }
  }
  if (/failed to send a request|failed to fetch/i.test(message)) message = `Could not reach the ${fn} service.`;
  throw new Error(sentence(message));
}

// ── company rules ─────────────────────────────────────────────────────

export type Rules = { allowance: number; weekOff: number; billAbove: number; policy: 'off' | 'warn' | 'block'; radius: number; updatedAt: string | null };

export async function loadRules(): Promise<Rules> {
  const { data, error } = await db().from('org_settings').select('daily_allowance, week_off_weekday, receipt_threshold, geo_fence_policy, geo_fence_radius_m, updated_at').maybeSingle();
  if (error) throw new Error(`Could not read the company rules: ${error.message}`);
  return {
    allowance: Number(data?.daily_allowance ?? 350), weekOff: Number(data?.week_off_weekday ?? 0), billAbove: Number(data?.receipt_threshold ?? 500),
    policy: (data?.geo_fence_policy ?? 'warn') as Rules['policy'], radius: Number(data?.geo_fence_radius_m ?? 50), updatedAt: (data?.updated_at as string | null) ?? null,
  };
}

export const saveRules = (r: Rules) => call('update_org_settings', {
  p_daily_allowance: r.allowance, p_week_off_weekday: r.weekOff, p_receipt_threshold: r.billAbove, p_geo_fence_policy: r.policy, p_geo_fence_radius_m: r.radius,
});

// ── geography ─────────────────────────────────────────────────────────

export type GeoTree = {
  regions: { id: string; name: string; territories: { id: string; name: string; hq: string; people: { id: string; name: string }[]; clients: number; areas: { id: string; name: string; clients: number; clusters: { id: string; name: string; clients: number }[] }[] }[] }[];
};

export async function loadGeoTree(): Promise<GeoTree> {
  const sb = db();
  const [regions, territories, areas, clusters, clients, people] = await Promise.all([
    sb.from('regions').select('id, name').order('name'),
    sb.from('territories').select('id, name, hq, region_id').order('name'),
    sb.from('areas').select('id, name, territory_id').order('name'),
    sb.from('clusters').select('id, name, area_id').order('name'),
    readAll<{ territory_id: string | null; area_id: string | null; cluster_id: string | null }>((a, b) => sb.from('clients').select('territory_id, area_id, cluster_id').range(a, b)),
    loadEmployees(),
  ]);
  for (const r of [regions, territories, areas, clusters]) if (r.error) throw new Error(`Could not read the geography: ${r.error.message}`);
  const n = (f: (c: typeof clients[number]) => boolean) => clients.filter(f).length;
  const staff = [...people.values()].filter(p => p.status === 'active');
  return {
    regions: (regions.data ?? []).map(r => ({
      id: r.id as string, name: r.name as string,
      territories: (territories.data ?? []).filter(t => t.region_id === r.id).map(t => ({
        id: t.id as string, name: t.name as string, hq: (t.hq as string | null) ?? '',
        people: staff.filter(p => p.territoryId === t.id).map(p => ({ id: p.id, name: p.name })),
        clients: n(c => c.territory_id === t.id),
        areas: (areas.data ?? []).filter(a => a.territory_id === t.id).map(a => ({
          id: a.id as string, name: a.name as string, clients: n(c => c.area_id === a.id),
          clusters: (clusters.data ?? []).filter(c => c.area_id === a.id).map(c => ({ id: c.id as string, name: c.name as string, clients: n(x => x.cluster_id === c.id) })),
        })),
      })),
    })),
  };
}

export const createRegion = (name: string) => call('create_region', { p_name: name });
export const createTerritory = (regionId: string, name: string, hq: string) => call('create_territory', { p_region_id: regionId, p_name: name, p_hq: hq });
export const createArea = (territoryId: string, name: string) => call('create_area', { p_territory_id: territoryId, p_name: name });
export const createCluster = (areaId: string, name: string) => call('create_cluster', { p_area_id: areaId, p_name: name });
export const deletePlace = async (level: 'territory' | 'area' | 'cluster', id: string) => (await call(`delete_${level}`, { p_id: id })) as string;

// ── roles ─────────────────────────────────────────────────────────────

export type Role = { id: string; name: string; short: string; app: 'field' | 'manager'; active: boolean; holders: number };

export async function loadRoles(): Promise<Role[]> {
  const { data, error } = await db().from('designations').select('id, name, short_name, app_view, rank, is_active, employees(count)').order('rank').order('name');
  if (error) throw new Error(`Could not read your roles: ${error.message}`);
  return (data ?? []).map(r => ({
    id: r.id as string, name: r.name as string, short: (r.short_name as string) ?? '', app: r.app_view as Role['app'], active: (r.is_active as boolean) ?? true,
    holders: Number((r.employees as { count: number }[] | null)?.[0]?.count ?? 0),
  }));
}

export const createRole = (name: string, app: string, short: string) => call('create_designation', { p_name: name, p_app_view: app, p_short_name: short.trim() || null });
export const updateRole = (id: string, name: string, app: string, short: string) => call('update_designation', { p_id: id, p_name: name, p_app_view: app, p_short_name: short.trim() || null });
export const setRoleActive = async (id: string, active: boolean) => (await call('set_designation_active', { p_id: id, p_active: active })) as string;
export const deleteRole = async (id: string) => (await call('delete_designation', { p_id: id })) as string;

// ── logins ────────────────────────────────────────────────────────────

export type OfficeRole = 'owner' | 'admin' | 'hr' | 'it' | 'finance' | 'management';
/** Which office roles each role may hand out, as public.role_grantable decides. */
export const GRANTABLE: Record<OfficeRole, OfficeRole[]> = {
  owner: ['admin', 'hr', 'it', 'finance', 'management'], admin: ['hr', 'it', 'finance', 'management'], hr: ['it', 'finance', 'management'], it: [], finance: [], management: [],
};
export const mayManageLogins = (role: string) => ['owner', 'admin', 'hr'].includes(role);

export type Login = { id: string; userId: string | null; employeeId: string | null; email: string; role: string; status: 'active' | 'suspended'; mustChange: boolean; invitedAt: string | null; at: string | null };
export type PhoneRow = { id: string; name: string; code: string; hq: string; email: string | null; designation: string; login: Login | null; office: string | null };
export type LoginsModel = { office: (Login & { name: string })[]; phones: PhoneRow[] };

export async function loadLogins(): Promise<LoginsModel> {
  const sb = db();
  const [people, users, emails] = await Promise.all([
    loadEmployees(),
    readAll<{ id: string; user_id: string | null; employee_id: string | null; role: string; status: string; email: string | null; must_change_password: boolean | null; invited_at: string | null; updated_at: string | null }>((a, b) =>
      sb.from('app_users').select('id, user_id, employee_id, role, status, email, must_change_password, invited_at, updated_at').range(a, b)),
    readAll<{ id: string; email: string | null }>((a, b) => sb.from('employees').select('id, email').range(a, b)),
  ]);
  const email = new Map(emails.map(e => [e.id, e.email]));
  const login = (u: typeof users[number]): Login => ({ id: u.id, userId: u.user_id, employeeId: u.employee_id, email: u.email ?? '', role: u.role, status: u.status === 'suspended' ? 'suspended' : 'active', mustChange: u.must_change_password === true, invitedAt: u.invited_at, at: u.updated_at });
  return {
    office: users.filter(u => u.role !== 'field').map(u => ({ ...login(u), name: (u.employee_id && people.get(u.employee_id)?.name) || '' }))
      .sort((a, b) => Number(a.status === 'suspended') - Number(b.status === 'suspended') || a.role.localeCompare(b.role) || a.email.localeCompare(b.email)),
    phones: [...people.values()].filter(p => p.role && (p.status === 'active' || users.some(u => u.employee_id === p.id && u.role === 'field' && u.status === 'active')))
      .map(p => {
        const u = users.find(x => x.employee_id === p.id && x.role === 'field');
        const o = users.find(x => x.employee_id === p.id && x.role !== 'field' && x.status === 'active');
        return { id: p.id, name: p.name, code: p.code, hq: p.hq, email: email.get(p.id) ?? null, designation: p.designation, login: u ? login(u) : null, office: o?.role ?? null };
      })
      .sort((a, b) => Number(Boolean(a.login)) - Number(Boolean(b.login)) || a.name.localeCompare(b.name)),
  };
}

/** Gives a phone login or resets its password, then emails the person a link to choose their own. */
export async function givePhoneLogin(p: PhoneRow, password: string): Promise<string> {
  const message = (await call('set_field_login', { p_employee_id: p.id, p_password: password })) as string | null;
  if (!p.email) return `${sentence(message ?? 'Saved')} There is no email on their record, so tell them the starting password yourself.`;
  try {
    await invoke('field-password-reset', { employee_code: p.code, org_slug: await orgSlug(), purpose: p.login ? 'reset' : 'invite' });
    return p.login
      ? `${p.name}'s password is reset, and a link to choose their own was emailed to ${p.email}.`
      : `${p.name} has a phone login. Their company code, employee ID and a link to choose a password were emailed to ${p.email}.`;
  } catch {
    return `${p.login ? 'The password is reset' : `${p.name} has a phone login`}, but the email could not be sent. Tell them the starting password yourself.`;
  }
}

async function orgSlug() {
  const { data, error } = await db().from('organisations').select('slug').limit(1).maybeSingle();
  if (error || !data?.slug) throw new Error('Could not read the company code.');
  return data.slug as string;
}

export const setLoginStatus = (id: string, status: 'active' | 'suspended', reason: string) => call('set_login_status', { p_app_user_id: id, p_status: status, p_reason: reason });
export const inviteOffice = (email: string, role: OfficeRole, employeeId: string | null) => invoke('invite-user', { email: email.trim(), role, employee_id: employeeId });

// ── HR rules: holidays ────────────────────────────────────────────────

export type Holiday = { id: string; date: string; name: string };
export type LeavePolicy = { type: string; annual: number; carry: number; approval: boolean; paid: boolean; updatedAt: string | null };
export type SalaryStructure = { id: string; designationId: string | null; designation: string; name: string; gross: number; basic: number; hra: number; allowances: number; deductions: number; net: number; default: boolean; updatedAt: string | null };
export type ExpenseRule = { id: string; designationId: string | null; designation: string; allowance: number; billAbove: number; ceiling: number | null; updatedAt: string | null };
export type HrRulesModel = {
  holidays: Holiday[];
  leaveTypes: { type: string; requests: number }[];
  leavePolicies: LeavePolicy[];
  salary: SalaryStructure[];
  expenseRules: ExpenseRule[];
  policyReady: boolean;
  policyError: string;
};

export async function loadHolidays(): Promise<HrRulesModel> {
  const sb = db();
  const [h, l] = await Promise.all([
    sb.from('holidays').select('id, holiday_date, name').order('holiday_date'),
    readAll<{ type: string }>((a, b) => sb.from('leave_requests').select('type').range(a, b)),
  ]);
  if (h.error) throw new Error(`Could not read the holidays: ${h.error.message}`);
  let policyReady = true;
  let policyError = '';
  let lp: { type: string; annual_days: number | string | null; carry_forward_days: number | string | null; requires_approval: boolean | null; is_paid: boolean | null; updated_at: string | null }[] = [];
  let sal: { id: string; designation_id: string | null; name: string; monthly_gross: number | string; basic_pay: number | string; hra: number | string; allowances: number | string; deductions: number | string; net_pay: number | string; is_default: boolean | null; updated_at: string | null; designations: { name: string } | { name: string }[] | null }[] = [];
  let er: { id: string; designation_id: string | null; daily_allowance: number | string; receipt_threshold: number | string; monthly_ceiling: number | string | null; updated_at: string | null; designations: { name: string } | { name: string }[] | null }[] = [];
  try {
    [lp, sal, er] = await Promise.all([
      readAll<typeof lp[number]>((a, b) => sb.from('leave_policies').select('type, annual_days, carry_forward_days, requires_approval, is_paid, updated_at').range(a, b)),
      readAll<typeof sal[number]>((a, b) =>
        sb.from('salary_structures').select('id, designation_id, name, monthly_gross, basic_pay, hra, allowances, deductions, net_pay, is_default, updated_at, designations(name)').order('is_default', { ascending: false }).order('name').range(a, b)),
      readAll<typeof er[number]>((a, b) =>
        sb.from('expense_rules').select('id, designation_id, daily_allowance, receipt_threshold, monthly_ceiling, updated_at, designations(name)').order('designation_id', { nullsFirst: true }).range(a, b)),
    ]);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!/schema cache|could not find the table|leave_policies|salary_structures|expense_rules/i.test(message)) throw e;
    policyReady = false;
    policyError = sentence(message);
  }
  const counts = new Map<string, number>();
  for (const r of l) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
  return {
    holidays: (h.data ?? []).map(r => ({ id: r.id as string, date: r.holiday_date as string, name: r.name as string })),
    leaveTypes: [...counts].map(([type, requests]) => ({ type, requests })).sort((a, b) => b.requests - a.requests),
    leavePolicies: lp.map(r => ({ type: r.type, annual: Number(r.annual_days ?? 0), carry: Number(r.carry_forward_days ?? 0), approval: r.requires_approval !== false, paid: r.is_paid !== false, updatedAt: r.updated_at })),
    salary: sal.map(r => {
      const d = Array.isArray(r.designations) ? r.designations[0] : r.designations;
      return {
      id: r.id, designationId: r.designation_id, designation: d?.name ?? (r.designation_id ? 'This role' : 'Company default'), name: r.name,
      gross: Number(r.monthly_gross), basic: Number(r.basic_pay), hra: Number(r.hra), allowances: Number(r.allowances), deductions: Number(r.deductions), net: Number(r.net_pay),
      default: r.is_default === true, updatedAt: r.updated_at,
    }; }),
    expenseRules: er.map(r => {
      const d = Array.isArray(r.designations) ? r.designations[0] : r.designations;
      return {
      id: r.id, designationId: r.designation_id, designation: d?.name ?? (r.designation_id ? 'This role' : 'Company default'),
      allowance: Number(r.daily_allowance), billAbove: Number(r.receipt_threshold), ceiling: r.monthly_ceiling == null ? null : Number(r.monthly_ceiling), updatedAt: r.updated_at,
    }; }),
    policyReady,
    policyError,
  };
}

export const saveHoliday = (date: string, name: string) => call('upsert_holiday', { p_date: date, p_name: name.trim() });
export const saveLeavePolicy = (p: LeavePolicy) => call('save_leave_policy', { p_type: p.type, p_annual_days: p.annual, p_carry_forward_days: p.carry, p_requires_approval: p.approval, p_is_paid: p.paid });
export const saveSalaryStructure = (s: Omit<SalaryStructure, 'id' | 'designation' | 'updatedAt'> & { id?: string | null }) => call('save_salary_structure', {
  p_id: s.id ?? null, p_designation_id: s.designationId, p_name: s.name, p_monthly_gross: s.gross, p_basic_pay: s.basic, p_hra: s.hra, p_allowances: s.allowances, p_deductions: s.deductions, p_is_default: s.default,
});
export const saveExpenseRule = (r: Omit<ExpenseRule, 'id' | 'designation' | 'updatedAt'> & { id?: string | null }) => call('save_expense_rule', {
  p_id: r.id ?? null, p_designation_id: r.designationId, p_daily_allowance: r.allowance, p_receipt_threshold: r.billAbove, p_monthly_ceiling: r.ceiling,
});
export const mayManageHolidays = (role: string) => ['owner', 'admin', 'hr'].includes(role);

// ── audit log ─────────────────────────────────────────────────────────

export type AuditRow = { id: string; who: string; action: string; entity: string; label: string; before: string | null; after: string | null; reason: string | null; at: string };

export async function loadAudit(days: number): Promise<AuditRow[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = await readAll<{ id: string; actor_name: string | null; action: string; entity: string | null; entity_label: string | null; before_value: unknown; after_value: unknown; reason: string | null; at: string }>((a, b) =>
    db().from('audit_log').select('id, actor_name, action, entity, entity_label, before_value, after_value, reason, at').gte('at', since).order('at', { ascending: false }).range(a, b));
  const text = (v: unknown) => (v == null || v === '' ? null : typeof v === 'string' ? v : JSON.stringify(v));
  return rows.map(r => ({ id: r.id, who: r.actor_name ?? 'The system', action: r.action, entity: r.entity ?? '', label: r.entity_label ?? '', before: text(r.before_value), after: text(r.after_value), reason: r.reason, at: r.at }));
}

// ── help from Mr Sales ────────────────────────────────────────────────

export type Ticket = { id: string; type: string; priority: string; status: string; subject: string; raisedBy: string; at: string; updatedAt: string; dueAt: string | null };
export type TicketMessage = { id: string; at: string; author: string; fromUs: boolean; body: string };

export const TICKET_TYPE: Record<string, string> = {
  app_issue: 'Something is not working', data_issue: 'Data looks wrong', billing: 'Billing', onboarding: 'Setting up',
  training: 'Training', feature_request: 'A feature request', outage: 'The app is down',
};
export const TICKET_PRIORITY: Record<string, string> = { low: 'When you can', medium: 'This week', high: 'Today', urgent: 'Now, work has stopped' };

export async function loadTickets(): Promise<Ticket[]> {
  const rows = (await call('my_platform_tickets')) as { id: string; type: string; priority: string; status: string; subject: string; raised_by: string | null; created_at: string; updated_at: string; sla_due_at: string | null }[];
  return (rows ?? []).map(t => ({ id: t.id, type: t.type, priority: t.priority, status: t.status, subject: t.subject, raisedBy: t.raised_by ?? '', at: t.created_at, updatedAt: t.updated_at, dueAt: t.sla_due_at }));
}
export async function loadThread(id: string): Promise<TicketMessage[]> {
  const rows = (await call('my_platform_ticket_thread', { p_ticket: id })) as { id: string; at: string; author: string; from_mr_sales: boolean; body: string }[];
  return (rows ?? []).map(m => ({ id: m.id, at: m.at, author: m.author, fromUs: m.from_mr_sales, body: m.body }));
}
export const raiseTicket = (type: string, priority: string, subject: string, body: string) => call('raise_platform_ticket', { p_type: type, p_priority: priority, p_subject: subject, p_body: body });
export const replyTicket = (id: string, body: string) => call('reply_platform_ticket', { p_ticket: id, p_body: body });

// ── plan and billing ──────────────────────────────────────────────────

export type Invoice = { id: string; number: string; issued: string; due: string | null; from: string | null; to: string | null; plan: string; seats: number; amount: number; gst: number; total: number; paid: number; status: 'issued' | 'paid' | 'overdue' | 'cancelled' };
export type Billing = { plan: string | null; seats: number | null; used: number; status: string; invoices: Invoice[] };

export async function loadBilling(): Promise<Billing> {
  const [access, inv] = await Promise.all([call('my_org_access'), call('my_invoices')]);
  const a = (Array.isArray(access) ? access[0] : access) as { plan_code: string | null; seat_limit: number | null; seats_used: number; status: string } | null;
  return {
    plan: a?.plan_code ?? null, seats: a?.seat_limit ?? null, used: Number(a?.seats_used ?? 0), status: a?.status ?? 'active',
    invoices: ((inv ?? []) as { id: string; number: string; issue_date: string; due_date: string | null; period_start: string | null; period_end: string | null; plan_code: string; seats: number; amount: number | string; gst_percent: number | string; total: number | string; amount_paid: number | string; status: Invoice['status'] }[])
      .map(i => ({ id: i.id, number: i.number, issued: i.issue_date, due: i.due_date, from: i.period_start, to: i.period_end, plan: i.plan_code, seats: i.seats, amount: Number(i.amount), gst: Number(i.gst_percent), total: Number(i.total), paid: Number(i.amount_paid), status: i.status })),
  };
}
