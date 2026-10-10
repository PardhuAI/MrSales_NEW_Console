import { db, readAll } from './client';
import { loadEmployees } from './people';
import { loadGeo } from './geo';
import { IST_TODAY, daysBetween, monShort } from '../lib/days';
import type { SheetReport } from '../lib/sheetReport';

/**
 * The Sales section, from sales_records, targets, orders and their lines,
 * products, stockists, stock batches and the prescription audit entries.
 *
 * Primary sales are the recorded sales (imported, company to stockist).
 * Secondary sales are the approved field orders: decide_orders writes each
 * approved line to sales_records with source 'order'. Achievement against a
 * target counts every recorded sale, as the old console and the Dashboard do.
 * (The old console showed "secondary" as 80% of primary, a figure nobody
 * recorded; it is not repeated here.)
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
export const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
export const monthName = (k: string, long = true) => {
  const d = new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, 1);
  return long ? d.toLocaleDateString('en-IN', { month: 'long' }) : monShort(d);
};
export const monthsBack = (n: number) => {
  const [y, m] = IST_TODAY().split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - (n - 1 - i), 1);
    return monthKey(d.getFullYear(), d.getMonth() + 1);
  });
};

// ── sales ─────────────────────────────────────────────────────────────

export type SalesModel = {
  months: string[];
  /** Per month, company-wide: primary, field orders, target. */
  year: { month: string; primary: number; orders: number; target: number }[];
  people: {
    id: string; name: string; code: string; hq: string; manager: string; managerId: string | null;
    byMonth: Record<string, { primary: number; orders: number; target: number }>;
  }[];
  unassigned: Record<string, number>;
};

export async function loadSales(): Promise<SalesModel> {
  const sb = db();
  const months = monthsBack(12);
  const [employees, sales, targets] = await Promise.all([
    loadEmployees(),
    readAll<{ employee_id: string | null; sale_date: string; amount: number; source: string }>((a, b) =>
      sb.from('sales_records').select('employee_id, sale_date, amount, source').gte('sale_date', `${months[0]}-01`).range(a, b)),
    readAll<{ employee_id: string; period_year: number; period_month: number; amount: number }>((a, b) =>
      sb.from('targets').select('employee_id, period_year, period_month, amount').gte('period_year', Number(months[0].slice(0, 4))).range(a, b)),
  ]);
  const people = new Map<string, SalesModel['people'][number]>();
  const unassigned: Record<string, number> = {};
  const row = (id: string) => {
    if (!people.has(id)) {
      const e = employees.get(id);
      people.set(id, { id, name: e?.name ?? 'Someone no longer here', code: e?.code ?? '', hq: e?.hq ?? '', manager: e?.managerId ? e.manager : '', managerId: e?.managerId ?? null, byMonth: {} });
    }
    return people.get(id)!;
  };
  const cell = (id: string, m: string) => (row(id).byMonth[m] ??= { primary: 0, orders: 0, target: 0 });
  for (const s of sales) {
    const m = s.sale_date.slice(0, 7);
    if (!months.includes(m)) continue;
    if (!s.employee_id) {
      unassigned[m] = (unassigned[m] ?? 0) + Number(s.amount);
      continue;
    }
    const c = cell(s.employee_id, m);
    if (s.source === 'order') c.orders += Number(s.amount);
    else c.primary += Number(s.amount);
  }
  for (const t of targets) {
    const m = monthKey(t.period_year, t.period_month);
    if (months.includes(m)) cell(t.employee_id, m).target += Number(t.amount);
  }
  const list = [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    months,
    year: months.map(m => ({
      month: m,
      primary: list.reduce((s, p) => s + (p.byMonth[m]?.primary ?? 0), 0) + (unassigned[m] ?? 0),
      orders: list.reduce((s, p) => s + (p.byMonth[m]?.orders ?? 0), 0),
      target: list.reduce((s, p) => s + (p.byMonth[m]?.target ?? 0), 0),
    })),
    people: list,
    unassigned,
  };
}

