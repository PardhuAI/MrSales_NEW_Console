import type { FakeDb, Row, Rpc } from './engine';

/**
 * The write functions of the live database, done in memory for the demo, with
 * the same rules and the same refusals (see Mr_Sales_Web/supabase/migrations).
 * Registered into the demo database by index.ts.
 */

const ORG = '0d3a1f00-demo-4000-8000-c1e0c0e00001';
const now = () => new Date().toISOString();
const fail = (m: string): never => {
  throw new Error(m);
};
const trimOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const find = (db: FakeDb, t: string, id: unknown) => db.rows(t).find(r => r.id === id);

export function clientRpcs(audit: (db: FakeDb, action: string, entity: string, label: string, before?: unknown, after?: unknown, reason?: unknown) => void): Record<string, Rpc> {
  const clientFields = (a: Record<string, unknown>, db: FakeDb): Row => {
    if (!trimOrNull(a.p_name)) fail('a client needs a name');
    const area = find(db, 'areas', a.p_area_id) ?? fail('that area is not in your organisation');
    const listing = a.p_listing === 'unlisted' ? 'unlisted' : 'listed';
    return {
      name: String(a.p_name).trim(), type: a.p_type, category: a.p_category || 'regular', listing,
      is_active: listing === 'listed' ? a.p_is_active ?? true : null,
      specialty: trimOrNull(a.p_specialty), designation: trimOrNull(a.p_designation), area_id: area.id, territory_id: area.territory_id,
      cluster_id: a.p_cluster_id ?? null, mobile: trimOrNull(a.p_mobile), email: trimOrNull(a.p_email), contact_person: trimOrNull(a.p_contact_person),
      address_line: trimOrNull(a.p_address_line), city: trimOrNull(a.p_city), pincode: trimOrNull(a.p_pincode),
      lat: a.p_lat ?? null, lng: a.p_lng ?? null, special_date: a.p_special_date ?? null, special_occasion: a.p_special_occasion ?? null,
      special_occasion_note: trimOrNull(a.p_special_occasion_note), updated_at: now(),
    };
  };
  return {
    create_client: (a, db) => {
      const row = { id: a.p_id ?? crypto.randomUUID(), org_id: ORG, ...clientFields(a, db), owner_employee_id: a.p_owner_employee_id ?? null, total_visits: 0, last_visit_at: null, next_planned_visit_at: null, created_at: now() };
      db.mutable('clients').push(row);
      return row.id;
    },
    update_client: (a, db) => {
      const row = find(db, 'clients', a.p_id) ?? fail('no client you may see has that id');
      Object.assign(row, clientFields(a, db));
      return null;
    },
    set_client_listing: (a, db) => {
      const row = find(db, 'clients', a.p_id) ?? fail('no client you may see has that id');
      row.listing = a.p_listing;
      row.is_active = a.p_listing === 'listed' ? a.p_active ?? true : null;
      return a.p_listing === 'unlisted' ? `${row.name} is off the company list.` : row.is_active ? `${row.name} is on the company list.` : `${row.name} is retired: still on the list, no longer called on.`;
    },
    create_client_specialty: (a, db) => {
      const name = trimOrNull(a.p_name) ?? fail('a specialty needs a name');
      if (db.rows('client_specialties').some(s => String(s.name).toLowerCase() === name.toLowerCase())) fail(`${name} is already on the list`);
      db.mutable('client_specialties').push({ id: crypto.randomUUID(), org_id: ORG, name });
      return `${name} added.`;
    },
    delete_client_specialty: (a, db) => {
      const s = find(db, 'client_specialties', a.p_id) ?? fail('that specialty is not on the list');
      const n = db.rows('clients').filter(c => c.specialty === s.name).length;
      if (n) fail(`${n} ${n === 1 ? 'client is' : 'clients are'} listed as ${s.name}; change them first`);
      db.replace('client_specialties', db.rows('client_specialties').filter(x => x !== s));
      return `${s.name} removed.`;
    },
    import_clients: (a, db) => {
      const rows = (a.p_rows as Record<string, string>[]) ?? [];
      const errors: { row: number; field: string; message: string }[] = [];
      const areas = db.rows('areas');
      let create = 0;
      let update = 0;
      rows.forEach((r, i) => {
        const n = i + 2;
        if (!r.name?.trim()) errors.push({ row: n, field: 'Name', message: 'is required' });
        if (r.type && !['doctor', 'hospital', 'chemist', 'stockist', 'diagnostics', 'other'].includes(r.type.toLowerCase())) errors.push({ row: n, field: 'Type', message: `"${r.type}" is not a client type` });
        if (!areas.some(x => String(x.name).toLowerCase() === (r.area ?? '').toLowerCase())) errors.push({ row: n, field: 'Area', message: r.area ? `no area called "${r.area}"` : 'is required' });
        if (r.id) {
          if (!find(db, 'clients', r.id)) errors.push({ row: n, field: 'Id', message: 'no client has this id' });
          else update++;
        } else create++;
      });
      const committed = Boolean(a.p_commit) && errors.length === 0;
      if (committed) {
        for (const r of rows) {
          const area = areas.find(x => String(x.name).toLowerCase() === r.area.toLowerCase())!;
          const owner = r.owner ? db.rows('employees').find(e => e.code === r.owner)?.id ?? null : null;
          const fields = { name: r.name.trim(), type: (r.type || 'doctor').toLowerCase(), category: r.category || 'regular', listing: r.listing === 'unlisted' ? 'unlisted' : 'listed', area_id: area.id, territory_id: area.territory_id, specialty: r.specialty || null, mobile: r.mobile || null, city: r.city || null, owner_employee_id: owner };
          const existing = r.id ? find(db, 'clients', r.id) : null;
          if (existing) Object.assign(existing, fields);
          else db.mutable('clients').push({ id: crypto.randomUUID(), org_id: ORG, ...fields, is_active: true, lat: null, lng: null, total_visits: 0, created_at: now(), updated_at: now() });
        }
        audit(db, 'imported a client sheet', 'Client', `${rows.length} rows`);
      }
      return { sheet: 'clients', total: rows.length, create, update, rejected: new Set(errors.map(e => e.row)).size, committed, errors };
    },
    decide_complaint: (a, db) => {
      const row = find(db, 'complaints', a.p_id) ?? fail('complaint not found');
      const map: Record<string, string> = { open: 'open', inprogress: 'inProgress', 'in review': 'inProgress', resolved: 'resolved', closed: 'closed' };
      const status = map[String(a.p_status).toLowerCase()] ?? fail(`unknown complaint status ${a.p_status}`);
      Object.assign(row, { status, assigned_to: a.p_assigned_to ?? row.assigned_to, resolution: a.p_resolution == null ? row.resolution : trimOrNull(a.p_resolution), updated_at: now() });
      return null;
    },
  };
}

