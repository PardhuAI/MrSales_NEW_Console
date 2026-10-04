import { db, readAll } from './client';
import { loadEmployees } from './people';
import { loadGeo, type Geo } from './geo';
import { IST_TODAY, daysBetween } from '../lib/days';
import type { SheetReport } from '../lib/sheetReport';

/**
 * The client master and complaints, through the same functions the old
 * console and the phone use (create_client, update_client, set_client_listing,
 * the specialty list, import_clients, decide_complaint).
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

export const CLIENT_TYPES = ['doctor', 'hospital', 'chemist', 'stockist', 'diagnostics', 'other'] as const;
export const TYPE_LABEL: Record<string, string> = {
  doctor: 'Doctor', hospital: 'Hospital', chemist: 'Chemist', stockist: 'Stockist', diagnostics: 'Diagnostics', other: 'Other',
};
export const CATEGORY_LABEL: Record<string, string> = {
  coreTarget: 'Core target', regular: 'Regular', potential: 'Potential', inactive: 'Inactive',
};
export const typeLabel = (t: string) => TYPE_LABEL[t] ?? t.replace(/^./, x => x.toUpperCase());

export type ClientRow = {
  id: string;
  name: string;
  type: string;
  category: string;
  listed: boolean;
  active: boolean | null;
  specialty: string | null;
  designation: string | null;
  areaId: string;
  area: string;
  territoryId: string;
  territory: string;
  clusterId: string | null;
  ownerId: string | null;
  owner: string;
  mobile: string | null;
  email: string | null;
  contactPerson: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  hasLocation: boolean;
  lat: number | null;
  lng: number | null;
  visits: number;
  lastVisit: string | null;
  nextVisit: string | null;
  createdAt: string;
  specialDate: string | null;
  specialOccasion: string | null;
  specialNote: string | null;
};

export type ClientsModel = { clients: ClientRow[]; geo: Geo; people: { id: string; name: string; code: string; active: boolean }[]; specialties: { id: string; name: string }[] };

type Raw = {
  id: string; name: string; type: string; category: string; listing: string; is_active: boolean | null; specialty: string | null; designation: string | null;
  area_id: string; territory_id: string; cluster_id: string | null; owner_employee_id: string | null; mobile: string | null; email: string | null;
  contact_person: string | null; address_line: string | null; city: string | null; pincode: string | null; lat: number | null; lng: number | null;
  total_visits: number; last_visit_at: string | null; next_planned_visit_at: string | null; created_at: string; special_date: string | null; special_occasion: string | null; special_occasion_note: string | null;
};

export async function loadClients(): Promise<ClientsModel> {
  const sb = db();
  const [rows, geo, employees, specialties] = await Promise.all([
    readAll<Raw>((a, b) => sb.from('clients')
      .select('id, name, type, category, listing, is_active, specialty, designation, area_id, territory_id, cluster_id, owner_employee_id, mobile, email, contact_person, address_line, city, pincode, lat, lng, total_visits, last_visit_at, next_planned_visit_at, created_at, special_date, special_occasion, special_occasion_note')
      .order('name').range(a, b)),
    loadGeo(),
    loadEmployees(),
    sb.from('client_specialties').select('id, name').order('name'),
  ]);
  const area = new Map(geo.areas.map(a => [a.id, a.name]));
  const territory = new Map(geo.territories.map(t => [t.id, t.name]));
  return {
    clients: rows.map(r => ({
      id: r.id, name: r.name, type: r.type, category: r.category, listed: r.listing === 'listed', active: r.is_active,
      specialty: r.specialty, designation: r.designation, areaId: r.area_id, area: area.get(r.area_id) ?? '',
      territoryId: r.territory_id, territory: territory.get(r.territory_id) ?? '', clusterId: r.cluster_id,
      ownerId: r.owner_employee_id, owner: r.owner_employee_id ? employees.get(r.owner_employee_id)?.name ?? 'Someone no longer here' : '',
      mobile: r.mobile, email: r.email, contactPerson: r.contact_person, address: r.address_line, city: r.city, pincode: r.pincode,
      hasLocation: r.lat != null && r.lng != null, lat: r.lat, lng: r.lng, visits: r.total_visits ?? 0, lastVisit: r.last_visit_at, nextVisit: r.next_planned_visit_at,
      createdAt: r.created_at, specialDate: r.special_date, specialOccasion: r.special_occasion, specialNote: r.special_occasion_note,
    })),
    geo,
    people: [...employees.values()].filter(e => e.role).map(e => ({ id: e.id, name: e.name, code: e.code, active: e.status === 'active' })).sort((a, b) => a.name.localeCompare(b.name)),
    specialties: (must(specialties, 'specialties') ?? []) as { id: string; name: string }[],
  };
}

// ── one client ────────────────────────────────────────────────────────

export type ClientRecord = {
  visits: { id: string; personId: string; person: string; at: string; status: string; verdict: string | null; mocked: boolean; purpose: string | null; feedback: string | null }[];
  orders: { id: string; number: string; at: string; status: string; total: number; person: string; stockist: string }[];
  complaints: { id: string; subject: string; status: string; at: string }[];
  sales: number;
};

export async function loadClientRecord(id: string): Promise<ClientRecord> {
  const sb = db();
  const [acts, orders, complaints, sales, employees] = await Promise.all([
    sb.from('activities').select('id, employee_id, status, actual_start, scheduled_start, geo_verdict, geo_mocked, purpose, feedback')
      .eq('client_id', id).order('scheduled_start', { ascending: false }).limit(40),
    sb.from('orders').select('id, status, total, created_at, employee_id, stockists(name)').eq('client_id', id).order('created_at', { ascending: false }),
    sb.from('complaints').select('id, subject, status, created_at').eq('client_id', id).order('created_at', { ascending: false }),
    sb.from('sales_records').select('amount').eq('client_id', id),
    loadEmployees(),
  ]);
  const name = (pid: string) => employees.get(pid)?.name ?? 'Someone no longer here';
  return {
    visits: ((must(acts, 'visits') ?? []) as { id: string; employee_id: string; status: string; actual_start: string | null; scheduled_start: string; geo_verdict: string | null; geo_mocked: boolean | null; purpose: string | null; feedback: string | null }[])
      .map(a => ({ id: a.id, personId: a.employee_id, person: name(a.employee_id), at: a.actual_start ?? a.scheduled_start, status: a.status, verdict: a.geo_verdict, mocked: Boolean(a.geo_mocked) || a.geo_verdict === 'suspect', purpose: a.purpose, feedback: a.feedback })),
    orders: ((must(orders, 'orders') ?? []) as unknown as { id: string; status: string; total: number; created_at: string; employee_id: string; stockists: { name: string } | null }[])
      .map(o => ({ id: o.id, number: o.id.slice(0, 8).toUpperCase(), at: o.created_at, status: o.status, total: Number(o.total), person: name(o.employee_id), stockist: o.stockists?.name ?? '' })),
    complaints: ((must(complaints, 'complaints') ?? []) as { id: string; subject: string; status: string; created_at: string }[])
      .map(c => ({ id: c.id, subject: c.subject, status: c.status, at: c.created_at })),
    sales: ((must(sales, 'sales') ?? []) as { amount: number }[]).reduce((s, x) => s + Number(x.amount), 0),
  };
}

// ── writes ────────────────────────────────────────────────────────────

export type ClientInput = {
  name: string; type: string; category: string; listing: 'listed' | 'unlisted'; isActive: boolean | null;
  specialty: string | null; designation: string | null; areaId: string; clusterId: string | null; ownerId: string | null;
  mobile: string | null; email: string | null; contactPerson: string | null; address: string | null; city: string | null; pincode: string | null;
  specialDate: string | null; specialOccasion: string | null; specialNote: string | null;
  /** The registered position, carried through an edit unchanged; never typed at a desk. */
  lat: number | null; lng: number | null;
};

