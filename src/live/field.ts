import { db, readAll } from './client';
import { loadEmployees, type Employee } from './people';
import { loadGeo, type Geo } from './geo';
import { IST_TODAY, dayOf, daysBetween, hoursOf, shiftDay, startOfDay, weekdayOf } from '../lib/days';

/**
 * The Field section, read from the same tables the old console reads
 * (Mr_Sales_Web/src/pages/Field.tsx, Planning.tsx, Insight.tsx): activities,
 * day_plans, tour_plan_months and tour_plan_days, fake_location_attempts, and
 * the client master. Row-level security decides whose rows come back.
 *
 * Positions are what the phone captured at the moment of each visit. There is
 * no continuous stream, so nothing here is called live tracking.
 */

const must = <T,>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`Could not read ${what}: ${r.error.message}`);
  return r.data as T;
};

export type Verdict = 'verified' | 'outOfRange' | 'unavailable' | 'suspect' | null;

/** What a location check found, in words, and the tone of the word. */
export const VERDICT: Record<string, { word: string; tone: 'good' | 'warning' | 'critical' | 'neutral' }> = {
  verified: { word: 'At the client', tone: 'good' },
  outOfRange: { word: 'Outside the radius', tone: 'warning' },
  unavailable: { word: 'No location', tone: 'neutral' },
  suspect: { word: 'Fake location', tone: 'critical' },
};

export const WORK_TYPE: Record<string, string> = {
  fieldWork: 'Field work', meeting: 'Meeting', officeWork: 'Office work', training: 'Training',
  leave: 'Leave', holiday: 'Holiday', weekOff: 'Week off', transit: 'Travel',
};
export const workTypeLabel = (w: string | null | undefined) =>
  w ? WORK_TYPE[w] ?? w.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, x => x.toUpperCase()) : '';

/** Field people: the field app's roles, plus anyone who logged calls of their own. */
const isField = (e: Employee, callers: Set<string>) => e.status === 'active' && (e.role === 'MR' || callers.has(e.id));

async function companyRules() {
  const sb = db();
  const [s, h] = await Promise.all([
    sb.from('org_settings').select('week_off_weekday, geo_fence_radius_m').maybeSingle(),
    sb.from('holidays').select('holiday_date, name'),
  ]);
  const settings = must(s, 'company rules');
  const holidays = new Map(((must(h, 'holidays') ?? []) as { holiday_date: string; name: string }[]).map(x => [x.holiday_date, x.name]));
  const weekOff = Number(settings?.week_off_weekday ?? 0);
  return {
    weekOff,
    radius: Number(settings?.geo_fence_radius_m ?? 50),
    holidays,
    dayKind: (k: string): { off: 'weekOff' | 'holiday' | null; name: string | null } =>
      holidays.has(k) ? { off: 'holiday', name: holidays.get(k)! } : weekdayOf(k) === weekOff ? { off: 'weekOff', name: null } : { off: null, name: null },
    /** The working day before k. */
    prevWorking: (k: string) => {
      let d = shiftDay(k, -1);
      for (let i = 0; i < 14 && (holidays.has(d) || weekdayOf(d) === weekOff); i++) d = shiftDay(d, -1);
      return d;
    },
  };
}

// ── one day, everyone ─────────────────────────────────────────────────

export type PersonDay = {
  id: string;
  name: string;
  code: string;
  hq: string;
  managerId: string | null;
  manager: string;
  /** Where the phone was last seen, by name, and when. */
  lastPlace: string | null;
  lastSeenAt: string | null;
  territoryId: string | null;
  regionId: string | null;
  areaIds: string[];
  plan: { at: string; workType: string; area: string } | null;
  planned: number;
  done: number;
  missed: number;
  open: number;
  unplanned: number;
  verified: number;
  outside: number;
  noLocation: number;
  fake: number;
  blocked: number;
  first: number | null;
  last: number | null;
};

export type FieldDayModel = {
  date: string;
  prevWorking: string;
  today: string;
  off: 'weekOff' | 'holiday' | null;
  holidayName: string | null;
  people: PersonDay[];
  geo: Geo;
  managers: { id: string; name: string }[];
};