// ── orders ────────────────────────────────────────────────────────────

export type OrderLine = { product: string; sku: string; quantity: number; unitPrice: number; free: boolean; lineTotal: number; gst: number };
export type OrderRow = {
  id: string; number: string; status: string; at: string; submittedAt: string | null; decidedAt: string | null;
  personId: string; person: string; managerId: string | null;
  clientId: string; client: string; clientType: string;
  stockistId: string | null; stockist: string; slab: number | null;
  subtotal: number; discount: number; gstAmount: number; total: number;
  lines: OrderLine[];
  trail: { action: string; by: string; reason: string | null; at: string }[];
};

export async function loadOrders(): Promise<{ orders: OrderRow[]; stockists: { id: string; name: string }[] }> {
  const sb = db();
  const [employees, orders, events, stockists] = await Promise.all([
    loadEmployees(),
    readAll<{ id: string; status: string; created_at: string; submitted_at: string | null; decided_at: string | null; employee_id: string; client_id: string; stockist_id: string | null; discount_percent: number; gst_amount: number; subtotal: number; total: number; clients: { name: string; type: string } | null; stockists: { name: string } | null; order_items: { quantity: number; unit_price: number; is_foc: boolean; line_total: number; products: { name: string; sku: string; gst_percent: number } | null }[] }>((a, b) =>
      sb.from('orders').select('id, status, created_at, submitted_at, decided_at, employee_id, client_id, stockist_id, discount_percent, gst_amount, subtotal, total, clients(name, type), stockists(name), order_items(quantity, unit_price, is_foc, line_total, products(name, sku, gst_percent))')
        .order('created_at', { ascending: false }).range(a, b) as never),
    readAll<{ entity_id: string; action: string; actor_name: string; reason: string | null; at: string }>((a, b) =>
      sb.from('approval_events').select('entity_id, action, actor_name, reason, at').eq('entity', 'order').order('at').range(a, b)),
    sb.from('stockists').select('id, name').order('name'),
  ]);
  const trail = new Map<string, OrderRow['trail']>();
  for (const e of events) trail.set(e.entity_id, [...(trail.get(e.entity_id) ?? []), { action: e.action, by: e.actor_name, reason: e.reason, at: e.at }]);
  return {
    orders: orders.map(o => ({
      id: o.id, number: o.id.slice(0, 8).toUpperCase(), status: o.status, at: o.created_at, submittedAt: o.submitted_at, decidedAt: o.decided_at,
      personId: o.employee_id, person: employees.get(o.employee_id)?.name ?? 'Someone no longer here', managerId: employees.get(o.employee_id)?.managerId ?? null,
      clientId: o.client_id, client: o.clients?.name ?? 'A client no longer on the list', clientType: o.clients?.type ?? '',
      stockistId: o.stockist_id, stockist: o.stockists?.name ?? '', slab: null,
      subtotal: Number(o.subtotal), discount: Number(o.discount_percent), gstAmount: Number(o.gst_amount), total: Number(o.total),
      lines: (o.order_items ?? []).map(i => ({ product: i.products?.name ?? 'A product', sku: i.products?.sku ?? '', quantity: i.quantity, unitPrice: Number(i.unit_price), free: i.is_foc, lineTotal: Number(i.line_total), gst: Number(i.products?.gst_percent ?? 0) })),
      trail: trail.get(o.id) ?? [],
    })),
    stockists: (must(stockists, 'stockists') ?? []) as { id: string; name: string }[],
  };
}

export async function decideOrders(ids: string[], approve: boolean, reason: string) {
  await call('decide_orders', { p_ids: ids, p_approve: approve, p_reason: reason || null });
}

// ── targets ───────────────────────────────────────────────────────────

export type TargetsModel = {
  months: string[];
  people: { id: string; name: string; code: string; hq: string; cells: Record<string, { target: number; sold: number; products: number }> }[];
  products: { id: string; name: string; sku: string }[];
};

