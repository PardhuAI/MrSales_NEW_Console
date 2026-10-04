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