export function salesRpcs(audit: (db: FakeDb, action: string, entity: string, label: string, before?: unknown, after?: unknown, reason?: unknown) => void): Record<string, Rpc> {
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const product = (db: FakeDb, id: unknown) => find(db, 'products', id) ?? fail('no such product in this organisation');
  return {
    assign_target: (a, db) => {
      if (!find(db, 'employees', a.p_employee_id)) fail('employee is not in this organisation');
      const t = db.mutable('targets');
      const hit = t.find(x => x.employee_id === a.p_employee_id && (x.product_id ?? null) === (a.p_product_id ?? null) && x.period_year === a.p_year && x.period_month === a.p_month);
      if (hit) hit.amount = a.p_amount;
      else t.push({ id: crypto.randomUUID(), org_id: ORG, employee_id: a.p_employee_id, product_id: a.p_product_id ?? null, period_year: a.p_year, period_month: a.p_month, amount: a.p_amount });
      return hit?.id ?? t[t.length - 1].id;
    },
    create_product: (a, db) => {
      const sku = trimOrNull(a.p_sku) ?? fail('a product needs a code');
      if (db.rows('products').some(p => String(p.sku).toLowerCase() === sku.toLowerCase())) fail(`another product already uses the code ${sku}`);
      const id = a.p_id ?? crypto.randomUUID();
      db.mutable('products').push({ id, org_id: ORG, sku, name: trimOrNull(a.p_name) ?? fail('a product needs a name'), pack_size: trimOrNull(a.p_pack_size), mrp: a.p_mrp, pts: a.p_pts, gst_percent: a.p_gst_percent ?? 12, is_active: true, status: 'active', created_at: now() });
      audit(db, 'added a product', 'Product', `${sku} · ${a.p_name}`);
      return id;
    },
    update_product: (a, db) => {
      const p = product(db, a.p_id);
      const sku = trimOrNull(a.p_sku);
      if (sku && db.rows('products').some(x => x.id !== p.id && String(x.sku).toLowerCase() === sku.toLowerCase())) fail(`another product already uses the code ${sku}`);
      if (a.p_gst_percent != null && (Number(a.p_gst_percent) < 0 || Number(a.p_gst_percent) > 100)) fail('GST must be between 0 and 100');
      Object.assign(p, { sku: sku ?? p.sku, name: trimOrNull(a.p_name) ?? p.name, mrp: a.p_mrp ?? p.mrp, pts: a.p_pts ?? p.pts, gst_percent: a.p_gst_percent ?? p.gst_percent });
      audit(db, 'corrected a product', 'Product', `${p.sku} · ${p.name}`);
      return `${p.name} saved.`;
    },
    set_product_status: (a, db) => {
      const p = product(db, a.p_id);
      const to = String(a.p_status);
      if (p.status === to) return `${p.name} is already ${to}.`;
      const n = db.rows('order_items').filter(i => i.product_id === p.id).length;
      if (to === 'draft' && n) fail(`${p.name} has been ordered ${n} times; it can be retired, but not returned to draft`);
      audit(db, `moved a product to ${to}`, 'Product', `${p.sku} · ${p.name}`, p.status, to);
      p.status = to;
      p.is_active = to === 'active';
      return to === 'active' ? `${p.name} is on sale.` : to === 'draft' ? `${p.name} is back in draft. Nobody can order it.` : `${p.name} is retired. Orders that already name it are untouched.`;
    },
    import_products: (a, db) => {
      const rows = (a.p_rows as Record<string, string>[]) ?? [];
      const errors: { row: number; field: string; message: string }[] = [];
      let create = 0;
      let update = 0;
      rows.forEach((r, i) => {
        if (!r.code?.trim()) errors.push({ row: i + 2, field: 'Code', message: 'is required' });
        if (!r.name?.trim()) errors.push({ row: i + 2, field: 'Name', message: 'is required' });
        if (r.mrp && Number.isNaN(Number(r.mrp))) errors.push({ row: i + 2, field: 'MRP', message: `"${r.mrp}" is not a number` });
        if (r.id) update++; else create++;
      });
      const committed = Boolean(a.p_commit) && !errors.length;
      if (committed) {
        for (const r of rows) {
          const ex = r.id ? find(db, 'products', r.id) : null;
          const f = { sku: r.code.trim(), name: r.name.trim(), pack_size: r.pack || null, mrp: r.mrp ? Number(r.mrp) : null, pts: r.pts ? Number(r.pts) : null, gst_percent: r.gst ? Number(r.gst) : 12 };
          if (ex) Object.assign(ex, f);
          else db.mutable('products').push({ id: crypto.randomUUID(), org_id: ORG, ...f, status: 'active', is_active: true, created_at: now() });
        }
        audit(db, 'imported a product sheet', 'Product', `${rows.length} rows`);
      }
      return { sheet: 'products', total: rows.length, create, update, rejected: new Set(errors.map(e => e.row)).size, committed, errors };
    },
    create_stockist: (a, db) => {
      const code = trimOrNull(a.p_code) ?? fail('a stockist needs a code');
      if (db.rows('stockists').some(s => String(s.code).toLowerCase() === code.toLowerCase())) fail(`another stockist already uses the code ${code}`);
      const gstin = trimOrNull(a.p_gstin);
      if (gstin && gstin.length !== 15) fail(`a GSTIN is 15 characters; "${gstin}" is ${gstin.length}`);
      const id = a.p_id ?? crypto.randomUUID();
      db.mutable('stockists').push({ id, org_id: ORG, code, name: trimOrNull(a.p_name) ?? fail('a stockist needs a name'), city: trimOrNull(a.p_city), state: trimOrNull(a.p_state), gstin, contact_person: trimOrNull(a.p_contact_person), phone: trimOrNull(a.p_phone), email: trimOrNull(a.p_email), address: trimOrNull(a.p_address), territory_id: a.p_territory_id ?? null, status: 'active', created_at: now() });
      audit(db, 'added a stockist', 'Stockist', `${code} · ${a.p_name}`);
      return id;
    },
    update_stockist: (a, db) => {
      const s = find(db, 'stockists', a.p_id) ?? fail('no such stockist in this organisation');
      const gstin = trimOrNull(a.p_gstin);
      if (gstin && gstin.length !== 15) fail(`a GSTIN is 15 characters; "${gstin}" is ${gstin.length}`);
      for (const [k, col] of [['p_name', 'name'], ['p_city', 'city'], ['p_state', 'state'], ['p_contact_person', 'contact_person'], ['p_phone', 'phone'], ['p_email', 'email'], ['p_address', 'address']] as const) {
        const v = trimOrNull(a[k]);
        if (v) s[col] = v;
      }
      if (gstin) s.gstin = gstin;
      if (a.p_territory_id) s.territory_id = a.p_territory_id;
      audit(db, 'corrected a stockist', 'Stockist', `${s.code} · ${s.name}`);
      return `${s.name} saved.`;
    },
    set_stockist_status: (a, db) => {
      const s = find(db, 'stockists', a.p_id) ?? fail('no such stockist in this organisation');
      if (s.status === a.p_status) return `${s.name} is already ${a.p_status}.`;
      audit(db, `moved a stockist to ${a.p_status}`, 'Stockist', `${s.code} · ${s.name}`, s.status, a.p_status);
      s.status = a.p_status;
      return a.p_status === 'active' ? `${s.name} is back on the phone's list.` : `${s.name} is off the phone's list. Orders that already name it are untouched.`;
    },
    record_stock: (a, db) => {
      const p = product(db, a.p_product_id);
      const batch = trimOrNull(a.p_batch_no)?.toUpperCase() ?? fail('a batch needs its number');
      if (!a.p_expiry_date || String(a.p_expiry_date) <= today()) fail('a batch that has expired is not stock');
      const q = Number(a.p_quantity);
      if (!q) fail('say how many arrived (a negative figure writes stock off)');
      const rows = db.mutable('stock_batches');
      const hit = rows.find(b => b.product_id === p.id && b.batch_no === batch);
      if (hit && Number(hit.quantity) + q < 0) fail(`that would leave batch ${batch} below zero`);
      if (!hit && q < 0) fail(`that would leave batch ${batch} below zero`);
      if (hit) Object.assign(hit, { quantity: Number(hit.quantity) + q, expiry_date: a.p_expiry_date });
      else rows.push({ id: crypto.randomUUID(), org_id: ORG, product_id: p.id, batch_no: batch, expiry_date: a.p_expiry_date, quantity: q });
      audit(db, q > 0 ? 'received stock' : 'wrote stock off', 'Stock', `${p.name} · ${batch} · ${q}`);
      return hit?.id ?? rows[rows.length - 1].id;
    },
  };
}