const clientArgs = (c: ClientInput) => ({
  p_name: c.name, p_type: c.type, p_category: c.category, p_listing: c.listing,
  // Active belongs to a listed client only.
  p_is_active: c.listing === 'listed' ? c.isActive ?? true : null,
  p_specialty: c.specialty, p_designation: c.designation, p_area_id: c.areaId, p_cluster_id: c.clusterId,
  p_mobile: c.mobile, p_email: c.email, p_contact_person: c.contactPerson, p_address_line: c.address, p_city: c.city, p_pincode: c.pincode,
  // The position is captured by the first rep standing at the clinic, never
  // typed here. update_client writes whatever it is given for an office role,
  // so an edit sends back the position already on record; sending null (as the
  // old console did) erased it.
  p_lat: c.lat, p_lng: c.lng,
  p_special_date: c.specialDate, p_special_occasion: c.specialOccasion, p_special_occasion_note: c.specialNote,
});

export async function createClient(c: ClientInput): Promise<string> {
  return (await call('create_client', { p_id: crypto.randomUUID(), ...clientArgs({ ...c, lat: null, lng: null }), p_owner_employee_id: c.ownerId })) as string;
}

/** Saves an edit. The caller passes the position already on record (see clientArgs). */
export async function updateClient(id: string, c: ClientInput): Promise<void> {
  await call('update_client', { p_id: id, ...clientArgs(c) });
}