export async function loadFieldDay(date: string): Promise<FieldDayModel> {
  const sb = db();
  const [employees, geo, rules, acts, plans, fakes] = await Promise.all([
    loadEmployees(),
    loadGeo(),
    companyRules(),
    readAll<{ employee_id: string; status: string; is_unplanned: boolean | null; geo_verdict: string | null; geo_mocked: boolean | null; actual_start: string | null; scheduled_start: string }>((a, b) =>
      sb.from('activities').select('employee_id, status, is_unplanned, geo_verdict, geo_mocked, actual_start, scheduled_start')
        .gte('scheduled_start', startOfDay(date)).lt('scheduled_start', startOfDay(shiftDay(date, 1))).range(a, b)),
    sb.from('day_plans').select('employee_id, declared_at, work_type, area_id').eq('work_date', date),
    sb.from('fake_location_attempts').select('employee_id').gte('created_at', startOfDay(date)).lt('created_at', startOfDay(shiftDay(date, 1))),
  ]);
  const planRows = must(plans, 'day plans') as { employee_id: string; declared_at: string; work_type: string; area_id: string | null }[];
  const fakeRows = must(fakes, 'blocked fake locations') as { employee_id: string }[];
  const callers = new Set(acts.map(a => a.employee_id));
  const areaName = new Map(geo.areas.map(a => [a.id, a.name]));
  const regionOf = new Map(geo.territories.map(t => [t.id, t.regionId]));
  const kind = rules.dayKind(date);

  const people = [...employees.values()]
    .filter(e => isField(e, callers) && (!e.joinedAt || e.joinedAt <= date))
    .map((e): PersonDay => {
      const mine = acts.filter(a => a.employee_id === e.id);
      const done = mine.filter(a => a.status === 'completed' || a.status === 'inProgress');
      const plan = planRows.find(p => p.employee_id === e.id);
      const hours = done.map(a => hoursOf(a.actual_start ?? a.scheduled_start)).sort((x, y) => x - y);
      return {
        id: e.id, name: e.name, code: e.code, hq: e.hq,
        managerId: e.managerId, manager: e.managerId ? e.manager : '', lastPlace: e.lastPlace, lastSeenAt: e.lastSeenAt,
        territoryId: e.territoryId, regionId: e.territoryId ? regionOf.get(e.territoryId) ?? null : null,
        areaIds: geo.postings.get(e.id) ?? [],
        plan: plan ? { at: plan.declared_at, workType: plan.work_type, area: plan.area_id ? areaName.get(plan.area_id) ?? '' : '' } : null,
        planned: mine.length,
        done: mine.filter(a => a.status === 'completed').length,
        missed: mine.filter(a => a.status === 'missed').length,
        open: mine.filter(a => a.status === 'inProgress').length,
        unplanned: mine.filter(a => a.is_unplanned).length,
        verified: done.filter(a => a.geo_verdict === 'verified').length,
        outside: done.filter(a => a.geo_verdict === 'outOfRange').length,
        noLocation: done.filter(a => !a.geo_verdict || a.geo_verdict === 'unavailable').length,
        fake: done.filter(a => a.geo_mocked || a.geo_verdict === 'suspect').length,
        blocked: fakeRows.filter(f => f.employee_id === e.id).length,
        first: hours[0] ?? null,
        last: hours[hours.length - 1] ?? null,
      };
    });
  const managerIds = new Set(people.map(p => p.managerId).filter(Boolean) as string[]);
  return {
    date, prevWorking: rules.prevWorking(date), today: IST_TODAY(), off: kind.off, holidayName: kind.name, people, geo,
    managers: [...managerIds].map(id => ({ id, name: employees.get(id)?.name ?? 'Someone' })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ── one person, one day ───────────────────────────────────────────────

export type Visit = {
  id: string;
  status: 'completed' | 'missed' | 'inProgress' | 'planned' | string;
  at: string;
  plannedAt: string;
  endedAt: string | null;
  client: { id: string; name: string; type: string; area: string; lat: number | null; lng: number | null } | null;
  purpose: string | null;
  unplanned: boolean;
  verdict: Verdict;
  claimedVerdict: string | null;
  mocked: boolean;
  distance: number | null;
  radius: number | null;
  accuracy: number | null;
  lat: number | null;
  lng: number | null;
  capturedAt: string | null;
  /** When the visit reached the server; far after [capturedAt] means it was kept offline and sent later. */
  receivedAt: string | null;
  /** The phone's time for it was in the future or weeks old (0117). */
  timeSuspect: boolean;
  outOfRangeReason: string | null;
  feedback: string | null;
  remarks: string | null;
  pop: string | null;
  samples: string | null;
  pob: number | null;
  nextVisit: string | null;
  rcpaScore: number | null;
  photos: string[];
  products: string[];
  rcpa: { product: string; ours: number; competitor: string | null; theirs: number }[];
  hasDayPlan: boolean;
};

export type DayRecord = {
  person: Employee | null;
  date: string;
  off: 'weekOff' | 'holiday' | null;
  holidayName: string | null;
  plan: { at: string; workType: string; area: string; cluster: string; address: string | null; remarks: string | null; lat: number | null; lng: number | null } | null;
  visits: Visit[];
  /** Blocked fake locations, and (purpose device) a fake-GPS app or root found as the app opened. */
  blocked: { at: string; client: string | null; realDistance: number | null; device: string | null }[];
  /** The person's latest fake-location review: warnings at or before it are dealt with. */
  review: { at: string; by: string; note: string | null } | null;
  onLeave: string | null;
  /** Neighbouring days that have something recorded, for previous and next. */
  prev: string | null;
  next: string | null;
};

type ActRow = {
  id: string; status: string; scheduled_start: string; actual_start: string | null; actual_end: string | null; purpose: string | null;
  is_unplanned: boolean | null; geo_verdict: string | null; geo_claimed_verdict: string | null; geo_mocked: boolean | null; geo_distance_m: number | null;
  geo_radius_m: number | null; geo_accuracy_m: number | null; geo_lat: number | null; geo_lng: number | null; geo_captured_at: string | null;
  geo_received_at: string | null; geo_time_suspect: boolean | null;
  out_of_range_reason: string | null; feedback: string | null; remarks: string | null; pop: string | null; inputs_given: string | null;
  pob_amount: number | null; expected_next_visit: string | null; rcpa_score: number | null; photo_paths: string[] | null; day_plan_id: string | null;
  clients: { id: string; name: string; type: string; lat: number | null; lng: number | null; areas: { name: string } | null } | null;
  activity_rcpa_entries: { product_name: string; own_quantity: number; competitor_name: string | null; competitor_quantity: number }[];
  activity_products: { product_id: string }[];
};

export async function loadDayRecord(employeeId: string, date: string): Promise<DayRecord> {
  const sb = db();
  const [employees, rules, acts, plan, fakes, leave, around, products, review] = await Promise.all([
    loadEmployees(),
    companyRules(),
    sb.from('activities')
      .select('id, status, scheduled_start, actual_start, actual_end, purpose, is_unplanned, geo_verdict, geo_claimed_verdict, geo_mocked, geo_distance_m, geo_radius_m, geo_accuracy_m, geo_lat, geo_lng, geo_captured_at, geo_received_at, geo_time_suspect, out_of_range_reason, feedback, remarks, pop, inputs_given, pob_amount, expected_next_visit, rcpa_score, photo_paths, day_plan_id, clients(id, name, type, lat, lng, areas(name)), activity_rcpa_entries(product_name, own_quantity, competitor_name, competitor_quantity), activity_products(product_id)')
      .eq('employee_id', employeeId)
      .gte('scheduled_start', startOfDay(date)).lt('scheduled_start', startOfDay(shiftDay(date, 1)))
      .order('scheduled_start'),
    sb.from('day_plans').select('declared_at, work_type, cluster_name, captured_address, captured_lat, captured_lng, remarks, areas(name), clusters(name)')
      .eq('employee_id', employeeId).eq('work_date', date).maybeSingle(),
    sb.from('fake_location_attempts').select('created_at, real_distance_m, purpose, detail, clients(name)').eq('employee_id', employeeId)
      .gte('created_at', startOfDay(date)).lt('created_at', startOfDay(shiftDay(date, 1))).order('created_at'),
    sb.from('leave_requests').select('type').eq('employee_id', employeeId).eq('status', 'approved').lte('from_date', date).gte('to_date', date).limit(1),
    sb.from('day_plans').select('work_date').eq('employee_id', employeeId).gte('work_date', shiftDay(date, -30)).lte('work_date', shiftDay(date, 30)),
    sb.from('products').select('id, name'),
    sb.from('fake_location_reviews').select('reviewed_through, reviewer_name, note').eq('employee_id', employeeId)
      .order('reviewed_through', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const rows = must(acts, 'the visits') as unknown as ActRow[];
  const p = must(plan, 'the day plan') as unknown as { declared_at: string; work_type: string; cluster_name: string | null; captured_address: string | null; captured_lat: number | null; captured_lng: number | null; remarks: string | null; areas: { name: string } | null; clusters: { name: string } | null } | null;
  const productName = new Map(((must(products, 'products') ?? []) as { id: string; name: string }[]).map(x => [x.id, x.name]));
  const days = [...new Set(((must(around, 'nearby days') ?? []) as { work_date: string }[]).map(d => d.work_date))].sort();
  const kind = rules.dayKind(date);
  const lv = (must(leave, 'leave') ?? []) as { type: string }[];

  const visits = rows.map((a): Visit => ({
    id: a.id,
    status: a.status,
    at: a.actual_start ?? a.scheduled_start,
    plannedAt: a.scheduled_start,
    endedAt: a.actual_end,
    client: a.clients ? { id: a.clients.id, name: a.clients.name, type: a.clients.type, area: a.clients.areas?.name ?? '', lat: a.clients.lat, lng: a.clients.lng } : null,
    purpose: a.purpose,
    unplanned: Boolean(a.is_unplanned),
    verdict: (a.geo_mocked ? 'suspect' : a.geo_verdict) as Verdict,
    claimedVerdict: a.geo_claimed_verdict,
    mocked: Boolean(a.geo_mocked) || a.geo_verdict === 'suspect',
    distance: a.geo_distance_m, radius: a.geo_radius_m ?? rules.radius, accuracy: a.geo_accuracy_m,
    lat: a.geo_lat, lng: a.geo_lng, capturedAt: a.geo_captured_at,
    receivedAt: a.geo_received_at, timeSuspect: Boolean(a.geo_time_suspect),
    outOfRangeReason: a.out_of_range_reason,
    feedback: a.feedback, remarks: a.remarks, pop: a.pop, samples: a.inputs_given,
    pob: a.pob_amount == null ? null : Number(a.pob_amount), nextVisit: a.expected_next_visit, rcpaScore: a.rcpa_score,
    photos: a.photo_paths ?? [],
    products: (a.activity_products ?? []).map(x => productName.get(x.product_id) ?? 'A product'),
    rcpa: (a.activity_rcpa_entries ?? []).map(r => ({ product: r.product_name, ours: r.own_quantity, competitor: r.competitor_name, theirs: r.competitor_quantity })),
    hasDayPlan: Boolean(a.day_plan_id),
  })).sort((x, y) => x.at.localeCompare(y.at));

  return {
    person: employees.get(employeeId) ?? null,
    date,
    off: kind.off,
    holidayName: kind.name,
    plan: p ? {
      at: p.declared_at, workType: p.work_type, area: p.areas?.name ?? '', cluster: p.clusters?.name ?? p.cluster_name ?? '',
      address: p.captured_address, remarks: p.remarks, lat: p.captured_lat, lng: p.captured_lng,
    } : null,
    visits,
    blocked: ((must(fakes, 'blocked fake locations') ?? []) as unknown as { created_at: string; real_distance_m: number | null; purpose: string | null; detail: string | null; clients: { name: string } | null }[])
      .map(f => ({ at: f.created_at, client: f.clients?.name ?? null, realDistance: f.real_distance_m, device: f.purpose === 'device' ? (f.detail ?? 'A fake GPS app') : null })),
    review: review.data ? {
      at: (review.data as { reviewed_through: string }).reviewed_through,
      by: (review.data as { reviewer_name: string | null }).reviewer_name ?? 'Someone',
      note: (review.data as { note: string | null }).note,
    } : null,
    onLeave: lv[0]?.type ?? null,
    prev: [...days].reverse().find(d => d < date) ?? null,
    next: days.find(d => d > date && d <= IST_TODAY()) ?? null,
  };
}

/** Signed links for the photos taken at a call (private bucket "visit-photos", an hour each). */
export async function photoUrls(paths: string[]): Promise<(string | null)[]> {
  const { data, error } = await db().storage.from('visit-photos').createSignedUrls(paths, 3600);
  if (error) throw new Error(error.message);
  return paths.map(p => data?.find(d => d.path === p)?.signedUrl ?? null);
}

// ── day plans ─────────────────────────────────────────────────────────

export type DayPlanRow = {
  id: string; name: string; code: string; hq: string; managerId: string | null; manager: string;
  plan: { at: string; workType: string; area: string; cluster: string; address: string | null; remarks: string | null; tourType: string } | null;
  onLeave: boolean;
  planned: number; done: number;
};

export type DayPlansModel = { date: string; prevWorking: string; off: 'weekOff' | 'holiday' | null; holidayName: string | null; rows: DayPlanRow[]; managers: { id: string; name: string }[] };

export async function loadDayPlans(date: string): Promise<DayPlansModel> {
  const sb = db();
  const [employees, rules, plans, acts, leave] = await Promise.all([
    loadEmployees(),
    companyRules(),
    sb.from('day_plans').select('id, employee_id, declared_at, work_type, tour_type, cluster_name, captured_address, remarks, areas(name), clusters(name)').eq('work_date', date),
    readAll<{ employee_id: string; status: string }>((a, b) => sb.from('activities').select('employee_id, status')
      .gte('scheduled_start', startOfDay(date)).lt('scheduled_start', startOfDay(shiftDay(date, 1))).range(a, b)),
    sb.from('leave_requests').select('employee_id').eq('status', 'approved').lte('from_date', date).gte('to_date', date),
  ]);
  const pl = must(plans, 'day plans') as unknown as { id: string; employee_id: string; declared_at: string; work_type: string; tour_type: string; cluster_name: string | null; captured_address: string | null; remarks: string | null; areas: { name: string } | null; clusters: { name: string } | null }[];
  const away = new Set(((must(leave, 'leave') ?? []) as { employee_id: string }[]).map(l => l.employee_id));
  const declared = new Set(pl.map(p => p.employee_id));
  const kind = rules.dayKind(date);
  const rows = [...employees.values()]
    .filter(e => e.status === 'active' && (!e.joinedAt || e.joinedAt <= date) && (e.role === 'MR' || e.role === 'ASM' || declared.has(e.id)))
    .map((e): DayPlanRow => {
      const p = pl.find(x => x.employee_id === e.id);
      const mine = acts.filter(a => a.employee_id === e.id);
      return {
        id: e.id, name: e.name, code: e.code, hq: e.hq, managerId: e.managerId, manager: e.managerId ? e.manager : '',
        plan: p ? { at: p.declared_at, workType: p.work_type, area: p.areas?.name ?? '', cluster: p.clusters?.name ?? p.cluster_name ?? '', address: p.captured_address, remarks: p.remarks, tourType: p.tour_type } : null,
        onLeave: away.has(e.id),
        planned: mine.length,
        done: mine.filter(a => a.status === 'completed').length,
      };
    });
  const managerIds = new Set(rows.map(r => r.managerId).filter(Boolean) as string[]);
  return {
    date, prevWorking: rules.prevWorking(date), off: kind.off, holidayName: kind.name, rows,
    managers: [...managerIds].map(id => ({ id, name: employees.get(id)?.name ?? 'Someone' })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ── tour plans ────────────────────────────────────────────────────────

export type TourDay = {
  date: string; workType: string; area: string; tourType: string; planned: number; clients: string[];
  travelMode: string | null; destination: string | null; km: number | null; remarks: string | null;
};

export type TourRow = {
  personId: string; name: string; code: string; hq: string; manager: string;
  monthId: string | null;
  status: 'approved' | 'pending' | 'draft' | 'rejected' | 'none';
  submittedAt: string | null;
  decidedAt: string | null;
  working: number;
  plannedDays: number;
  unplanned: string[];
  calls: number;
  outstation: number;
  days: TourDay[];
};

export type TourModel = { year: number; month: number; label: string; rows: TourRow[]; workingDays: string[] };

export async function loadTourPlans(year: number, month: number): Promise<TourModel> {
  const sb = db();
  const [employees, rules, months] = await Promise.all([
    loadEmployees(),
    companyRules(),
    sb.from('tour_plan_months')
      .select('id, employee_id, status, submitted_at, decided_at, tour_plan_days(work_date, work_type, tour_type, planned_visits, client_names, travel_mode, destination, estimated_km, remarks, areas(name))')
      .eq('plan_year', year).eq('plan_month', month),
  ]);
  type M = { id: string; employee_id: string; status: string; submitted_at: string | null; decided_at: string | null; tour_plan_days: { work_date: string; work_type: string; tour_type: string; planned_visits: number; client_names: string[] | null; travel_mode: string | null; destination: string | null; estimated_km: number | null; remarks: string | null; areas: { name: string } | null }[] };
  const rows = must(months, 'tour plans') as unknown as M[];
  const mk = `${year}-${String(month).padStart(2, '0')}`;
  const daysIn = new Date(year, month, 0).getDate();
  const workingDays: string[] = [];
  for (let d = 1; d <= daysIn; d++) {
    const k = `${mk}-${String(d).padStart(2, '0')}`;
    if (!rules.dayKind(k).off) workingDays.push(k);
  }
  const field = [...employees.values()].filter(e => e.status === 'active' && e.role === 'MR');
  const withPlan = new Set(rows.map(r => r.employee_id));
  const people = [...field, ...[...employees.values()].filter(e => withPlan.has(e.id) && !field.includes(e))];

  return {
    year, month, workingDays,
    label: new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    rows: people.map((e): TourRow => {
      const m = rows.find(r => r.employee_id === e.id);
      const days = (m?.tour_plan_days ?? []).map(d => ({
        date: d.work_date, workType: d.work_type, area: d.areas?.name ?? '', tourType: d.tour_type, planned: d.planned_visits,
        clients: d.client_names ?? [], travelMode: d.travel_mode, destination: d.destination, km: d.estimated_km, remarks: d.remarks,
      })).sort((a, b) => a.date.localeCompare(b.date));
      const answered = new Set(days.map(d => d.date));
      const worked = days.filter(d => !['holiday', 'leave', 'weekOff'].includes(d.workType));
      return {
        personId: e.id, name: e.name, code: e.code, hq: e.hq, manager: e.managerId ? e.manager : '',
        monthId: m?.id ?? null,
        status: (m?.status ?? 'none') as TourRow['status'],
        submittedAt: m?.submitted_at ?? null,
        decidedAt: m?.decided_at ?? null,
        working: workingDays.length,
        plannedDays: workingDays.filter(k => answered.has(k)).length,
        unplanned: workingDays.filter(k => !answered.has(k)),
        calls: worked.reduce((s, d) => s + (d.planned || d.clients.length), 0),
        outstation: worked.filter(d => d.tourType === 'outstation' || d.tourType === 'exStation').length,
        days,
      };
    }),
  };
}

export async function decideTour(id: string, approve: boolean, reason: string) {
  const { error } = await db().rpc('decide_tour', { p_id: id, p_approve: approve, p_reason: reason || null });
  if (error) throw new Error(error.message);
}

// ── coverage ──────────────────────────────────────────────────────────

export type CoverageModel = {
  weeks: { start: string; end: string; label: string }[];
  rows: { areaId: string; area: string; territory: string; clients: number; cells: number[]; total: number }[];
  occasions: { clientId: string; client: string; what: string; on: string; inDays: number; area: string; owner: string }[];
  callsPlotted: number;
};

/**
 * Completed calls by area and week, quietest first: the shape that answers
 * "where is nobody going". Only whole weeks the records cover are drawn, so an
 * empty column always means nobody went, never that nothing was recorded.
 */
export async function loadCoverage(weeks = 6): Promise<CoverageModel> {
  const sb = db();
  const today = IST_TODAY();
  const from = shiftDay(today, -(weeks * 7 - 1));
  const [geo, employees, clients, acts, first] = await Promise.all([
    loadGeo(),
    loadEmployees(),
    readAll<{ id: string; name: string; area_id: string; owner_employee_id: string | null; special_date: string | null; special_occasion: string | null; is_active: boolean | null }>((a, b) =>
      sb.from('clients').select('id, name, area_id, owner_employee_id, special_date, special_occasion, is_active').range(a, b)),
    readAll<{ client_id: string; actual_start: string | null; scheduled_start: string }>((a, b) =>
      sb.from('activities').select('client_id, actual_start, scheduled_start').eq('status', 'completed')
        .gte('scheduled_start', startOfDay(from)).range(a, b)),
    sb.from('activities').select('scheduled_start').order('scheduled_start').limit(1),
  ]);
  const earliest = ((must(first, 'the first visit') ?? []) as { scheduled_start: string }[])[0]?.scheduled_start;
  const earliestDay = earliest ? dayOf(earliest) : today;
  const all = Array.from({ length: weeks }, (_, i) => {
    const end = shiftDay(today, -i * 7);
    const start = shiftDay(end, -6);
    return { start, end, label: new Date(`${start}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) };
  }).reverse().filter(w => w.start >= earliestDay);
  const clientArea = new Map(clients.map(c => [c.id, c.area_id]));
  const territory = new Map(geo.territories.map(t => [t.id, t.name]));
  const byArea = new Map<string, number[]>();
  for (const a of acts) {
    const area = clientArea.get(a.client_id);
    if (!area) continue;
    const k = dayOf(a.actual_start ?? a.scheduled_start);
    const w = all.findIndex(x => k >= x.start && k <= x.end);
    if (w < 0) continue;
    const cells = byArea.get(area) ?? Array(all.length).fill(0);
    cells[w]++;
    byArea.set(area, cells);
  }
  const rows = geo.areas.map(a => {
    const cells = byArea.get(a.id) ?? Array(all.length).fill(0);
    return { areaId: a.id, area: a.name, territory: territory.get(a.territoryId) ?? '', clients: clients.filter(c => c.area_id === a.id).length, cells, total: cells.reduce((s: number, n: number) => s + n, 0) };
  }).sort((x, y) => x.total - y.total || x.area.localeCompare(y.area));

  const areaName = new Map(geo.areas.map(a => [a.id, a.name]));
  const [ty] = today.split('-').map(Number);
  const occasions = clients.filter(c => c.special_date && c.is_active !== false).map(c => {
    const [, m, d] = c.special_date!.split('-');
    let next = `${ty}-${m}-${d}`;
    if (next < today) next = `${ty + 1}-${m}-${d}`;
    return {
      clientId: c.id, client: c.name, what: c.special_occasion || 'Special date', on: next, inDays: daysBetween(today, next),
      area: areaName.get(c.area_id) ?? '', owner: c.owner_employee_id ? employees.get(c.owner_employee_id)?.name ?? '' : '',
    };
  }).filter(o => o.inDays <= 30).sort((a, b) => a.inDays - b.inDays);

  return { weeks: all, rows, occasions, callsPlotted: rows.reduce((s, r) => s + r.total, 0) };
}

/** Marks everything so far reviewed for one person (their manager or the office); returns how many it cleared. */
export async function reviewFakeLocations(employeeId: string, note: string): Promise<number> {
  const { data, error } = await db().rpc('review_fake_locations', { p_employee_id: employeeId, p_note: note.trim() || null });
  if (error) throw new Error(error.message.replace(/^./, x => x.toUpperCase()));
  return Number(data ?? 0);
}
