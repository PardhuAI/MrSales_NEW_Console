import { fakeAuth } from './auth';

/**
 * A small stand-in for the Supabase client, over tables held in memory.
 *
 * Demo mode runs the same loaders as the live console against this, so every
 * screen has one code path and the demo world is one consistent company.
 * It supports the part of the query language the console uses, and refuses
 * the rest loudly: an embed the real API would call ambiguous fails here too,
 * so a demo that works is a fair sign the live query is well formed.
 */

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;
type Result = { data: unknown; error: { message: string } | null; count?: number | null };

/** Foreign keys of the live schema (column on `t` pointing at `ref`). */
export const FKS: [t: string, col: string, ref: string][] = [
  ['activities', 'client_id', 'clients'], ['activities', 'day_plan_id', 'day_plans'], ['activities', 'employee_id', 'employees'],
  ['activities', 'tour_day_id', 'tour_plan_days'], ['activity_products', 'activity_id', 'activities'],
  ['activity_rcpa_entries', 'activity_id', 'activities'], ['app_users', 'employee_id', 'employees'],
  ['approval_events', 'actor_id', 'employees'], ['areas', 'territory_id', 'territories'],
  ['clients', 'area_id', 'areas'], ['clients', 'cluster_id', 'clusters'], ['clients', 'owner_employee_id', 'employees'],
  ['clients', 'territory_id', 'territories'], ['clusters', 'area_id', 'areas'], ['complaints', 'assigned_to', 'employees'],
  ['complaints', 'client_id', 'clients'], ['complaints', 'employee_id', 'employees'], ['day_plans', 'area_id', 'areas'],
  ['day_plans', 'cluster_id', 'clusters'], ['day_plans', 'employee_id', 'employees'], ['documents', 'employee_id', 'employees'],
  ['documents', 'released_by', 'employees'], ['employees', 'designation_id', 'designations'], ['employees', 'manager_id', 'employees'],
  ['employees', 'territory_id', 'territories'], ['expenses', 'decided_by', 'employees'], ['expenses', 'employee_id', 'employees'],
  ['expense_rules', 'designation_id', 'designations'],
  ['export_jobs', 'requested_by', 'employees'], ['fake_location_attempts', 'client_id', 'clients'],
  ['fake_location_attempts', 'employee_id', 'employees'], ['leave_requests', 'decided_by', 'employees'],
  ['leave_requests', 'employee_id', 'employees'], ['manager_assignments', 'employee_id', 'employees'],
  ['manager_assignments', 'manager_id', 'employees'], ['notifications', 'employee_id', 'employees'],
  ['order_items', 'order_id', 'orders'], ['order_items', 'product_id', 'products'], ['orders', 'client_id', 'clients'],
  ['orders', 'decided_by', 'employees'], ['orders', 'employee_id', 'employees'], ['orders', 'stockist_id', 'stockists'],
  ['payslips', 'employee_id', 'employees'], ['salary_structures', 'designation_id', 'designations'], ['sales_records', 'client_id', 'clients'], ['sales_records', 'employee_id', 'employees'],
  ['sales_records', 'product_id', 'products'], ['stock_batches', 'product_id', 'products'], ['stockists', 'territory_id', 'territories'],
  ['survey_responses', 'employee_id', 'employees'], ['survey_responses', 'survey_id', 'surveys'], ['targets', 'employee_id', 'employees'],
  ['targets', 'product_id', 'products'], ['tasks', 'assignee_id', 'employees'], ['tasks', 'assigner_id', 'employees'],
  ['territories', 'region_id', 'regions'], ['territory_assignments', 'employee_id', 'employees'],
  ['territory_assignments', 'territory_id', 'territories'], ['tour_plan_days', 'area_id', 'areas'],
  ['tour_plan_days', 'employee_id', 'employees'], ['tour_plan_days', 'month_id', 'tour_plan_months'],
  ['tour_plan_months', 'decided_by', 'employees'], ['tour_plan_months', 'employee_id', 'employees'],
  ['travel_rates', 'employee_id', 'employees'], ['employee_expense_rules', 'employee_id', 'employees'], ['employee_salaries', 'employee_id', 'employees'],
  // views, joined the way PostgREST infers them
  ['report_visit_detail', 'employee_id', 'employees'], ['report_visit_detail', 'client_id', 'clients'],
  ['attendance_days', 'employee_id', 'employees'], ['current_reporting', 'employee_id', 'employees'],
];