export async function setClientListing(id: string, listing: 'listed' | 'unlisted', active: boolean | null): Promise<string> {
  return (await call('set_client_listing', { p_id: id, p_listing: listing, p_active: active })) as string;
}

export const createSpecialty = async (name: string) => (await call('create_client_specialty', { p_name: name.trim() })) as string;
export const deleteSpecialty = async (id: string) => (await call('delete_client_specialty', { p_id: id })) as string;

export async function clientSheet(): Promise<Record<string, unknown>[]> {
  const { data, error } = await db().from('clients')
    .select('id, name, type, category, listing, is_active, specialty, designation, mobile, email, contact_person, address_line, city, pincode, lat, lng, areas(name, territories(name)), clusters(name), employees(code)')
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Record<string, unknown>[];
}

export const importClients = async (rows: Record<string, string>[], commit: boolean) =>
  (await call('import_clients', { p_rows: rows, p_commit: commit })) as SheetReport;

// ── data quality ──────────────────────────────────────────────────────

/** The old console's rules (store.dataQuality), applied to the list already read. */
export function quality(clients: ClientRow[]) {
  const today = IST_TODAY();
  // The phone's rule: strip the honorific, since "Dr" begins every doctor on the master.
  const probe = (n: string) => n.toLowerCase().replace(/^\s*(dr|prof|mr|mrs|ms)\.?\s+/, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const seen = new Map<string, ClientRow[]>();
  for (const c of clients) {
    const p = probe(c.name);
    if (p.length < 4) continue;
    seen.set(p, [...(seen.get(p) ?? []), c]);
  }
  const live = clients.filter(c => !(c.listed && c.active === false));
  return {
    duplicates: [...seen.values()].filter(g => g.length > 1),
    noLocation: live.filter(c => !c.hasLocation),
    unassigned: live.filter(c => !c.ownerId),
    stale: live.filter(c => c.listed && (!c.lastVisit || daysBetween(c.lastVisit, today) > 30)),
    contradictory: clients.filter(c => !c.listed && c.active === false),
  };
}

// ── complaints ────────────────────────────────────────────────────────

export const COMPLAINT_STATUS: Record<string, { word: string; tone: 'critical' | 'warning' | 'good' | 'neutral'; rank: number }> = {
  open: { word: 'Open', tone: 'critical', rank: 0 },
  inProgress: { word: 'Being worked', tone: 'warning', rank: 1 },
  resolved: { word: 'Resolved', tone: 'good', rank: 2 },
  closed: { word: 'Closed', tone: 'neutral', rank: 3 },
};

export type Complaint = {
  id: string; number: string; subject: string; body: string; status: string; at: string; updatedAt: string;
  raisedById: string; raisedBy: string; clientId: string | null; client: string; area: string;
  assignedToId: string | null; assignedTo: string; resolution: string | null; attachments: string[];
};

export async function loadComplaints(): Promise<{ complaints: Complaint[]; people: { id: string; name: string }[] }> {
  const sb = db();
  const [rows, employees] = await Promise.all([
    sb.from('complaints').select('id, employee_id, client_id, subject, body, status, attachment_paths, created_at, updated_at, assigned_to, resolution, clients(name, areas(name))').order('created_at', { ascending: false }),
    loadEmployees(),
  ]);
  const name = (id: string | null) => (id ? employees.get(id)?.name ?? 'Someone no longer here' : '');
  type R = { id: string; employee_id: string; client_id: string | null; subject: string; body: string; status: string; attachment_paths: string[] | null; created_at: string; updated_at: string; assigned_to: string | null; resolution: string | null; clients: { name: string; areas: { name: string } | null } | null };
  return {
    complaints: ((must(rows, 'complaints') ?? []) as unknown as R[]).map(r => ({
      id: r.id, number: `CMP-${r.id.slice(0, 8).toUpperCase()}`, subject: r.subject, body: r.body, status: r.status, at: r.created_at, updatedAt: r.updated_at,
      raisedById: r.employee_id, raisedBy: name(r.employee_id), clientId: r.client_id, client: r.clients?.name ?? 'No client named', area: r.clients?.areas?.name ?? '',
      assignedToId: r.assigned_to, assignedTo: name(r.assigned_to), resolution: r.resolution, attachments: r.attachment_paths ?? [],
    })),
    people: [...employees.values()].filter(e => e.status === 'active').map(e => ({ id: e.id, name: e.name })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function decideComplaint(id: string, status: 'open' | 'inProgress' | 'resolved' | 'closed', opts: { assignedTo?: string | null; resolution?: string | null } = {}) {
  await call('decide_complaint', { p_id: id, p_status: status, p_assigned_to: opts.assignedTo ?? null, p_resolution: opts.resolution ?? null });
}
