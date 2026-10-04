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

export function teamRpcs(audit: (db: FakeDb, action: string, entity: string, label: string, before?: unknown, after?: unknown, reason?: unknown) => void): Record<string, Rpc> {
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const person = (db: FakeDb, id: unknown) => find(db, 'employees', id) ?? fail('no such employee in this organisation');
  const reason5 = (r: unknown) => (String(r ?? '').trim().length >= 5 ? String(r).trim() : fail('a reason is required; it is what the next person reads'));
  const create: Rpc = (a, db) => {
    const email = String(a.p_email ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('an employee needs a real email address; password resets are sent there');
    const d = find(db, 'designations', a.p_designation_id) ?? fail('pick one of your own roles for this person; set them up under Roles first');
    if (!d.is_active) fail(`${d.name} is retired, so nobody new is given it`);
    if (!find(db, 'territories', a.p_territory_id)) fail('territory not in this organisation');
    const code = String(a.p_code ?? '').trim().toUpperCase() || fail('an employee needs a code');
    if (db.rows('employees').some(e => e.code === code)) fail(`${code} is already someone's employee code`);
    if (a.p_manager_id) {
      const m = find(db, 'employees', a.p_manager_id);
      if (!m || m.status !== 'active') fail('the manager must be an active employee of this organisation');
    }
    const id = crypto.randomUUID();
    db.mutable('employees').push({
      id, org_id: ORG, code, name: String(a.p_name).trim(), mobile_role: d.app_view === 'manager' ? 'ASM' : 'MR', designation: d.name, designation_id: d.id, designation_short: d.short_name,
      department: String(a.p_department || 'Sales and marketing'), manager_id: a.p_manager_id ?? null, territory_id: a.p_territory_id, hq: String(a.p_hq).trim(), joined_at: a.p_joined_at,
      mobile: trimOrNull(a.p_mobile), email, blood_group: null, status: 'active', last_seen_at: null, lat: null, lng: null, created_at: now(), updated_at: now(), last_device_id: null,
    });
    if (a.p_manager_id) db.mutable('manager_assignments').push({ id: crypto.randomUUID(), org_id: ORG, employee_id: id, manager_id: a.p_manager_id, period: `[${a.p_joined_at},)`, changed_by: null, created_at: now() });
    audit(db, 'added a person', 'Employee', `${code} · ${a.p_name}`);
    return id;
  };
  return {
    create_employee: create,
    invite_field_employee: create,
    update_employee: (a, db) => {
      const e = person(db, a.p_id);
      const d = find(db, 'designations', a.p_designation_id) ?? fail('pick one of your own roles');
      Object.assign(e, { name: String(a.p_name).trim(), designation_id: d.id, designation: d.name, designation_short: d.short_name, mobile_role: d.app_view === 'manager' ? 'ASM' : 'MR', department: a.p_department, territory_id: a.p_territory_id, hq: String(a.p_hq).trim(), mobile: trimOrNull(a.p_mobile), email: trimOrNull(a.p_email) ?? e.email, updated_at: now() });
      audit(db, 'corrected a person', 'Employee', `${e.code} · ${e.name}`);
      return null;
    },
    reassign_manager: (a, db) => {
      if (!String(a.p_reason ?? '').trim()) fail('a reason is required; this changes who approves somebody\'s money');
      if (String(a.p_effective_from) < today()) fail('the effective date cannot be in the past');
      const e = person(db, a.p_employee_id);
      if (!['MR', 'ASM'].includes(String(e.mobile_role))) fail(`${e.name} is not on the phone, so they are not on this reporting line`);
      let m: Row | undefined;
      if (a.p_new_manager_id) {
        if (a.p_new_manager_id === e.id) fail('nobody reports to themselves');
        m = person(db, a.p_new_manager_id);
        if (m.mobile_role !== 'ASM') fail(`${m.name} is a ${m.designation}, and that role does not get the manager app; they cannot approve anybody's work`);
        if (m.status !== 'active') fail(`${m.name} is ${m.status}, and work cannot be assigned to somebody who cannot sign in`);
        for (let walk: unknown = m.manager_id, i = 0; walk && i < 12; i++) {
          if (walk === e.id) fail(`${m.name} already answers to ${e.name} further up the line, so ${m.name} cannot be their manager`);
          walk = find(db, 'employees', walk)?.manager_id;
        }
      }
      const before = e.manager_id ? find(db, 'employees', e.manager_id)?.name : 'nobody';
      if (String(a.p_effective_from) <= today()) e.manager_id = a.p_new_manager_id ?? null;
      db.mutable('manager_assignments').push({ id: crypto.randomUUID(), org_id: ORG, employee_id: e.id, manager_id: a.p_new_manager_id, period: `[${a.p_effective_from},${a.p_until ?? ''})`, changed_by: null, created_at: now() });
      audit(db, 'changed manager', 'Employee', String(e.name), before, m?.name ?? 'nobody', a.p_reason);
      return null;
    },
    hand_over_clients: (a, db) => {
      const r = reason5(a.p_reason);
      const f = person(db, a.p_from);
      const t = find(db, 'employees', a.p_to) ?? fail('the person taking over is not in this organisation');
      if (f.id === t.id) fail('pick somebody else to take the clients');
      if (t.status !== 'active') fail(`${t.name} is not active, so they cannot take clients`);
      const moved = db.rows('clients').filter(c => c.owner_employee_id === f.id);
      for (const c of moved) c.owner_employee_id = t.id;
      audit(db, 'handed clients over', 'Employee', `${f.code} · ${f.name}`, f.code, `${t.code} (${moved.length} clients)`, r);
      return moved.length === 0 ? `${f.name} held no clients, so nothing moved.` : `${moved.length === 1 ? '1 client' : `${moved.length} clients`} moved from ${f.name} to ${t.name}.`;
    },
    set_employee_status: (a, db) => {
      const r = reason5(a.p_reason);
      const e = person(db, a.p_id);
      if (e.status === a.p_status) fail(`${e.name} is already ${a.p_status}`);
      if (a.p_status !== 'active' && db.rows('employees').some(x => x.status === 'active' && x.manager_id === e.id)) fail(`${e.name} still has people reporting to them; reassign the team first`);
      audit(db, a.p_status === 'active' ? 'reopened an employee record' : 'closed an employee record', 'Employee', `${e.code} · ${e.name}`, e.status, a.p_status, r);
      e.status = a.p_status;
      for (const u of db.rows('app_users').filter(x => x.employee_id === e.id)) u.status = a.p_status === 'active' ? 'active' : 'suspended';
      return a.p_status === 'active' ? `${e.name} is active again, and their login works.` : `${e.name} is ${a.p_status}. Their login is suspended and their seat is free.`;
    },
    add_employee_document: (a, db) => {
      person(db, a.p_employee_id);
      if (!String(a.p_title ?? '').trim()) fail('a document needs a title');
      const id = crypto.randomUUID();
      db.mutable('documents').push({ id, org_id: ORG, employee_id: a.p_employee_id, title: String(a.p_title).trim(), category: a.p_category || 'general', storage_path: a.p_storage_path, released_at: now(), released_by: null, expires_at: a.p_expires_at ?? null });
      return id;
    },
    remove_employee_document: (a, db) => {
      const d = find(db, 'documents', a.p_id) ?? fail('no document you may remove has that id');
      db.replace('documents', db.rows('documents').filter(x => x !== d));
      return d.storage_path;
    },
    assign_task: (a, db) => {
      const p = person(db, a.p_assignee_id);
      if (!String(a.p_title ?? '').trim()) fail('a task needs a title');
      const id = a.p_id ?? crypto.randomUUID();
      const client = a.p_client_id ? find(db, 'clients', a.p_client_id) ?? fail('that client is not in this organisation') : null;
      db.mutable('tasks').push({ id, org_id: ORG, assignee_id: p.id, assigner_id: null, client_id: client?.id ?? null, title: String(a.p_title).trim(), description: trimOrNull(a.p_description), due_date: a.p_due_date ?? null, status: 'open', completed_at: null, created_at: now() });
      db.mutable('notifications').push({ id: crypto.randomUUID(), org_id: ORG, employee_id: p.id, title: 'New task assigned', body: `Head office: ${String(a.p_title).trim()}${client ? ` (at ${client.name})` : ''}`, kind: 'task', is_read: false, created_at: now(), entity: 'task', entity_id: id, deep_link: '/tasks', group_count: 1 });
      return id;
    },
  };
}

/** Pay, things shared with the field, and downloads. */
export function officeRpcs(audit: (db: FakeDb, action: string, entity: string, label: string, before?: unknown, after?: unknown, reason?: unknown) => void): Record<string, Rpc> {
  const RESOURCE_CATEGORIES = ['E-Detailing', 'Product Information', 'Price List', 'Training', 'Document'];
  return {
    release_payslip: (a, db) => {
      const e = find(db, 'employees', a.p_employee_id) ?? fail('employee is not in this organisation');
      const old = db.rows('payslips').find(p => p.employee_id === e.id && p.period_year === a.p_year && p.period_month === a.p_month);
      if (old) {
        Object.assign(old, { net_pay: a.p_net_pay, storage_path: a.p_storage_path, released_at: now() });
        return old.id;
      }
      const id = crypto.randomUUID();
      db.mutable('payslips').push({ id, org_id: ORG, employee_id: e.id, period_year: a.p_year, period_month: a.p_month, net_pay: a.p_net_pay, storage_path: a.p_storage_path, released_at: now() });
      return id;
    },
    publish_resource: (a, db) => {
      if (!trimOrNull(a.p_title)) fail('a resource needs a title');
      if (!RESOURCE_CATEGORIES.includes(String(a.p_category))) fail(`category must be one of ${RESOURCE_CATEGORIES.join(', ')}`);
      if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(String(a.p_mime_type))) fail('only PDF and images can be published');
      let family: unknown = null;
      let version = 1;
      if (a.p_replaces) {
        const cur = find(db, 'resources', a.p_replaces) ?? fail('resource not found');
        if (cur.status !== 'active') fail('only the current version can be replaced');
        cur.status = 'superseded';
        family = cur.family_id;
        version = Number(cur.version) + 1;
      }
      const id = crypto.randomUUID();
      db.mutable('resources').push({
        id, org_id: ORG, title: String(a.p_title).trim(), category: a.p_category, description: trimOrNull(a.p_description), storage_path: a.p_storage_path,
        file_name: trimOrNull(a.p_file_name), mime_type: a.p_mime_type, size_bytes: a.p_size_bytes, version, family_id: family ?? id, status: 'active', published_by: null, published_at: now(),
      });
      return id;
    },
    archive_resource: (a, db) => {
      const r = db.rows('resources').find(x => x.id === a.p_id && x.status === 'active') ?? fail('no current resource with that id');
      r.status = 'archived';
      return null;
    },
    delete_resource: (a, db) => {
      const r = find(db, 'resources', a.p_id) ?? fail('resource not found');
      const gone = db.rows('resources').filter(x => x.family_id === r.family_id);
      db.replace('resources', db.rows('resources').filter(x => x.family_id !== r.family_id));
      return gone.map(x => x.storage_path);
    },
    create_survey: (a, db) => {
      if (String(a.p_title ?? '').trim().length < 3) fail('give the survey a title');
      const active = a.p_active !== false;
      if (active) for (const s of db.rows('surveys')) s.is_active = false;
      const id = crypto.randomUUID();
      db.mutable('surveys').push({ id, org_id: ORG, title: String(a.p_title).trim(), body: trimOrNull(a.p_body), is_active: active, created_at: now() });
      audit(db, 'started a survey', 'Survey', String(a.p_title).trim());
      return id;
    },
    set_survey_active: (a, db) => {
      const s = find(db, 'surveys', a.p_id) ?? fail('no survey you may see has that id');
      if (a.p_active) for (const x of db.rows('surveys')) if (x !== s) x.is_active = false;
      s.is_active = Boolean(a.p_active);
      audit(db, a.p_active ? 'reopened a survey' : 'closed a survey', 'Survey', String(s.title));
      return null;
    },
    request_export: (a, db) => {
      const id = crypto.randomUUID();
      db.mutable('export_jobs').push({ id, org_id: ORG, requested_by: null, kind: a.p_kind, params: a.p_params ?? {}, status: 'queued', storage_path: null, error: null, created_at: now(), finished_at: null });
      return id;
    },
    complete_export: (a, db) => {
      const j = find(db, 'export_jobs', a.p_job_id) ?? fail('export job not found');
      Object.assign(j, a.p_failed
        ? { status: 'failed', error: trimOrNull(a.p_error) ?? 'failed', finished_at: now() }
        : { status: 'ready', storage_path: trimOrNull(a.p_storage_path), error: null, finished_at: now() });
      return null;
    },
  };
}