export async function loadTargets(): Promise<TargetsModel> {
  const sb = db();
  const months = monthsBack(6).concat((() => {
    const [y, m] = IST_TODAY().split('-').map(Number);
    const d = new Date(y, m, 1);
    return [monthKey(d.getFullYear(), d.getMonth() + 1)];
  })());
  const [employees, targets, sales, products] = await Promise.all([
    loadEmployees(),
    readAll<{ employee_id: string; product_id: string | null; period_year: number; period_month: number; amount: number }>((a, b) =>
      sb.from('targets').select('employee_id, product_id, period_year, period_month, amount').gte('period_year', Number(months[0].slice(0, 4))).range(a, b)),
    readAll<{ employee_id: string | null; sale_date: string; amount: number }>((a, b) =>
      sb.from('sales_records').select('employee_id, sale_date, amount').gte('sale_date', `${months[0]}-01`).range(a, b)),
    sb.from('products').select('id, name, sku, status').eq('status', 'active').order('name'),
  ]);
  const field = [...employees.values()].filter(e => e.status === 'active' && e.role === 'MR');
  const withTarget = new Set(targets.map(t => t.employee_id));
  const people = [...field, ...[...employees.values()].filter(e => withTarget.has(e.id) && !field.includes(e) && e.status === 'active')];
  return {
    months,
    products: (must(products, 'products') ?? []) as { id: string; name: string; sku: string }[],
    people: people.map(e => {
      const cells: TargetsModel['people'][number]['cells'] = {};
      for (const m of months) cells[m] = { target: 0, sold: 0, products: 0 };
      for (const t of targets.filter(x => x.employee_id === e.id)) {
        const m = monthKey(t.period_year, t.period_month);
        if (!cells[m]) continue;
        cells[m].target += Number(t.amount);
        if (t.product_id) cells[m].products++;
      }
      for (const s of sales.filter(x => x.employee_id === e.id)) {
        const m = s.sale_date.slice(0, 7);
        if (cells[m]) cells[m].sold += Number(s.amount);
      }
      return { id: e.id, name: e.name, code: e.code, hq: e.hq, cells };
    }).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** One call per person, as the old console's bulk assign did; assign_target replaces an existing figure. */
export async function assignTargets(employeeIds: string[], productId: string | null, month: string, amount: number) {
  const [y, m] = month.split('-').map(Number);
  for (const id of employeeIds) await call('assign_target', { p_employee_id: id, p_product_id: productId, p_year: y, p_month: m, p_amount: amount });
}

// ── prescription audit ────────────────────────────────────────────────

export type RcpaModel = {
  entries: { personId: string; product: string; productId: string; ours: number; competitor: string | null; theirs: number; at: string }[];
  callsDone: number;
  callsWithAudit: number;
  people: { id: string; name: string }[];
};

export async function loadRcpa(days = 90): Promise<RcpaModel> {
  const sb = db();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [employees, entries, done] = await Promise.all([
    loadEmployees(),
    readAll<{ product_id: string; product_name: string; own_quantity: number; competitor_name: string | null; competitor_quantity: number; activities: { employee_id: string; actual_start: string | null; scheduled_start: string } | null }>((a, b) =>
      sb.from('activity_rcpa_entries').select('product_id, product_name, own_quantity, competitor_name, competitor_quantity, activities!inner(employee_id, actual_start, scheduled_start)')
        .range(a, b) as never),
    readAll<{ id: string; employee_id: string; activity_rcpa_entries: { count: number }[] }>((a, b) =>
      sb.from('activities').select('id, employee_id, activity_rcpa_entries(count)').eq('status', 'completed').gte('scheduled_start', since).range(a, b) as never),
  ]);
  const inWindow = entries.filter(e => e.activities && (e.activities.actual_start ?? e.activities.scheduled_start) >= since);
  const who = new Set(inWindow.map(e => e.activities!.employee_id));
  return {
    entries: inWindow.map(e => ({ personId: e.activities!.employee_id, product: e.product_name, productId: e.product_id, ours: e.own_quantity, competitor: e.competitor_name?.trim() || null, theirs: e.competitor_quantity, at: e.activities!.actual_start ?? e.activities!.scheduled_start })),
    callsDone: done.length,
    callsWithAudit: done.filter(d => (d.activity_rcpa_entries?.[0]?.count ?? 0) > 0).length,
    people: [...who].map(id => ({ id, name: employees.get(id)?.name ?? 'Someone no longer here' })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ── products ──────────────────────────────────────────────────────────

export type Product = { id: string; sku: string; name: string; pack: string | null; mrp: number | null; pts: number | null; gst: number; status: 'draft' | 'active' | 'retired'; ordered: number; createdAt: string };

export async function loadProducts(): Promise<Product[]> {
  const sb = db();
  const [products, items] = await Promise.all([
    sb.from('products').select('id, sku, name, pack_size, mrp, pts, gst_percent, status, created_at').order('name'),
    readAll<{ product_id: string }>((a, b) => sb.from('order_items').select('product_id').range(a, b)),
  ]);
  const count = new Map<string, number>();
  for (const i of items) count.set(i.product_id, (count.get(i.product_id) ?? 0) + 1);
  return ((must(products, 'products') ?? []) as { id: string; sku: string; name: string; pack_size: string | null; mrp: number | null; pts: number | null; gst_percent: number; status: string; created_at: string }[])
    .map(p => ({ id: p.id, sku: p.sku, name: p.name, pack: p.pack_size, mrp: p.mrp == null ? null : Number(p.mrp), pts: p.pts == null ? null : Number(p.pts), gst: Number(p.gst_percent), status: p.status as Product['status'], ordered: count.get(p.id) ?? 0, createdAt: p.created_at }));
}

export const createProduct = async (p: { sku: string; name: string; pack: string | null; mrp: number; pts: number | null; gst: number }) =>
  (await call('create_product', { p_sku: p.sku, p_name: p.name, p_pack_size: p.pack, p_mrp: p.mrp, p_pts: p.pts, p_gst_percent: p.gst, p_id: crypto.randomUUID() })) as string;
/** The pack size is fixed once a product exists, so it is never sent. */
export const updateProduct = async (id: string, p: { sku: string; name: string; mrp: number; pts: number | null; gst: number }) =>
  (await call('update_product', { p_id: id, p_sku: p.sku, p_name: p.name, p_pack_size: null, p_mrp: p.mrp, p_pts: p.pts, p_gst_percent: p.gst })) as string;
export const setProductStatus = async (id: string, status: Product['status']) => (await call('set_product_status', { p_id: id, p_status: status })) as string;

export async function productSheet(): Promise<Record<string, unknown>[]> {
  const { data, error } = await db().from('products').select('id, sku, name, pack_size, mrp, pts, gst_percent, is_active').order('sku');
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}
export const importProducts = async (rows: Record<string, string>[], commit: boolean) => (await call('import_products', { p_rows: rows, p_commit: commit })) as SheetReport;

// ── stockists ─────────────────────────────────────────────────────────

export type Stockist = {
  id: string; code: string; name: string; city: string | null; state: string | null; gstin: string | null; contactPerson: string | null;
  phone: string | null; email: string | null; address: string | null; territoryId: string | null; territory: string; status: 'active' | 'inactive';
  orders: number; orderValue: number; lastOrder: string | null;
};

export async function loadStockists(): Promise<{ stockists: Stockist[]; ordersWithout: number; territories: { id: string; name: string }[] }> {
  const sb = db();
  const [rows, geo, orders] = await Promise.all([
    sb.from('stockists').select('id, code, name, city, state, gstin, contact_person, phone, email, address, territory_id, status').order('name'),
    loadGeo(),
    readAll<{ stockist_id: string | null; total: number; created_at: string; status: string }>((a, b) => sb.from('orders').select('stockist_id, total, created_at, status').range(a, b)),
  ]);
  const territory = new Map(geo.territories.map(t => [t.id, t.name]));
  return {
    stockists: ((must(rows, 'stockists') ?? []) as { id: string; code: string; name: string; city: string | null; state: string | null; gstin: string | null; contact_person: string | null; phone: string | null; email: string | null; address: string | null; territory_id: string | null; status: string }[]).map(s => {
      const mine = orders.filter(o => o.stockist_id === s.id);
      return {
        id: s.id, code: s.code, name: s.name, city: s.city, state: s.state, gstin: s.gstin, contactPerson: s.contact_person, phone: s.phone, email: s.email,
        address: s.address, territoryId: s.territory_id, territory: s.territory_id ? territory.get(s.territory_id) ?? '' : '', status: s.status === 'inactive' ? 'inactive' : 'active',
        orders: mine.length, orderValue: mine.filter(o => o.status !== 'rejected').reduce((t, o) => t + Number(o.total), 0), lastOrder: mine.map(o => o.created_at).sort().pop() ?? null,
      };
    }),
    ordersWithout: orders.filter(o => !o.stockist_id && o.status !== 'draft').length,
    territories: geo.territories.map(t => ({ id: t.id, name: t.name })),
  };
}

export type StockistInput = { code: string; name: string; city: string; state: string; gstin: string; contactPerson: string; phone: string; email: string; address: string; territoryId: string | null };
export const createStockist = async (s: StockistInput) => (await call('create_stockist', {
  p_code: s.code, p_name: s.name, p_city: s.city || null, p_state: s.state || null, p_gstin: s.gstin || null, p_contact_person: s.contactPerson || null,
  p_phone: s.phone || null, p_email: s.email || null, p_address: s.address || null, p_territory_id: s.territoryId, p_id: crypto.randomUUID(),
})) as string;
/** The code is fixed once a stockist exists, so it is never sent. */
export const updateStockist = async (id: string, s: StockistInput) => (await call('update_stockist', {
  p_id: id, p_code: null, p_name: s.name, p_city: s.city, p_state: s.state, p_gstin: s.gstin, p_contact_person: s.contactPerson,
  p_phone: s.phone, p_email: s.email, p_address: s.address, p_territory_id: s.territoryId,
})) as string;
export const setStockistStatus = async (id: string, status: 'active' | 'inactive') => (await call('set_stockist_status', { p_id: id, p_status: status })) as string;

// ── stock ─────────────────────────────────────────────────────────────

export type Batch = { id: string; productId: string; product: string; sku: string; batch: string; expiry: string | null; quantity: number; pts: number | null; daysLeft: number | null };

export async function loadStock(): Promise<{ batches: Batch[]; products: { id: string; name: string; sku: string; status: string }[] }> {
  const sb = db();
  const today = IST_TODAY();
  const [batches, products] = await Promise.all([
    sb.from('stock_batches').select('id, product_id, batch_no, expiry_date, quantity, products(name, sku, pts)').order('expiry_date'),
    sb.from('products').select('id, name, sku, status').order('name'),
  ]);
  return {
    batches: ((must(batches, 'stock') ?? []) as unknown as { id: string; product_id: string; batch_no: string; expiry_date: string | null; quantity: number; products: { name: string; sku: string; pts: number | null } | null }[])
      .map(b => ({ id: b.id, productId: b.product_id, product: b.products?.name ?? 'A product', sku: b.products?.sku ?? '', batch: b.batch_no, expiry: b.expiry_date, quantity: b.quantity, pts: b.products?.pts == null ? null : Number(b.products.pts), daysLeft: b.expiry_date ? daysBetween(today, b.expiry_date) : null })),
    products: (must(products, 'products') ?? []) as { id: string; name: string; sku: string; status: string }[],
  };
}

export const recordStock = async (productId: string, batch: string, expiry: string, quantity: number) =>
  (await call('record_stock', { p_product_id: productId, p_batch_no: batch, p_expiry_date: expiry, p_quantity: quantity })) as string;