// ── values ─────────────────────────────────────────────────────────────

const isTime = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v);
const isDay = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if ((isTime(a) || isTime(b)) && (isTime(a) || isDay(a)) && (isTime(b) || isDay(b))) {
    return Date.parse(String(a)) - Date.parse(String(b));
  }
  if (typeof a === 'number' || typeof b === 'number') return Number(a) - Number(b);
  return String(a) < String(b) ? -1 : 1;
}

const likeToRe = (p: string, flags: string) =>
  new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`, flags);

// ── select ─────────────────────────────────────────────────────────────

type Field =
  | { kind: 'col'; alias: string; name: string }
  | { kind: 'all' }
  | { kind: 'embed'; alias: string; table: string; hint?: string; inner: Field[]; inner_: boolean }
  | { kind: 'count'; alias: string; table: string };

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseSelect(s: string): Field[] {
  return splitTop(s.replace(/\s+/g, ' ')).map((item): Field => {
    if (item === '*') return { kind: 'all' };
    const m = /^(?:([\w]+):)?([\w]+)(?:!([\w]+))?(?:\((.*)\))?$/.exec(item);
    if (!m) throw new Error(`Cannot parse the select item "${item}"`);
    const [, alias, name, hint, inner] = m;
    if (inner === undefined) return { kind: 'col', alias: alias ?? name, name };
    if (inner.trim() === 'count') return { kind: 'count', alias: alias ?? name, table: name };
    const inner_ = hint === 'inner';
    return { kind: 'embed', alias: alias ?? name, table: name, hint: inner_ ? undefined : hint, inner: parseSelect(inner), inner_ };
  });
}

type Link = { many: boolean; local: string; remote: string };

function relation(parent: string, child: string, hint?: string): Link {
  const one = FKS.filter(([t, c, r]) => t === parent && r === child && (!hint || hint === c));
  const many = FKS.filter(([t, c, r]) => t === child && r === parent && (!hint || hint === c));
  const found = [...one.map(([, c]) => ({ many: false, local: c, remote: 'id' })), ...many.map(([, c]) => ({ many: true, local: 'id', remote: c }))];
  if (found.length === 0) throw new Error(`Could not find a relationship between '${parent}' and '${child}' in the schema cache`);
  if (found.length > 1) throw new Error(`Could not embed because more than one relationship was found for '${parent}' and '${child}'`);
  return found[0];
}

// ── the query ──────────────────────────────────────────────────────────

type Filter = (r: Row) => boolean;

export class Query implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean; nullsFirst?: boolean }[] = [];
  private span: [number, number] | null = null;
  private one: 'single' | 'maybe' | null = null;
  private fields: Field[] = [{ kind: 'all' }];
  private countMode = false;
  private head = false;
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: Row | Row[] | null = null;
  private returning = false;

  constructor(private db: FakeDb, private table: string) {}

  select(cols = '*', opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    this.fields = parseSelect(cols);
    if (opts?.count) this.countMode = true;
    if (opts?.head) this.head = true;
    if (this.op !== 'select') this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]) { this.op = 'insert'; this.payload = rows; return this; }
  upsert(rows: Row | Row[]) { this.op = 'upsert'; this.payload = rows; return this; }
  update(values: Row) { this.op = 'update'; this.payload = values; return this; }
  delete() { this.op = 'delete'; return this; }

  private add(f: Filter) { this.filters.push(f); return this; }
  eq(c: string, v: unknown) { return this.add(r => cmp(r[c], v) === 0 && r[c] != null); }
  neq(c: string, v: unknown) { return this.add(r => r[c] == null || cmp(r[c], v) !== 0); }
  gt(c: string, v: unknown) { return this.add(r => r[c] != null && cmp(r[c], v) > 0); }
  gte(c: string, v: unknown) { return this.add(r => r[c] != null && cmp(r[c], v) >= 0); }
  lt(c: string, v: unknown) { return this.add(r => r[c] != null && cmp(r[c], v) < 0); }
  lte(c: string, v: unknown) { return this.add(r => r[c] != null && cmp(r[c], v) <= 0); }
  in(c: string, vs: unknown[]) { return this.add(r => vs.some(v => cmp(r[c], v) === 0)); }
  is(c: string, v: null | boolean) { return this.add(r => (v === null ? r[c] == null : r[c] === v)); }
  like(c: string, p: string) { const re = likeToRe(p, ''); return this.add(r => re.test(String(r[c] ?? ''))); }
  ilike(c: string, p: string) { const re = likeToRe(p, 'i'); return this.add(r => re.test(String(r[c] ?? ''))); }
  contains(c: string, vs: unknown[]) { return this.add(r => Array.isArray(r[c]) && vs.every(v => (r[c] as unknown[]).includes(v))); }
  overlaps(c: string, vs: unknown[]) { return this.add(r => Array.isArray(r[c]) && vs.some(v => (r[c] as unknown[]).includes(v))); }
  not(c: string, op: string, v: unknown) {
    if (op === 'is') return this.add(r => (v === null ? r[c] != null : r[c] !== v));
    if (op === 'eq') return this.add(r => cmp(r[c], v) !== 0);
    if (op === 'in') {
      const list = String(v).replace(/^\(|\)$/g, '').split(',').map(x => x.trim().replace(/^"|"$/g, ''));
      return this.add(r => !list.includes(String(r[c])));
    }
    throw new Error(`The demo does not support not.${op}`);
  }
  /** "name.ilike.%x%,code.ilike.%x%" */
  or(expr: string) {
    const parts = splitTop(expr).map(p => {
      const [c, op, ...rest] = p.split('.');
      const v = rest.join('.');
      if (op === 'ilike') { const re = likeToRe(v.replace(/\*/g, '%'), 'i'); return (r: Row) => re.test(String(r[c] ?? '')); }
      if (op === 'eq') return (r: Row) => String(r[c]) === v;
      if (op === 'is') return (r: Row) => (v === 'null' ? r[c] == null : String(r[c]) === v);
      throw new Error(`The demo does not support or(${op})`);
    });
    return this.add(r => parts.some(f => f(r)));
  }
  match(obj: Row) { for (const [k, v] of Object.entries(obj)) this.eq(k, v); return this; }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending !== false, nullsFirst: opts?.nullsFirst });
    return this;
  }
  range(a: number, b: number) { this.span = [a, b]; return this; }
  limit(n: number) { this.span = [this.span?.[0] ?? 0, (this.span?.[0] ?? 0) + n - 1]; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  abortSignal() { return this; }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return new Promise<Result>(resolve => {
      // A tick of latency, like a network call, so loading states are real code paths.
      setTimeout(() => {
        try {
          resolve(this.run());
        } catch (e) {
          resolve({ data: null, error: { message: e instanceof Error ? e.message : String(e) }, count: null });
        }
      }, 60);
    }).then(ok, bad);
  }

  private run(): Result {
    if (this.op === 'insert' || this.op === 'upsert') {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map(r => ({ id: crypto.randomUUID(), ...r }));
      const t = this.db.mutable(this.table);
      for (const r of rows) {
        const at = this.op === 'upsert' ? t.findIndex(x => x.id === r.id) : -1;
        if (at >= 0) t[at] = { ...t[at], ...r };
        else t.push(r);
      }
      this.db.changed();
      return { data: this.returning ? this.shape(rows) : null, error: null };
    }
    let rows = this.db.rows(this.table).filter(r => this.filters.every(f => f(r)));
    if (this.op === 'update') {
      const t = this.db.mutable(this.table);
      for (const r of rows) Object.assign(t.find(x => x === r) ?? r, this.payload);
      this.db.changed();
      return { data: this.returning ? this.shape(rows) : null, error: null };
    }
    if (this.op === 'delete') {
      const t = this.db.mutable(this.table);
      const gone = new Set(rows);
      this.db.replace(this.table, t.filter(r => !gone.has(r)));
      return { data: this.returning ? this.shape(rows) : null, error: null };
    }
    for (const o of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        if (a[o.col] == null && b[o.col] != null) return o.nullsFirst ?? !o.asc ? -1 : 1;
        if (b[o.col] == null && a[o.col] != null) return o.nullsFirst ?? !o.asc ? 1 : -1;
        const c = cmp(a[o.col], b[o.col]);
        return o.asc ? c : -c;
      });
    }
    const count = rows.length;
    if (this.span) rows = rows.slice(this.span[0], this.span[1] + 1);
    if (this.head) return { data: null, error: null, count };
    const data = this.shape(rows);
    if (this.one) {
      if (data.length > 1) throw new Error('JSON object requested, multiple (or no) rows returned');
      if (!data.length && this.one === 'single') throw new Error('JSON object requested, multiple (or no) rows returned');
      return { data: data[0] ?? null, error: null, count: this.countMode ? count : null };
    }
    return { data, error: null, count: this.countMode ? count : null };
  }

  private shape(rows: Row[]): Row[] {
    return rows.map(r => project(this.db, this.table, r, this.fields)).filter((r): r is Row => r !== null);
  }
}

function project(db: FakeDb, table: string, row: Row, fields: Field[]): Row | null {
  const out: Row = {};
  for (const f of fields) {
    if (f.kind === 'all') Object.assign(out, row);
    else if (f.kind === 'col') out[f.alias] = row[f.name] ?? null;
    else if (f.kind === 'count') {
      const link = relation(table, f.table);
      out[f.alias] = [{ count: db.rows(f.table).filter(c => c[link.remote] === row[link.local]).length }];
    } else {
      const link = relation(table, f.table, f.hint);
      const matches = db.rows(f.table).filter(c => c[link.remote] != null && c[link.remote] === row[link.local]);
      if (link.many) out[f.alias] = matches.map(m => project(db, f.table, m, f.inner));
      else out[f.alias] = matches[0] ? project(db, f.table, matches[0], f.inner) : null;
      if (f.inner_ && (link.many ? !matches.length : !matches[0])) return null;
    }
  }
  return out;
}

// ── the database ───────────────────────────────────────────────────────

export type Rpc = (args: Record<string, unknown>, db: FakeDb) => unknown;
export type View = (db: FakeDb) => Row[];

export class FakeDb {
  private version = 0;
  private cache = new Map<string, { v: number; rows: Row[] }>();
  constructor(
    private tables: Tables,
    private views: Record<string, View>,
    private rpcs: Record<string, Rpc>,
  ) {}
  rows(name: string): Row[] {
    if (this.tables[name]) return this.tables[name];
    const view = this.views[name];
    if (!view) throw new Error(`relation "public.${name}" does not exist`);
    const hit = this.cache.get(name);
    if (hit && hit.v === this.version) return hit.rows;
    const rows = view(this);
    this.cache.set(name, { v: this.version, rows });
    return rows;
  }
  mutable(name: string): Row[] {
    if (!this.tables[name]) this.tables[name] = [];
    return this.tables[name];
  }
  replace(name: string, rows: Row[]) {
    this.tables[name] = rows;
    this.changed();
  }
  changed() {
    this.version++;
  }
  call(name: string, args: Record<string, unknown>): unknown {
    const f = this.rpcs[name];
    if (!f) throw new Error(`${name} is not available in the demo.`);
    const out = f(args ?? {}, this);
    this.changed();
    return out;
  }
}

/** The subset of SupabaseClient the console calls, backed by a FakeDb. */
export function fakeClient(db: FakeDb, user: { id: string; email: string }) {
  const auth = fakeAuth(user);
  const later = <T>(f: () => T) => new Promise<T>(r => setTimeout(() => r(f()), 60));
  const bill = (path: string) => `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#f5f5f7"/><text x="300" y="380" font-family="sans-serif" font-size="22" text-anchor="middle" fill="#6e6e73">Demo file</text><text x="300" y="420" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#86868b">${path.split('/').pop()}</text></svg>`,
  )}`;
  return {
    from: (table: string) => new Query(db, table),
    rpc: (name: string, args: Record<string, unknown> = {}) => later(() => {
      try {
        return { data: db.call(name, args), error: null };
      } catch (e) {
        return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
      }
    }),
    storage: {
      from: () => ({
        createSignedUrl: (path: string) => later(() => ({ data: { signedUrl: bill(path) }, error: null })),
        createSignedUrls: (paths: string[]) => later(() => ({ data: paths.map(p => ({ path: p, signedUrl: bill(p), error: null })), error: null })),
        upload: (path: string) => later(() => ({ data: { path }, error: null })),
        remove: (paths: string[]) => later(() => ({ data: paths, error: null })),
      }),
    },
    // Edge functions answer from the same registry, under "fn:<name>".
    functions: {
      invoke: (name: string, opts: { body?: Record<string, unknown> } = {}) => later(() => {
        try {
          return { data: db.call(`fn:${name}`, opts.body ?? {}), error: null };
        } catch (e) {
          return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
        }
      }),
    },
    auth: {
      ...auth,
      getUser: () => later(() => ({ data: { user }, error: null })),
      getSession: () => later(() => ({ data: { session: null }, error: null })),
    },
  };
}