/** Settings, logins, holidays, and the account pages' platform functions. */
export function settingsRpcs(audit: (db: FakeDb, action: string, entity: string, label: string, before?: unknown, after?: unknown, reason?: unknown) => void): Record<string, Rpc> {
  const named = (v: unknown, what: string) => (String(v ?? '').trim().length >= 2 ? String(v).trim() : fail(`give the ${what} a name`));
  const unique = (db: FakeDb, t: string, name: string, extra: (r: Row) => boolean = () => true) => {
    if (db.rows(t).some(r => String(r.name).toLowerCase() === name.toLowerCase() && extra(r))) fail(`${name} is already there`);
  };
  const place = (db: FakeDb, t: string, id: unknown, what: string) => find(db, t, id) ?? fail(`no such ${what} in this organisation`);
  const inUse = (name: string, parts: [number, string][]) => {
    if (parts.some(([n]) => n > 0)) fail(`${name} is in use: ${parts.map(([n, w]) => `${n} ${w}`).join(', ')} name it`);
  };
  const tickets: Row[] = [];
  const thread: Row[] = [];
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
  if (!tickets.length) {
    tickets.push(
      { id: crypto.randomUUID(), type: 'data_issue', priority: 'high', status: 'waiting_customer', subject: 'Two clients merged by mistake in Kukatpally', raised_by: 'Demo owner', created_at: day(-3), updated_at: day(-1), sla_due_at: null },
      { id: crypto.randomUUID(), type: 'training', priority: 'low', status: 'resolved', subject: 'Training for the new Warangal team', raised_by: 'Demo owner', created_at: day(-20), updated_at: day(-12), sla_due_at: null },
    );
    thread.push(
      { id: crypto.randomUUID(), ticket: tickets[0].id, at: day(-3), author: 'Demo owner', from_mr_sales: false, body: 'Dr. Lalitha Krishna and Dr. Lalitha Murthy show as one client on Anil\'s phone since Tuesday.' },
      { id: crypto.randomUUID(), ticket: tickets[0].id, at: day(-1), author: 'Mr Sales support', from_mr_sales: true, body: 'We have split them back. Could you ask Anil to sign out and in once, and tell us if both now appear?' },
      { id: crypto.randomUUID(), ticket: tickets[1].id, at: day(-20), author: 'Demo owner', from_mr_sales: false, body: 'Four new representatives join in Warangal next week. Can someone take them through the app?' },
      { id: crypto.randomUUID(), ticket: tickets[1].id, at: day(-12), author: 'Mr Sales support', from_mr_sales: true, body: 'Done on a call on Friday; all four signed in and filed a day plan.' },
    );
  }
  const month = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() + n, 1); return d.toISOString().slice(0, 10); };
  const invoices = [-2, -1, 0].map((n, i) => ({
    id: crypto.randomUUID(), number: `MRS-2026-${String(41 + i).padStart(4, '0')}`, issue_date: month(n), due_date: month(n).slice(0, 8) + '15',
    period_start: month(n), period_end: new Date(Date.parse(month(n + 1)) - 86_400_000).toISOString().slice(0, 10), plan_code: 'growth', seats: 25, amount: 12500, gst_percent: 18, total: 14750,
    amount_paid: n === 0 ? 0 : 14750, status: n === 0 ? 'issued' : 'paid',
  }));
  return {
    update_org_settings: (a, db) => {
      const r = Number(a.p_geo_fence_radius_m);
      if (a.p_geo_fence_radius_m != null && (r < 10 || r > 5000)) fail('a geo-fence radius is between 10 and 5000 metres');
      const s = db.rows('org_settings')[0];
      Object.assign(s, { daily_allowance: a.p_daily_allowance ?? 350, week_off_weekday: a.p_week_off_weekday ?? 0, receipt_threshold: a.p_receipt_threshold ?? 500, geo_fence_policy: a.p_geo_fence_policy ?? 'warn', geo_fence_radius_m: a.p_geo_fence_radius_m ?? 50, updated_at: now() });
      return null;
    },
    create_region: (a, db) => {
      const name = named(a.p_name, 'region'); unique(db, 'regions', name);
      const id = crypto.randomUUID(); db.mutable('regions').push({ id, org_id: ORG, name, created_at: now() }); audit(db, 'added a region', 'Region', name); return id;
    },
    create_territory: (a, db) => {
      place(db, 'regions', a.p_region_id, 'region'); const name = named(a.p_name, 'territory'); unique(db, 'territories', name);
      const id = crypto.randomUUID(); db.mutable('territories').push({ id, org_id: ORG, region_id: a.p_region_id, name, hq: trimOrNull(a.p_hq) ?? name, created_at: now() }); audit(db, 'added a territory', 'Territory', name); return id;
    },
    create_area: (a, db) => {
      place(db, 'territories', a.p_territory_id, 'territory'); const name = named(a.p_name, 'area'); unique(db, 'areas', name, r => r.territory_id === a.p_territory_id);
      const id = crypto.randomUUID(); db.mutable('areas').push({ id, org_id: ORG, territory_id: a.p_territory_id, name, created_at: now() }); audit(db, 'added an area', 'Area', name); return id;
    },
    create_cluster: (a, db) => {
      place(db, 'areas', a.p_area_id, 'area'); const name = named(a.p_name, 'cluster'); unique(db, 'clusters', name, r => r.area_id === a.p_area_id);
      const id = crypto.randomUUID(); db.mutable('clusters').push({ id, org_id: ORG, area_id: a.p_area_id, name, created_at: now() }); audit(db, 'added a cluster', 'Cluster', name); return id;
    },
    delete_territory: (a, db) => {
      const t = place(db, 'territories', a.p_id, 'territory');
      inUse(String(t.name), [[db.rows('areas').filter(x => x.territory_id === t.id).length, 'areas'], [db.rows('clients').filter(x => x.territory_id === t.id).length, 'clients'], [db.rows('employees').filter(x => x.territory_id === t.id).length, 'employees']]);
      db.replace('territories', db.rows('territories').filter(x => x !== t)); audit(db, 'removed a territory', 'Territory', String(t.name)); return `${t.name} is gone.`;
    },
    delete_area: (a, db) => {
      const t = place(db, 'areas', a.p_id, 'area');
      inUse(String(t.name), [[db.rows('clients').filter(x => x.area_id === t.id).length, 'clients'], [db.rows('clusters').filter(x => x.area_id === t.id).length, 'clusters'], [db.rows('day_plans').filter(x => x.area_id === t.id).length, 'day plans']]);
      db.replace('areas', db.rows('areas').filter(x => x !== t)); audit(db, 'removed an area', 'Area', String(t.name)); return `${t.name} is gone.`;
    },
    delete_cluster: (a, db) => {
      const t = place(db, 'clusters', a.p_id, 'cluster');
      inUse(String(t.name), [[db.rows('clients').filter(x => x.cluster_id === t.id).length, 'clients'], [db.rows('day_plans').filter(x => x.cluster_id === t.id).length, 'day plans']]);
      db.replace('clusters', db.rows('clusters').filter(x => x !== t)); audit(db, 'removed a cluster', 'Cluster', String(t.name)); return `${t.name} is gone.`;
    },
    create_designation: (a, db) => {
      const name = String(a.p_name ?? '').trim();
      if (name.length < 2) fail('give the role a name; it is what your team sees on the phone');
      if (!['field', 'manager'].includes(String(a.p_app_view))) fail('a role gets either the field app or the manager app');
      const short = (trimOrNull(a.p_short_name) ?? (name.length <= 6 ? name.toUpperCase() : name.split(/\s+/).map(w => w[0]?.toUpperCase()).join(''))).slice(0, 6);
      if (db.rows('designations').some(r => String(r.name).toLowerCase() === name.toLowerCase())) fail(`${name} is already one of your roles`);
      if (db.rows('designations').some(r => String(r.short_name).toUpperCase() === short.toUpperCase())) fail(`${short} is already the short name of another role; give this one its own`);
      const id = crypto.randomUUID();
      db.mutable('designations').push({ id, org_id: ORG, name, short_name: short, app_view: a.p_app_view, rank: a.p_app_view === 'manager' ? 10 : 0, is_active: true, created_at: now(), updated_at: now() });
      audit(db, `added a role on the ${a.p_app_view} app`, 'Role', name); return id;
    },
    update_designation: (a, db) => {
      const d = place(db, 'designations', a.p_id, 'role');
      const name = String(a.p_name ?? '').trim();
      if (name.length < 2) fail('give the role a name; it is what your team sees on the phone');
      if (db.rows('designations').some(r => r !== d && String(r.name).toLowerCase() === name.toLowerCase())) fail(`${name} is already one of your roles`);
      Object.assign(d, { name, app_view: a.p_app_view, short_name: (trimOrNull(a.p_short_name) ?? d.short_name), updated_at: now() });
      audit(db, 'changed a role', 'Role', name); return d.id;
    },
    set_designation_active: (a, db) => {
      const d = place(db, 'designations', a.p_id, 'role');
      d.is_active = Boolean(a.p_active);
      const held = db.rows('employees').filter(e => e.designation_id === d.id).length;
      audit(db, a.p_active ? 'brought a role back' : 'retired a role', 'Role', String(d.name));
      return a.p_active ? `${d.name} is offered again when you add somebody.` : held ? `${d.name} is retired: it is off the list for new people, and the ${held} ${held === 1 ? 'person' : 'people'} who have it keep it.` : `${d.name} is retired.`;
    },
    delete_designation: (a, db) => {
      const d = place(db, 'designations', a.p_id, 'role');
      const held = db.rows('employees').filter(e => e.designation_id === d.id).length;
      if (held) fail(`${held} ${held === 1 ? 'person holds' : 'people hold'} this role, so it stays; retire it instead and it will not be offered again`);
      db.replace('designations', db.rows('designations').filter(x => x !== d)); audit(db, 'removed a role', 'Role', String(d.name)); return `${d.name} is off the list.`;
    },
    set_field_login: (a, db) => {
      const e = place(db, 'employees', a.p_employee_id, 'employee');
      if (String(a.p_password ?? '').length < 8) fail('a password has at least 8 characters');
      const u = db.rows('app_users').find(x => x.employee_id === e.id && x.role === 'field');
      if (u) Object.assign(u, { must_change_password: true, invited_at: u.invited_at ?? now(), updated_at: now() });
      else db.mutable('app_users').push({ id: crypto.randomUUID(), user_id: crypto.randomUUID(), employee_id: e.id, role: 'field', scope: 'own', status: 'active', created_at: now(), updated_at: now(), email: e.email, must_change_password: true, invited_at: now() });
      audit(db, u ? 'reset a phone password' : 'gave a phone login', 'Employee', String(e.name));
      return u ? `${e.name}'s password is reset.` : `${e.name} can sign in on the phone.`;
    },
    set_login_status: (a, db) => {
      if (String(a.p_reason ?? '').trim().length < 5) fail('a reason is required; it is what the next person reads');
      const t = place(db, 'app_users', a.p_app_user_id, 'login');
      if (t.status === a.p_status) fail(`that login is already ${a.p_status}`);
      const before = t.status; t.status = a.p_status; t.updated_at = now();
      audit(db, a.p_status === 'suspended' ? 'switched a login off' : 'switched a login back on', 'Login', String(t.email ?? t.role), before, a.p_status, String(a.p_reason).trim());
      return a.p_status;
    },
    upsert_holiday: (a, db) => {
      if (!trimOrNull(a.p_name)) fail('give the holiday a name');
      const h = db.rows('holidays').find(x => x.holiday_date === a.p_date);
      if (h) { h.name = String(a.p_name).trim(); return h.id; }
      const id = crypto.randomUUID(); db.mutable('holidays').push({ id, org_id: ORG, holiday_date: a.p_date, name: String(a.p_name).trim() }); return id;
    },
    my_platform_tickets: () => [...tickets].sort((x, y) => String(y.updated_at).localeCompare(String(x.updated_at))),
    my_platform_ticket_thread: a => thread.filter(m => m.ticket === a.p_ticket),
    raise_platform_ticket: a => {
      if (String(a.p_subject ?? '').trim().length < 4) fail('give the request a subject');
      if (String(a.p_body ?? '').trim().length < 10) fail('say what happened, so we can help');
      const id = crypto.randomUUID();
      const sla = ({ urgent: 4, high: 24, medium: 72, low: 168 } as Record<string, number>)[String(a.p_priority)] ?? 72;
      tickets.push({ id, type: a.p_type, priority: a.p_priority, status: 'open', subject: String(a.p_subject).trim(), raised_by: 'Demo owner', created_at: now(), updated_at: now(), sla_due_at: new Date(Date.now() + sla * 3_600_000).toISOString() });
      thread.push({ id: crypto.randomUUID(), ticket: id, at: now(), author: 'Demo owner', from_mr_sales: false, body: String(a.p_body).trim() });
      return id;
    },
    reply_platform_ticket: a => {
      const t = tickets.find(x => x.id === a.p_ticket) ?? fail('no such request');
      if (!trimOrNull(a.p_body)) fail('write a reply');
      thread.push({ id: crypto.randomUUID(), ticket: t.id, at: now(), author: 'Demo owner', from_mr_sales: false, body: String(a.p_body).trim() });
      Object.assign(t, { status: t.status === 'resolved' || t.status === 'closed' ? 'open' : t.status === 'waiting_customer' ? 'in_progress' : t.status, updated_at: now() });
      return null;
    },
    my_invoices: () => [...invoices].reverse(),
    'fn:invite-user': (a, db) => {
      const email = String(a.email ?? '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('that is not an email address');
      if (db.rows('app_users').some(u => String(u.email ?? '').toLowerCase() === email.toLowerCase())) fail(`${email} already has a login`);
      db.mutable('app_users').push({ id: crypto.randomUUID(), user_id: crypto.randomUUID(), employee_id: a.employee_id ?? null, role: a.role, scope: 'company', status: 'active', created_at: now(), updated_at: now(), email, must_change_password: true, invited_at: now() });
      audit(db, `invited a ${a.role} login`, 'Login', email);
      return { email, role: a.role };
    },
    'fn:field-password-reset': () => ({ message: 'If that account has an email on file, a link is on its way.' }),
  };
}
