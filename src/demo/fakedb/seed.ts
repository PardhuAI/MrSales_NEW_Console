import type { Row, Tables } from './engine';

/**
 * The demo company, as database rows in the live schema's own shape.
 *
 * Cleocure Lifesciences: a regional manager, four area managers and sixteen
 * reps across Hyderabad, Warangal and Vijayawada. Generated from a fixed seed
 * relative to today, so the demo always shows a current week and every screen
 * tells the same story: the same people, clients, calls, claims and sales.
 * Names and figures are samples, and every screen says "Demo data".
 *
 * A few situations are placed on purpose, because a console is judged by how
 * it handles them: a rep whose phone tried a fake location today, a journey
 * that does not add up, a rep who has not started today, one who has been
 * quiet for a week, one on leave, a new joiner with nobody to report to,
 * clients with no location or owner, and claims above the allowance.
 */

let s = 20261004;
const rnd = () => {
  s = (s * 1664525 + 1013904223) % 4294967296;
  return s / 4294967296;
};
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const chance = (p: number) => rnd() < p;
const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

let n = 0;
/** Stable ids that read as uuids. */
const uid = (tag: string) => {
  n++;
  const h = (n * 2654435761 >>> 0).toString(16).padStart(8, '0');
  return `${h}-${tag.padEnd(4, '0').slice(0, 4)}-4${String(n).padStart(3, '0').slice(-3)}-8000-${String(n).padStart(12, '0')}`;
};

// ── India time ─────────────────────────────────────────────────────────

const IST = 'Asia/Kolkata';
const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' });
export const dayKey = (d: Date) => keyFmt.format(d);
const parts = (k: string) => k.split('-').map(Number) as [number, number, number];
export const shift = (k: string, by: number) => {
  const [y, m, d] = parts(k);
  return keyFmt.format(new Date(Date.UTC(y, m - 1, d + by, 6)));
};
const weekday = (k: string) => {
  const [y, m, d] = parts(k);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
/** An instant: India day k at hour h (10.5 is 10:30 am). */
const at = (k: string, h: number) => {
  const [y, m, d] = parts(k);
  return new Date(Date.UTC(y, m - 1, d, 0, Math.round((h - 5.5) * 60))).toISOString();
};
const hoursNow = (now: Date) => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: false }).format(now).split(':').map(Number);
  return (h % 24) + m / 60;
};

export const DEMO_ORG = '0d3a1f00-demo-4000-8000-c1e0c0e00001';
export const DEMO_USER = '0d3a1f00-demo-4000-8000-0000000000aa';

export function seed(now = new Date()): Tables {
  s = 20261004;
  n = 0;
  const org_id = DEMO_ORG;
  const today = dayKey(now);
  const nowH = hoursNow(now);
  const [ty, tm] = parts(today);
  const created = at(shift(today, -400), 10);
  const T: Tables = {};
  // The stored row is returned, so later touches (a visit count, a cleared location) land in the table.
  const add = (table: string, row: Row): Row & { id: string } => {
    const r = { org_id, ...row } as unknown as Row & { id: string };
    (T[table] ??= []).push(r);
    return r;
  };

  // ── the organisation and its rules ──
  T.organisations = [{ id: org_id, name: 'Cleocure Lifesciences', slug: 'cleocure', status: 'active', created_at: created, updated_at: created, status_changed_at: null }];
  add('org_settings', {
    daily_allowance: 350, week_off_weekday: 0, receipt_threshold: 500, geo_fence_policy: 'warn',
    geo_fence_radius_m: 50, updated_at: created, setup_dismissed: [],
  });
  T.org_entitlements = [{ org_id, plan_code: 'growth', seat_limit: 25, disabled_modules: [], updated_at: created }];

  const year = ty;
  const holidays: [string, string][] = [
    [`${year}-01-26`, 'Republic Day'], [`${year}-03-04`, 'Holi'], [`${year}-04-14`, 'Ambedkar Jayanti'],
    [`${year}-06-02`, 'Telangana Formation Day'], [`${year}-08-15`, 'Independence Day'], [`${year}-09-14`, 'Ganesh Chaturthi'],
    [`${year}-10-02`, 'Gandhi Jayanti'], [`${year}-10-20`, 'Dussehra'], [`${year}-11-08`, 'Diwali'], [`${year}-12-25`, 'Christmas'],
    [`${year - 1}-10-02`, 'Gandhi Jayanti'], [`${year - 1}-10-31`, 'Dussehra'], [`${year - 1}-11-20`, 'Diwali'], [`${year - 1}-12-25`, 'Christmas'],
  ];
  const holidayOf = new Map(holidays);
  for (const [holiday_date, name] of holidays) add('holidays', { id: uid('hol'), holiday_date, name });
  const working = (k: string) => weekday(k) !== 0 && !holidayOf.has(k);

  // ── roles ──
  const desMr = add('designations', { id: uid('des'), name: 'Medical Representative', short_name: 'MR', app_view: 'field', rank: 1, is_active: true, created_at: created, updated_at: created });
  const desAsm = add('designations', { id: uid('des'), name: 'Area Sales Manager', short_name: 'ASM', app_view: 'manager', rank: 2, is_active: true, created_at: created, updated_at: created });
  const desRsm = add('designations', { id: uid('des'), name: 'Regional Sales Manager', short_name: 'RSM', app_view: 'manager', rank: 3, is_active: true, created_at: created, updated_at: created });
  add('designations', { id: uid('des'), name: 'Key Account Manager', short_name: 'KAM', app_view: 'field', rank: 1, is_active: false, created_at: created, updated_at: created });

  // ── geography ──
  const geo: { region: string; territory: string; hq: string; areas: string[] }[] = [
    { region: 'Telangana', territory: 'Hyderabad West', hq: 'Madhapur', areas: ['Madhapur', 'Kukatpally', 'Gachibowli', 'Miyapur'] },
    { region: 'Telangana', territory: 'Hyderabad East', hq: 'Uppal', areas: ['Uppal', 'Dilsukhnagar', 'LB Nagar', 'Secunderabad'] },
    { region: 'Telangana', territory: 'Warangal', hq: 'Hanamkonda', areas: ['Hanamkonda', 'Kazipet', 'Warangal Fort', 'Subedari'] },
    { region: 'Andhra Pradesh', territory: 'Vijayawada', hq: 'Benz Circle', areas: ['Benz Circle', 'Governorpet', 'Patamata', 'Labbipet'] },
  ];
  const centre: Record<string, [number, number]> = {
    Madhapur: [17.4483, 78.3915], Kukatpally: [17.4849, 78.4138], Gachibowli: [17.4401, 78.3489], Miyapur: [17.4969, 78.3528],
    Uppal: [17.4058, 78.5591], Dilsukhnagar: [17.3688, 78.5247], 'LB Nagar': [17.3457, 78.5522], Secunderabad: [17.4399, 78.4983],
    Hanamkonda: [18.0072, 79.5584], Kazipet: [17.9784, 79.5005], 'Warangal Fort': [17.9567, 79.6122], Subedari: [18.0089, 79.5741],
    'Benz Circle': [16.4996, 80.6560], Governorpet: [16.5130, 80.6264], Patamata: [16.4946, 80.6669], Labbipet: [16.5032, 80.6420],
  };
  const regionId = new Map<string, string>();
  const territoryId = new Map<string, string>();
  const areaId = new Map<string, string>();
  const areaTerritory = new Map<string, string>();
  const clusterOf = new Map<string, Row[]>();
  for (const g of geo) {
    if (!regionId.has(g.region)) regionId.set(g.region, add('regions', { id: uid('reg'), name: g.region, created_at: created }).id as string);
    const tid = add('territories', { id: uid('ter'), region_id: regionId.get(g.region), name: g.territory, hq: g.hq, created_at: created }).id as string;
    territoryId.set(g.territory, tid);
    for (const a of g.areas) {
      const aid = add('areas', { id: uid('are'), territory_id: tid, name: a, lat: centre[a][0], lng: centre[a][1], created_at: created }).id as string;
      areaId.set(a, aid);
      areaTerritory.set(aid, tid);
      clusterOf.set(aid, [
        add('clusters', { id: uid('clu'), area_id: aid, name: `${a} main road`, created_at: created }),
        add('clusters', { id: uid('clu'), area_id: aid, name: `${a} hospital belt`, created_at: created }),
      ]);
    }
  }
  add('territories', { id: uid('ter'), region_id: regionId.get('Andhra Pradesh'), name: 'Guntur', hq: 'Brodipet', created_at: created });

  // ── people ──
  type Person = Row & { id: string; name: string; hq: string; area: string; territory: string };
  const person = (name: string, code: string, des: Row, territory: string, hq: string, manager: string | null, joined: string, extra: Row = {}): Person => {
    const isManager = des.app_view === 'manager';
    const [la, ln] = centre[hq] ?? centre.Madhapur;
    return add('employees', {
      id: uid('emp'), code, name, mobile_role: isManager ? 'ASM' : 'MR', designation: des.name, department: 'Sales and marketing',
      manager_id: manager, territory_id: territoryId.get(territory), hq, joined_at: joined,
      mobile: `9${between(100000000, 999999999)}`, email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@cleocure.in`,
      blood_group: pick(['O+', 'B+', 'A+', 'AB+', 'O-']), status: 'active', last_seen_at: null, lat: la, lng: ln,
      created_at: at(joined, 10), updated_at: created, designation_id: des.id, designation_short: des.short_name,
      last_device_id: null, location_requested_at: null, mock_alerted_at: null, last_mock_at: null, last_place: null, ...extra,
    }) as Person & Row;
  };
  const rsm = person('Venkata Ramana Rao', 'CL-RSM-01', desRsm, 'Hyderabad West', 'Madhapur', null, shift(today, -1900));
  const managerSpecs: [string, string, string][] = [
    ['Ravi Teja Varma', 'Hyderabad West', 'Madhapur'], ['Lakshmi Prasanna', 'Hyderabad East', 'Uppal'],
    ['Mohammed Irfan', 'Warangal', 'Hanamkonda'], ['Kavya Reddy', 'Vijayawada', 'Benz Circle'],
  ];
  const managers = managerSpecs.map(([name, territory, hq], i) =>
    person(name, `CL-ASM-0${i + 1}`, desAsm, territory, hq, rsm.id, shift(today, -1500 + i * 90)));
  const repSpecs: [string, number, string][] = [
    ['Sai Kiran Reddy', 0, 'Madhapur'], ['Anil Kumar Goud', 0, 'Kukatpally'], ['Divya Sree', 0, 'Gachibowli'], ['Pranay Rao', 0, 'Miyapur'],
    ['Nikhil Varma', 1, 'Uppal'], ['Harika Naidu', 1, 'Dilsukhnagar'], ['Srinivas Chary', 1, 'LB Nagar'], ['Meghana Rao', 1, 'Secunderabad'],
    ['Rahul Yadav', 2, 'Hanamkonda'], ['Swathi Reddy', 2, 'Kazipet'], ['Venkatesh Babu', 2, 'Warangal Fort'], ['Ramya Krishna', 2, 'Subedari'],
    ['Kiran Teja', 3, 'Benz Circle'], ['Pavani Devi', 3, 'Governorpet'], ['Arjun Reddy', 3, 'Patamata'], ['Sowmya Lakshmi', 3, 'Labbipet'],
  ];
  const reps = repSpecs.map(([name, m, hq], i) => {
    const p = person(name, `CL-MR-${String(i + 1).padStart(3, '0')}`, desMr, managerSpecs[m][1], hq, managers[m].id, shift(today, -900 + i * 37));
    p.area = hq;
    p.territory = managerSpecs[m][1];
    return p;
  });
  const by = (name: string) => reps.find(r => r.name === name)!;
  // A joiner from last week, added before anybody was named to approve their day.
  const joiner = person('Farhan Siddiqui', 'CL-MR-017', desMr, 'Hyderabad West', 'Madhapur', null, shift(today, -6));
  // Somebody who left in the summer; their history stays.
  const left = person('Prakash Goud', 'CL-MR-009X', desMr, 'Warangal', 'Kazipet', managers[2].id, shift(today, -1200), { status: 'inactive' });
  const everyone = [rsm, ...managers, ...reps, joiner, left];
  for (const e of everyone) {
    if (e.manager_id) add('manager_assignments', { id: uid('mga'), employee_id: e.id, manager_id: e.manager_id, period: `[${e.joined_at},)`, changed_by: null, created_at: e.created_at });
    add('territory_assignments', { id: uid('tas'), employee_id: e.id, territory_id: e.territory_id, area_ids: e.hq && areaId.get(e.hq as string) ? [areaId.get(e.hq as string)] : [], period: `[${e.joined_at},)`, assigned_by: null, created_at: e.created_at });
  }

  // ── logins ──
  add('app_users', { id: uid('aus'), user_id: DEMO_USER, employee_id: null, role: 'owner', scope: 'company', status: 'active', created_at: created, updated_at: created, email: 'demo@mrsales.in', must_change_password: false, invited_at: null });
  for (const [role, email] of [['admin', 'sneha.admin@cleocure.in'], ['hr', 'hr@cleocure.in'], ['finance', 'accounts@cleocure.in']] as const) {
    add('app_users', { id: uid('aus'), user_id: uid('usr'), employee_id: null, role, scope: 'company', status: 'active', created_at: created, updated_at: at(shift(today, -between(0, 4)), 11), email, must_change_password: false, invited_at: created });
  }
  add('app_users', { id: uid('aus'), user_id: uid('usr'), employee_id: rsm.id, role: 'management', scope: 'team', status: 'active', created_at: created, updated_at: at(shift(today, -1), 18), email: rsm.email, must_change_password: false, invited_at: created });
  for (const e of [...managers, ...reps]) {
    e.last_device_id = `android-${(e.code as string).toLowerCase()}`;
    add('app_users', { id: uid('aus'), user_id: uid('usr'), employee_id: e.id, role: 'field', scope: managers.includes(e) ? 'team' : 'own', status: 'active', created_at: e.created_at, updated_at: created, email: e.email, must_change_password: e === by('Pavani Devi'), invited_at: e.created_at });
  }
  add('app_users', { id: uid('aus'), user_id: uid('usr'), employee_id: left.id, role: 'field', scope: 'own', status: 'suspended', created_at: left.created_at, updated_at: at(shift(today, -95), 12), email: left.email, must_change_password: false, invited_at: left.created_at });

  // ── clients ──
  const specialties = ['General Physician', 'Cardiologist', 'Diabetologist', 'Gynaecologist', 'Paediatrician', 'Orthopaedic', 'Dermatologist', 'ENT', 'Pulmonologist', 'Neurologist'];
  for (const name of specialties) add('client_specialties', { id: uid('spc'), name });
  const first = ['Kavitha', 'Sandeep', 'Farhan', 'Padmaja', 'Ramesh', 'Anitha', 'Suresh', 'Lalitha', 'Vamshi', 'Haritha', 'Prasad', 'Sujatha', 'Naveen', 'Rajani', 'Mahesh', 'Shirisha', 'Krishna', 'Deepika', 'Raghav', 'Bhavani', 'Imran', 'Sravani', 'Gopal', 'Madhavi', 'Chaitanya', 'Rekha', 'Anand', 'Jyothi', 'Hemanth', 'Usha'];
  const last = ['Rachakonda', 'Vemuri', 'Ali', 'Kolli', 'Babu', 'Reddy', 'Naidu', 'Devi', 'Krishna', 'Rao', 'Sharma', 'Chowdary', 'Gupta', 'Varma', 'Kumar', 'Prasad', 'Murthy', 'Shastry', 'Khan', 'Raju'];
  const chemists = ['Sri Sai Medicals', 'Apollo Pharmacy', 'MedPlus', 'Krishna Medical Hall', 'Balaji Pharmacy', 'Venkateswara Medicals', 'Lakshmi Medical Stores', 'Sri Ram Pharma', 'Vijaya Medicals'];
  const hospitals = ['Care Hospital', 'Yashoda Hospital', 'Sunshine Hospital', 'Lotus Children\'s Hospital', 'Ramesh Hospitals', 'Aster Prime', 'KIMS', 'Medicover'];
  const clients: (Row & { id: string; name: string; type: string; owner_employee_id: string | null; area_id: string; lat: number | null; lng: number | null })[] = [];
  const used = new Set<string>();
  const docName = () => {
    for (;;) {
      const nm = `Dr. ${pick(first)} ${pick(last)}`;
      if (!used.has(nm)) { used.add(nm); return nm; }
    }
  };
  for (const rep of reps) {
    const aid = areaId.get(rep.hq as string)!;
    const [la, ln] = centre[rep.hq as string];
    const count = between(13, 16);
    for (let i = 0; i < count; i++) {
      const type = i < count - 5 ? 'doctor' : i < count - 2 ? 'chemist' : i < count - 1 ? 'hospital' : pick(['doctor', 'stockist', 'diagnostics']);
      // Shops and hospitals are named once per area, so the only duplicate is the one placed on purpose.
      const name = type === 'doctor' ? docName() : type === 'chemist' ? `${chemists[(i + reps.indexOf(rep) * 3) % chemists.length]}, ${rep.hq}` : type === 'hospital' ? `${hospitals[reps.indexOf(rep) % hospitals.length]}, ${rep.hq}` : type === 'stockist' ? `${pick(['Sri Durga', 'Annapurna', 'Sai Ganesh'])} Pharma Distributors, ${rep.hq}` : `${pick(['Vijaya', 'Lucid', 'Tenet'])} Diagnostics, ${rep.hq}`;
      const listed = chance(0.72);
      const cl = clusterOf.get(aid)!;
      const birthday = chance(0.12) ? shift(today, between(1, 32)) : null;
      clients.push(add('clients', {
        id: uid('cli'), name, type, category: listed ? pick(['coreTarget', 'regular', 'regular', 'potential']) : pick(['regular', 'potential']),
        listing: listed ? 'listed' : 'unlisted', is_active: true,
        specialty: type === 'doctor' ? pick(specialties) : null, designation: type === 'doctor' ? pick(['MBBS', 'MD', 'MS', 'DNB']) : null,
        area_id: aid, territory_id: rep.territory_id, cluster_id: pick(cl).id, owner_employee_id: rep.id,
        mobile: `9${between(100000000, 999999999)}`, email: null, contact_person: type === 'doctor' ? null : `${pick(first)} ${pick(last)}`,
        address_line: `${between(1, 9)}-${between(1, 12)}-${between(10, 400)}, ${pick(cl).name}`, city: rep.hq, pincode: String(500000 + between(1, 99)),
        lat: la + (rnd() - 0.5) * 0.03, lng: ln + (rnd() - 0.5) * 0.03,
        special_date: birthday, special_occasion: birthday ? pick(['Birthday', 'Wedding anniversary', 'Clinic anniversary']) : null, special_occasion_note: null,
        total_visits: 0, last_visit_at: null, next_planned_visit_at: null,
        created_at: at(shift(today, -between(20, 500)), 11), updated_at: created,
      }) as never);
    }
  }
  // Gaps the data quality page exists for.
  for (const c of clients.filter((_, i) => i % 29 === 7)) { c.lat = null; c.lng = null; }
  for (const c of clients.filter((_, i) => i % 41 === 11)) c.owner_employee_id = null;
  // Two retired doctors (on the list, no longer called on), and one old import that is both unlisted and inactive.
  clients.filter(c => c.type === 'doctor').slice(3, 5).forEach(c => { (c as Row).listing = 'listed'; (c as Row).is_active = false; (c as Row).category = 'inactive'; });
  Object.assign(clients.filter(c => c.type === 'doctor')[6], { listing: 'unlisted', is_active: false });
  const dup = clients.find(c => c.type === 'doctor')!;
  clients.push(add('clients', { ...(dup as Row), id: uid('cli'), name: (dup.name as string).replace('Dr. ', 'Dr '), created_at: at(shift(today, -9), 12), listing: 'unlisted', category: 'potential' }) as never);
  // New this month.
  clients.filter((_, i) => i % 23 === 3).forEach(c => { (c as Row).created_at = at(shift(today, -between(0, Number(today.slice(8)) - 1)), 12); });

  // ── products, stockists, stock ──
  const productSpecs: [string, string, string, number][] = [
    ['CLC-001', 'Cleopan 40', '10 tablets', 118], ['CLC-002', 'Cleopan D', '10 capsules', 145], ['CLC-003', 'Glimecure M2', '15 tablets', 162],
    ['CLC-004', 'Glimecure M1', '15 tablets', 128], ['CLC-005', 'Atorcure 10', '10 tablets', 96], ['CLC-006', 'Atorcure 20', '10 tablets', 172],
    ['CLC-007', 'Telmicure 40', '15 tablets', 135], ['CLC-008', 'Telmicure H', '15 tablets', 158], ['CLC-009', 'Cefocure 200', '10 tablets', 210],
    ['CLC-010', 'Azicure 500', '3 tablets', 84], ['CLC-011', 'Calcicure D3', '15 tablets', 189], ['CLC-012', 'Ferrocure XT', '15 tablets', 176],
    ['CLC-013', 'Montecure LC', '10 tablets', 198], ['CLC-014', 'Coughcure syrup', '100 ml', 112], ['CLC-015', 'Vitacure Z', '15 capsules', 145],
    ['CLC-016', 'Dolocure 650', '15 tablets', 34],
  ];
  const products = productSpecs.map(([sku, name, pack, mrp], i) => add('products', {
    id: uid('pro'), sku, name, pack_size: pack, mrp, pts: Math.round(mrp * 0.72 * 100) / 100, gst_percent: 12,
    is_active: i < 14, created_at: at(shift(today, -600 + i * 10), 10), status: i < 14 ? 'active' : i === 14 ? 'draft' : 'retired',
  }));
  const active = products.filter(p => p.status === 'active');
  const stockists = [
    ['STK-HYD-01', 'Sri Durga Pharma Distributors', 'Hyderabad', 'Telangana', 'Hyderabad West'],
    ['STK-HYD-02', 'Annapurna Medical Agencies', 'Secunderabad', 'Telangana', 'Hyderabad East'],
    ['STK-WGL-01', 'Sai Ganesh Pharma', 'Warangal', 'Telangana', 'Warangal'],
    ['STK-VJA-01', 'Krishna Distributors', 'Vijayawada', 'Andhra Pradesh', 'Vijayawada'],
    ['STK-GNT-01', 'Guntur Medical Traders', 'Guntur', 'Andhra Pradesh', 'Guntur'],
  ].map(([code, name, city, state, terr], i) => add('stockists', {
    id: uid('stk'), code, name, city, state, gstin: `${state === 'Telangana' ? '36' : '37'}AAB${'CDEFG'[i]}${between(1000, 9999)}K1Z${i + 1}`,
    contact_person: `${pick(first)} ${pick(last)}`, phone: `9${between(100000000, 999999999)}`, email: `orders@${name.split(' ')[0].toLowerCase()}pharma.in`,
    address: `${between(1, 40)}, Pharma market, ${city}`, territory_id: territoryId.get(terr) ?? null, status: i === 4 ? 'inactive' : 'active',
    created_at: at(shift(today, -500 + i * 30), 10),
  }));
  for (const p of active) {
    for (let b = 0; b < 2; b++) {
      add('stock_batches', {
        id: uid('stb'), product_id: p.id, batch_no: `B${String(ty).slice(2)}${String(between(1, 12)).padStart(2, '0')}${between(10, 99)}`,
        expiry_date: b === 0 && chance(0.3) ? shift(today, between(20, 80)) : shift(today, between(200, 700)), quantity: between(200, 2400),
      });
    }
  }

  // ── a field day, every day, for six weeks ──
  const purposes = ['Product Detailing', 'Follow-up', 'Relationship Building', 'Order Collection', 'Sample Drop'];
  const quiet = by('Nikhil Varma'); // has not started today
  const silent = by('Ramya Krishna'); // nothing done for a week
  const onLeave = by('Rahul Yadav'); // approved leave, three days last week
  const fake = by('Sai Kiran Reddy'); // phone tried a fake location today
  const traveller = by('Anil Kumar Goud'); // a journey that does not add up
  const noGps = by('Venkatesh Babu'); // location off all week
  const leaveDays = new Set([shift(today, -6), shift(today, -5), shift(today, -4)].filter(working));
  const sick = by('Divya Sree'); // approved sick leave a month ago
  const sickDays = new Set([shift(today, -30), shift(today, -29)]);
  const ownClients = new Map(reps.map(r => [r.id, clients.filter(c => c.owner_employee_id === r.id || (c.owner_employee_id == null && c.area_id === areaId.get(r.hq as string)))]));
  // The last day the field worked: today once it has started, else the working day before.
  let lastWork = today;
  while (!working(lastWork) || (lastWork === today && nowH < 10)) lastWork = shift(lastWork, -1);
  const firstDay = shift(today, -44);
  for (let k = firstDay; k <= today; k = shift(k, 1)) {
    if (!working(k)) continue;
    const isToday = k === today;
    const daysAgo = Math.round((Date.parse(today) - Date.parse(k)) / 86_400_000);
    for (const rep of reps) {
      if ((rep === onLeave && leaveDays.has(k)) || (rep === sick && sickDays.has(k))) continue;
      const mine = ownClients.get(rep.id)!;
      const aid = areaId.get(rep.hq as string)!;
      const meeting = !isToday && chance(0.03);
      const plan = add('day_plans', {
        id: uid('dpl'), employee_id: rep.id, work_date: k, work_type: meeting ? 'meeting' : 'fieldWork', area_id: aid,
        cluster_id: pick(clusterOf.get(aid)!).id, cluster_name: null, tour_type: 'local', remarks: null,
        captured_lat: (rep.lat as number) + (rnd() - 0.5) * 0.01, captured_lng: (rep.lng as number) + (rnd() - 0.5) * 0.01,
        captured_address: `${rep.hq}, ${rep.territory === 'Vijayawada' ? 'Vijayawada' : rep.territory === 'Warangal' ? 'Warangal' : 'Hyderabad'}`,
        declared_at: at(k, 8.9 + rnd() * 0.6), created_at: at(k, 9), updated_at: at(k, 9),
      });
      if (meeting) continue;
      if (isToday && rep === quiet && nowH < 9) continue;
      const calls = between(7, 9);
      let h = 9.6 + rnd() * 0.5;
      const order = [...mine].sort(() => rnd() - 0.5);
      for (let c = 0; c < calls; c++) {
        const client = order[c % order.length];
        const when = Math.min(h, 18.7);
        h += 0.7 + rnd() * 0.55;
        const future = isToday && when > nowH;
        let status = future ? 'planned' : 'completed';
        if (!future && chance(daysAgo > 0 ? 0.09 : 0.03)) status = 'missed';
        if (isToday && rep === quiet) status = 'planned';
        if (rep === silent && daysAgo <= 7 && daysAgo > 0) status = 'missed';
        if (!future && daysAgo > 0 && daysAgo < 9 && chance(0.004)) status = 'inProgress';
        const done = status === 'completed' || status === 'inProgress';
        const noLoc = rep === noGps && daysAgo <= 6;
        let verdict: string | null = done ? (noLoc ? 'unavailable' : chance(0.82) ? 'verified' : chance(0.6) ? 'outOfRange' : 'unavailable') : null;
        if (done && client.lat == null) verdict = 'unavailable';
        let mocked = false;
        if (rep === fake && k === lastWork && c === 2 && done) {
          verdict = 'suspect';
          mocked = true;
        }
        const start = at(k, when + (rnd() - 0.4) * 0.3);
        const dist = verdict === 'verified' ? rnd() * 45 : verdict === 'outOfRange' ? 80 + rnd() * 900 : null;
        const act = add('activities', {
          id: uid('act'), employee_id: rep.id, client_id: client.id, day_plan_id: plan.id, status, work_type: 'fieldWork',
          purpose: pick(purposes), is_unplanned: chance(0.08), scheduled_start: at(k, when), scheduled_end: at(k, when + 0.5),
          actual_start: done ? start : null, actual_end: status === 'completed' ? at(k, when + 0.2 + rnd() * 0.3) : null,
          contact_person: null, contact_mobile: null,
          feedback: status === 'completed' ? pick(['Interested in the new strength.', 'Prescribing regularly.', 'Asked for samples next visit.', 'Prefers a competitor brand for now.', 'Busy, short meeting.', 'Will try on three patients.']) : null,
          remarks: status === 'missed' ? pick(['Doctor not available', 'Clinic closed', 'In surgery', null]) : null,
          pop: status === 'completed' && chance(0.3) ? 'Visual aid' : null, inputs_given: status === 'completed' && chance(0.4) ? 'Samples' : null,
          pob_amount: status === 'completed' && client.type === 'chemist' && chance(0.5) ? between(8, 60) * 100 : null,
          rcpa_score: null, expected_next_visit: status === 'completed' ? shift(k, between(7, 21)) : null,
          geo_verdict: verdict, geo_radius_m: done ? 50 : null, geo_distance_m: dist,
          // The captured position sits as far from the client as the distance says.
          geo_lat: done && verdict !== 'unavailable' && client.lat != null ? client.lat + (dist ?? 15) / 111_000 * Math.sin(c * 2.1) : null,
          geo_lng: done && verdict !== 'unavailable' && client.lng != null ? client.lng + (dist ?? 15) / 106_000 * Math.cos(c * 2.1) : null,
          geo_captured_at: done ? start : null, out_of_range_reason: verdict === 'outOfRange' ? pick(['Met the doctor at the hospital', 'Clinic has moved', 'Location shown wrongly']) : null,
          location_name: client.name, area_name: rep.hq, created_at: at(k, 8.95), updated_at: start,
          photo_paths: status === 'completed' && chance(0.15) ? [`demo/${rep.id}/${k}/visit-${c + 1}.jpg`] : [],
          geo_accuracy_m: done && verdict !== 'unavailable' ? 6 + rnd() * 30 : null, geo_mocked: mocked, geo_claimed_verdict: mocked ? 'verified' : null, tour_day_id: null,
        });
        if (status === 'completed') {
          client.total_visits = (client.total_visits as number) + 1;
          if (!client.last_visit_at || (client.last_visit_at as string) < k) client.last_visit_at = k;
          if ((act.purpose === 'Product Detailing' || act.purpose === 'Sample Drop') && client.type === 'doctor') {
            for (const p of [pick(active), pick(active)]) {
              if (!(T.activity_products ?? []).some(x => x.activity_id === act.id && x.product_id === p.id)) {
                (T.activity_products ??= []).push({ activity_id: act.id, product_id: p.id });
              }
            }
          }
          if (client.type === 'chemist' && chance(0.35)) {
            const p = pick(active);
            add('activity_rcpa_entries', {
              id: uid('rcp'), activity_id: act.id, product_id: p.id, product_name: p.name, own_quantity: between(5, 60),
              competitor_name: chance(0.85) ? pick(['Pantocid', 'Glycomet', 'Atorva', 'Telma', 'Taxim-O', 'Azithral', 'Shelcal', 'Montair']) : null,
              competitor_quantity: between(0, 80),
            });
          }
        }
      }
    }
  }
  // Managers declare their day too: joint work with a rep, or a review at the office.
  for (let k = firstDay; k <= today; k = shift(k, 1)) {
    if (!working(k) || (k === today && nowH < 9)) continue;
    for (const m of [rsm, ...managers]) {
      const aid = areaId.get(m.hq as string) ?? null;
      add('day_plans', {
        id: uid('dpl'), employee_id: m.id, work_date: k, work_type: chance(0.75) ? 'fieldWork' : 'meeting', area_id: aid,
        cluster_id: null, cluster_name: null, tour_type: 'local', remarks: chance(0.6) ? 'Joint work' : null,
        captured_lat: m.lat, captured_lng: m.lng, captured_address: m.hq, declared_at: at(k, 9 + rnd() * 0.5), created_at: at(k, 9), updated_at: at(k, 9),
      });
    }
  }

  // Last seen, from the last thing each phone did.
  const lastAct = new Map<string, string>();
  for (const a of T.activities ?? []) if (a.actual_start && (!lastAct.has(a.employee_id as string) || (a.actual_start as string) > lastAct.get(a.employee_id as string)!)) lastAct.set(a.employee_id as string, a.actual_start as string);
  for (const e of everyone) e.last_seen_at = lastAct.get(e.id) ?? (e.last_device_id ? at(lastWork, 18.5) : null);
  for (const c of clients) {
    const next = (T.activities ?? []).find(a => a.client_id === c.id && a.status === 'planned');
    c.next_planned_visit_at = next ? dayKey(new Date(next.scheduled_start as string)) : null;
  }

  // The fake location attempt the phone blocked, and the mocked visit.
  const fakeClient = ownClients.get(fake.id)![3];
  add('fake_location_attempts', {
    id: uid('fla'), employee_id: fake.id, client_id: fakeClient.id, purpose: 'visit', fake_lat: (fakeClient.lat ?? 17.45) + 0.02, fake_lng: (fakeClient.lng ?? 78.39) + 0.01,
    fake_distance_m: 12, real_lat: fake.lat, real_lng: fake.lng, real_seen_at: at(lastWork, 11.1), real_distance_m: 2400,
    created_at: at(lastWork, 11.2),
  });
  fake.last_mock_at = at(lastWork, 11.2);

  // ── leave ──
  const leave = (e: Person, type: string, from: string, to: string, status: string, reason: string, applied: string) => {
    let days = 0;
    for (let k = from; k <= to; k = shift(k, 1)) if (working(k)) days++;
    return add('leave_requests', { id: uid('lea'), employee_id: e.id, type, from_date: from, to_date: to, days, reason, status, applied_at: at(applied, 18), decided_at: status === 'pending' ? null : at(shift(applied, 1), 10), decided_by: status === 'pending' ? null : e.manager_id });
  };
  const ld = [...leaveDays].sort();
  if (ld.length) leave(onLeave, 'casual', ld[0], ld[ld.length - 1], 'approved', 'Sister\'s wedding in Karimnagar.', shift(ld[0], -10));
  leave(sick, 'sick', shift(today, -30), shift(today, -29), 'approved', 'Fever.', shift(today, -31));
  leave(by('Kiran Teja'), 'casual', shift(today, 9), shift(today, 10), 'pending', 'Family function in Guntur.', shift(today, -2));
  leave(by('Harika Naidu'), 'earned', shift(today, 16), shift(today, 20), 'pending', 'Annual leave, travelling home to Nellore.', shift(today, -4));
  leave(by('Meghana Rao'), 'casual', shift(today, -60), shift(today, -60), 'rejected', 'Personal work.', shift(today, -61));

  // ── tour plans: this month approved, next month waiting or in draft ──
  const tourMonth = (e: Person, y: number, m: number, status: string, full: boolean) => {
    const id = uid('tpm');
    add('tour_plan_months', { id, employee_id: e.id, plan_year: y, plan_month: m, status, submitted_at: status === 'draft' ? null : status === 'pending' ? at(shift(today, -between(0, 3)), 19) : at(shift(`${y}-${String(m).padStart(2, '0')}-01`, -between(3, 8)), 19), decided_at: status === 'approved' ? at(shift(`${y}-${String(m).padStart(2, '0')}-01`, -2), 11) : null, decided_by: status === 'approved' ? e.manager_id : null, created_at: at(shift(`${y}-${String(m).padStart(2, '0')}-01`, -12), 19), updated_at: created });
    const daysIn = new Date(y, m, 0).getDate();
    const mine = ownClients.get(e.id) ?? [];
    for (let d = 1; d <= daysIn; d++) {
      const k = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const off = !working(k);
      if (!off && !full && d > daysIn - 6) continue;
      const names = off ? [] : [...mine].sort(() => rnd() - 0.5).slice(0, between(6, 9));
      add('tour_plan_days', { id: uid('tpd'), month_id: id, employee_id: e.id, work_date: k, work_type: off ? 'holiday' : chance(0.04) ? 'meeting' : 'fieldWork', area_id: areaId.get(e.hq as string) ?? null, tour_type: off ? 'local' : chance(0.06) ? 'outstation' : 'local', travel_mode: off ? null : 'bike', destination: off ? null : e.hq, purpose: null, planned_visits: names.length, estimated_km: off ? null : between(18, 60), client_names: names.map(c => c.name), remarks: null, client_ids: names.map(c => c.id) });
    }
  };
  const next = new Date(ty, tm, 1);
  const [ny, nm] = [next.getFullYear(), next.getMonth() + 1];
  reps.forEach((r, i) => {
    tourMonth(r, ty, tm, 'approved', true);
    if (i % 4 === 0) tourMonth(r, ny, nm, 'pending', i !== 4);
    else if (i % 4 === 1) tourMonth(r, ny, nm, 'draft', false);
  });

  // ── expenses: last month decided, this month in flight ──
  const prev = new Date(ty, tm - 2, 1);
  const [py, pm] = [prev.getFullYear(), prev.getMonth() + 1];
  const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
  const worked = (e: Person, prefix: string) => [...new Set((T.day_plans ?? []).filter(d => d.employee_id === e.id && (d.work_date as string).startsWith(prefix)).map(d => d.work_date as string))].sort();
  // In the first ten days of a month, last month's claims are the ones being sent and decided.
  const pendingClaims = new Set(['Harika Naidu', 'Srinivas Chary', 'Swathi Reddy', 'Arjun Reddy']);
  const claimMonth = Number(today.slice(8)) <= 10 ? monthKey(py, pm) : monthKey(ty, tm);
  for (const rep of reps) {
    for (const [prefix, current] of [[monthKey(py, pm), false], [monthKey(ty, tm), true]] as const) {
      for (const k of worked(rep, prefix)) {
        if (current && k >= today) continue;
        const inFlight = prefix === claimMonth;
        const travel = chance(0.08);
        const big = inFlight && pendingClaims.has(rep.name) && chance(0.22);
        const amount = 350 + (travel ? between(2, 9) * 50 : 0) + (big ? between(6, 16) * 100 : 0);
        const extra = big ? pick([['lodging', 'Stayed overnight for the CME at Warangal.'], ['courier', 'Couriered samples to the Kazipet chemists.'], ['food', 'Team dinner with the doctors after the launch.']]) : null;
        const status = inFlight ? (pendingClaims.has(rep.name) ? 'pending' : current ? 'draft' : 'approved')
          : !current ? (chance(0.02) ? 'rejected' : 'approved') : 'draft';
        add('expenses', {
          id: uid('exp'), employee_id: rep.id, work_date: k, amount, categories: ['dailyAllowance', ...(travel ? ['travel'] : []), ...(extra ? [extra[0]] : [])],
          description: extra ? extra[1] : null,
          remarks: null, travel_mode: travel ? 'bike' : null, destination: travel ? pick(['Shamshabad', 'Nalgonda', 'Jangaon', 'Guntur', 'Machilipatnam']) : rep.hq,
          status, receipt_paths: amount > 500 ? [`demo/${rep.id}/${k}/bill.jpg`] : [],
          submitted_at: status === 'draft' ? null : status === 'pending' ? at(shift(today, -between(1, 3)), 19) : at(`${monthKey(ty, tm)}-02`, 19),
          decided_at: status === 'approved' || status === 'rejected' ? at(shift(today, -1), 11) : null,
          decided_by: status === 'approved' || status === 'rejected' ? rep.manager_id : null,
          created_at: at(k, 20), updated_at: at(k, 20),
        });
      }
    }
  }

  // Two things for the office to look at: a Sunday claimed with no day plan, and a big day with no bill.
  {
    const [cy, cm] = claimMonth.split('-').map(Number);
    const sunday = Array.from({ length: 28 }, (_, i) => `${claimMonth}-${String(i + 1).padStart(2, '0')}`).find(k => !working(k) && k < today && new Date(cy, cm - 1, Number(k.slice(8))).getDay() === 0);
    const harika = by('Harika Naidu');
    if (sunday) add('expenses', { id: uid('exp'), employee_id: harika.id, work_date: sunday, amount: 600, categories: ['travel'], description: 'Drove to Nalgonda for Monday\'s CME.', remarks: null, travel_mode: 'car', destination: 'Nalgonda', status: 'pending', receipt_paths: [], submitted_at: at(shift(today, -2), 19), decided_at: null, decided_by: null, created_at: at(sunday, 20), updated_at: at(sunday, 20) });
    const swathi = (T.expenses ?? []).find(e => e.employee_id === by('Swathi Reddy').id && (e.work_date as string).startsWith(claimMonth) && e.status === 'pending' && Number(e.amount) > 500);
    if (swathi) swathi.receipt_paths = [];
  }

  // ── orders ──
  for (let i = 0; i < 26; i++) {
    const rep = pick(reps);
    const chem = (ownClients.get(rep.id) ?? []).filter(c => c.type === 'chemist' || c.type === 'hospital');
    const client = chem.length ? pick(chem) : pick(clients);
    const pending = i < 6;
    const day = shift(today, pending ? -between(1, 8) : -between(3, 50));
    const status = pending ? 'pending' : i < 8 ? 'rejected' : i < 20 ? 'approved' : 'fulfilled';
    const stockist = chance(0.9) ? stockists.find(st => st.territory_id === rep.territory_id) ?? stockists[0] : null;
    const id = uid('ord');
    let subtotal = 0;
    const lines = between(1, 4);
    for (let l = 0; l < lines; l++) {
      const p = active[(i * 3 + l) % active.length];
      const quantity = between(2, 20) * 5;
      const unit = p.pts as number;
      const foc = lines > 1 && l === lines - 1 && chance(0.2);
      const line_total = foc ? 0 : Math.round(quantity * unit * 100) / 100;
      subtotal += line_total;
      add('order_items', { id: uid('ori'), order_id: id, product_id: p.id, quantity, unit_price: unit, is_foc: foc, line_total });
    }
    const discount = pending && i === 1 ? 12 : pick([0, 2, 3, 5]);
    const afterDiscount = subtotal * (1 - discount / 100);
    const gst = Math.round(afterDiscount * 0.12 * 100) / 100;
    add('orders', { id, employee_id: rep.id, client_id: client.id, status, discount_percent: discount, gst_amount: gst, subtotal: Math.round(subtotal * 100) / 100, total: Math.round((afterDiscount + gst) * 100) / 100, remarks: null, submitted_at: at(day, 15), decided_at: pending ? null : at(shift(day, 1), 11), decided_by: pending ? null : rep.manager_id, created_at: at(day, 15), updated_at: at(day, 15), stockist_id: stockist?.id ?? null });
  }

  // Approved and fulfilled orders became sales the day they were decided, as decide_orders does.
  for (const o of (T.orders ?? []).filter(x => x.status === 'approved' || x.status === 'fulfilled')) {
    for (const i of (T.order_items ?? []).filter(x => x.order_id === o.id)) {
      add('sales_records', { id: uid('sal'), employee_id: o.employee_id, client_id: o.client_id, product_id: i.product_id, sale_date: dayKey(new Date(o.decided_at as string)), quantity: i.quantity, amount: i.is_foc ? 0 : i.line_total, source: 'order', created_at: o.decided_at });
    }
  }

  // ── sales and targets, a year of them ──
  for (let i = 12; i >= 0; i--) {
    const d = new Date(ty, tm - 1 - i, 1);
    const [y, m] = [d.getFullYear(), d.getMonth() + 1];
    const daysIn = new Date(y, m, 0).getDate();
    const lastDay = i === 0 ? Number(today.slice(8)) : daysIn;
    reps.forEach((rep, ri) => {
      const base = [175000, 150000, 162000, 138000][Math.floor(ri / 4)];
      const season = 1 + 0.12 * Math.sin((m / 12) * Math.PI * 2);
      const target = Math.round((base * season) / 1000) * 1000;
      add('targets', { id: uid('tgt'), employee_id: rep.id, product_id: null, period_year: y, period_month: m, amount: target });
      const pace = (0.62 + ((ri * 37 + i * 11) % 50) / 100) * (i === 0 ? lastDay / daysIn : 1);
      let left = target * pace;
      const entries = between(4, 7);
      for (let e = 0; e < entries && left > 0; e++) {
        const amount = e === entries - 1 ? left : Math.round(left * (0.15 + rnd() * 0.3));
        left -= amount;
        const p = pick(active);
        add('sales_records', { id: uid('sal'), employee_id: rep.id, client_id: null, product_id: p.id, sale_date: `${y}-${String(m).padStart(2, '0')}-${String(between(1, Math.max(1, lastDay))).padStart(2, '0')}`, quantity: Math.max(1, Math.round(amount / (p.pts as number))), amount: Math.round(amount), source: 'primary', created_at: created });
      }
    });
  }

  // ── documents, payslips, tasks, complaints ──
  const docCats = ['ID proof', 'Offer letter', 'Appointment letter', 'Address proof', 'Education', 'Bank details', 'Licence'];
  for (const e of [...managers, ...reps]) {
    for (const cat of docCats.slice(0, between(2, 4))) {
      const expires = cat === 'Licence' || (cat === 'ID proof' && chance(0.2)) ? shift(today, between(-10, 300)) : null;
      add('documents', { id: uid('doc'), employee_id: e.id, title: `${cat}, ${e.name}`, category: cat, storage_path: `demo/${e.id}/${cat.toLowerCase().replace(/\s/g, '-')}.pdf`, released_at: at(shift(e.joined_at as string, 2), 11), released_by: null, expires_at: expires });
    }
  }
  for (const e of [...managers, ...reps]) {
    const gross = managers.includes(e) ? 68000 : 34000 + (reps.indexOf(e) % 5) * 2500;
    // Two months released; a few people had a raise or a day without pay in between.
    const before = new Date(py, pm - 2, 1);
    const [by2, bm2] = [before.getFullYear(), before.getMonth() + 1];
    if (e.joined_at as string < `${monthKey(by2, bm2)}-01`) add('payslips', { id: uid('pay'), employee_id: e.id, period_year: by2, period_month: bm2, net_pay: Math.round(gross * 0.86) - (chance(0.2) ? 1500 : 0), storage_path: null, released_at: at(`${monthKey(py, pm)}-01`, 10) });
    add('payslips', { id: uid('pay'), employee_id: e.id, period_year: py, period_month: pm, net_pay: Math.round(gross * 0.86) - (chance(0.1) ? 1170 : 0), storage_path: null, released_at: at(`${monthKey(ty, tm)}-01`, 10) });
  }
  const taskSpecs: [string, string, number, string][] = [
    ['Collect the CME attendance list from Care Hospital', 'Sai Kiran Reddy', 3, 'open'],
    ['Get Dr. Padmaja Kolli\'s new clinic address', 'Sai Kiran Reddy', -2, 'open'],
    ['Return the expired Cefocure samples to the stockist', 'Srinivas Chary', 5, 'open'],
    ['Update the chemist list for Hanamkonda', 'Swathi Reddy', 10, 'open'],
    ['Book the hall for the Warangal doctors\' meet', 'Mohammed Irfan', -4, 'open'],
    ['Submit the September stock statement', 'Kavya Reddy', -12, 'done'],
    ['Visit the three new paediatricians in Patamata', 'Arjun Reddy', -6, 'done'],
    ['Collect payment from Sri Sai Medicals', 'Nikhil Varma', 1, 'open'],
    ['Share the Glimecure launch visual aid with the team', 'Lakshmi Prasanna', -20, 'done'],
  ];
  for (const [title, who, due, status] of taskSpecs) {
    const e = everyone.find(x => x.name === who)!;
    add('tasks', { id: uid('tsk'), assignee_id: e.id, assigner_id: e.manager_id ?? rsm.id, title, description: null, due_date: shift(today, due), status, completed_at: status === 'done' ? at(shift(today, due - 1), 16) : null, created_at: at(shift(today, due - 9), 10) });
  }
  const complaintSpecs: [string, string, string, string, boolean][] = [
    ['Short supply in the last order', 'Received 40 strips of Cleopan 40 against 60 ordered. The stockist says the rest is on the way.', 'Harika Naidu', 'open', false],
    ['Damaged strips in Cefocure 200', 'Two boxes arrived with crushed strips. Photos taken.', 'Kiran Teja', 'open', true],
    ['Scheme not applied on invoice', 'The 10 + 1 scheme was not applied on the September invoice.', 'Pranay Rao', 'inProgress', true],
    ['Expiry too close on Calcicure D3', 'The batch received expires in under three months.', 'Venkatesh Babu', 'resolved', true],
    ['Doctor wants the new strength', 'Dr. asked when Telmicure 80 will be available.', 'Divya Sree', 'open', false],
  ];
  for (const [subject, body, who, status, assigned] of complaintSpecs) {
    const e = by(who);
    add('complaints', { id: uid('cmp'), employee_id: e.id, client_id: pick(ownClients.get(e.id)!).id, subject, body, status, attachment_paths: [], created_at: at(shift(today, -between(1, 20)), 13), updated_at: at(shift(today, -1), 13), assigned_to: assigned ? e.manager_id : null, resolution: status === 'resolved' ? 'Replaced with a batch of 14 months\' expiry.' : null });
  }

  // ── surveys, resources, notifications, exports, audit ──
  const survey = add('surveys', { id: uid('sur'), title: 'Glimecure M2 first impressions', body: 'How likely is the doctor to prescribe Glimecure M2 to new patients, from 1 to 5? What would change their mind?', is_active: true, created_at: at(shift(today, -18), 10) });
  add('surveys', { id: uid('sur'), title: 'Monsoon cough season stock check', body: 'Does the chemist have Coughcure syrup in stock, and how many bottles moved last week?', is_active: false, created_at: at(shift(today, -70), 10) });
  const answers = ['Will start with diabetic patients over 50.', 'Wants the price closer to Glycomet.', 'Already prescribing, happy with results.', 'Needs more samples before deciding.', 'Not convinced yet.', 'Asked for a CME on the molecule.'];
  for (let i = 0; i < 14; i++) {
    const rep = pick(reps);
    add('survey_responses', { id: uid('srr'), survey_id: survey.id, employee_id: rep.id, answers: { client_id: pick(ownClients.get(rep.id)!).id, score: chance(0.15) ? null : between(2, 5), answer: pick(answers) }, submitted_at: at(shift(today, -between(0, 16)), 12 + rnd() * 5) });
  }
  const resources: [string, string, string, string, string, string][] = [
    ['Glimecure M2 visual aid', 'E-Detailing', 'glimecure-m2-va.pdf', 'application/pdf', 'active', 'Six pages for the first detailing of Glimecure M2 to diabetologists.'],
    ['Price list, October', 'Price List', 'price-list-october.pdf', 'application/pdf', 'active', 'PTS, PTR and MRP for every active product.'],
    ['Atorcure product monograph', 'Product Information', 'atorcure-monograph.pdf', 'application/pdf', 'active', null as unknown as string],
    ['Telmicure detailing video', 'E-Detailing', 'telmicure-detailing.mp4', 'video/mp4', 'active', 'Three minute video for tablets.'],
    ['Price list, September', 'Price List', 'price-list-september.pdf', 'application/pdf', 'archived', 'Superseded by October.'],
  ];
  resources.forEach(([title, category, file_name, mime_type, status, description], i) => {
    const fam = uid('fam');
    add('resources', { id: uid('res'), title, category, storage_path: `demo/resources/${file_name}`, published_at: at(shift(today, -between(3, 60) - i * 5), 11), description, file_name, mime_type, size_bytes: mime_type === 'video/mp4' ? 18_400_000 : between(400_000, 3_800_000), version: i === 1 ? 2 : 1, family_id: fam, status, published_by: DEMO_USER });
  });
  for (const e of (T.expenses ?? []).filter(x => x.status === 'approved').slice(0, 60)) {
    if (chance(0.25)) add('notifications', { id: uid('not'), employee_id: e.employee_id, title: 'Expense approved', body: `Your claim for ${e.work_date} was approved.`, kind: 'approval', is_read: chance(0.7), created_at: e.decided_at, entity: 'expense', entity_id: e.id, deep_link: null, group_count: 1 });
  }
  for (const t of T.tasks ?? []) add('notifications', { id: uid('not'), employee_id: t.assignee_id, title: 'New task', body: t.title, kind: 'task', is_read: t.status === 'done', created_at: t.created_at, entity: 'task', entity_id: t.id, deep_link: null, group_count: 1 });
  add('notifications', { id: uid('not'), employee_id: fake.id, title: 'Fake location blocked', body: 'A fake location app was detected. Turn it off to log visits.', kind: 'location', is_read: false, created_at: fake.last_mock_at, entity: null, entity_id: null, deep_link: null, group_count: 1 });
  for (const r of reps) add('notifications', { id: uid('not'), employee_id: r.id, title: 'New resource', body: 'Price list, October is on your phone.', kind: 'document', is_read: chance(0.6), created_at: at(shift(today, -6), 11), entity: 'resource', entity_id: null, deep_link: null, group_count: 1 });
  const exportsSpec: [string, string, number][] = [['dcr', 'ready', 1], ['expenses', 'ready', 3], ['clients', 'ready', 8], ['tourPlan', 'failed', 12]];
  for (const [kind, status, ago] of exportsSpec) add('export_jobs', { id: uid('exj'), requested_by: null, kind, params: { month: monthKey(py, pm), employee_id: null }, status, storage_path: status === 'ready' ? `demo/exports/${kind}-${monthKey(py, pm)}.csv` : null, error: status === 'failed' ? 'The month had no submitted tour plans.' : null, created_at: at(shift(today, -ago), 16), finished_at: at(shift(today, -ago), 16.02) });
  const audit: [string, string, string, string | null, string | null, number][] = [
    ['changed manager', 'Employee', 'Divya Sree', 'Lakshmi Prasanna', 'Ravi Teja Varma', 40],
    ['gave a phone login', 'Login', 'Farhan Siddiqui', null, null, 5],
    ['added a role on the field app', 'Role', 'Key Account Manager', null, null, 120],
    ['changed a role', 'Role', 'Key Account Manager', 'Active', 'Inactive', 30],
    ['reset a phone password', 'Login', 'Pavani Devi', null, null, 2],
    ['imported a product sheet', 'Product', '16 products', null, null, 200],
    ['marked as left', 'Employee', 'Prakash Goud', 'Active', 'Inactive', 95],
    ['handed over clients', 'Employee', 'Prakash Goud', null, 'Swathi Reddy', 95],
    ['changed company rules', 'Settings', 'Daily allowance', '₹300', '₹350', 60],
    ['invited a user', 'Login', 'accounts@cleocure.in', null, 'Finance', 150],
  ];
  for (const [action, entity, label, before, after, ago] of audit) add('audit_log', { id: uid('aud'), actor_user: DEMO_USER, actor_name: 'Pardhu Karnati', action, entity, entity_id: null, entity_label: label, before_value: before, after_value: after, reason: null, at: at(shift(today, -ago), 11 + rnd() * 6) });

  // ── the approval trail of what was decided ──
  for (const e of (T.expenses ?? []).filter(x => x.status === 'approved' || x.status === 'rejected')) {
    add('approval_events', { id: uid('ape'), entity: 'expense', entity_id: e.id, action: e.status, actor_id: e.decided_by, actor_name: everyone.find(p => p.id === e.decided_by)?.name ?? 'Someone', reason: e.status === 'rejected' ? 'No bill attached for the travel.' : null, at: e.decided_at });
  }
  for (const o of (T.orders ?? []).filter(x => x.decided_at)) {
    add('approval_events', { id: uid('ape'), entity: 'order', entity_id: o.id, action: o.status === 'rejected' ? 'rejected' : 'approved', actor_id: o.decided_by, actor_name: everyone.find(p => p.id === o.decided_by)?.name ?? 'Someone', reason: o.status === 'rejected' ? 'Discount above the stockist\'s slab.' : null, at: o.decided_at });
  }
  for (const l of (T.leave_requests ?? []).filter(x => x.decided_at)) {
    add('approval_events', { id: uid('ape'), entity: 'leave', entity_id: l.id, action: l.status, actor_id: l.decided_by, actor_name: everyone.find(p => p.id === l.decided_by)?.name ?? 'Someone', reason: l.status === 'rejected' ? 'Month end closing; please move it a week.' : null, at: l.decided_at });
  }
  for (const t of (T.tour_plan_months ?? []).filter(x => x.decided_at)) {
    add('approval_events', { id: uid('ape'), entity: 'tour', entity_id: t.id, action: 'approved', actor_id: t.decided_by, actor_name: everyone.find(p => p.id === t.decided_by)?.name ?? 'Someone', reason: null, at: t.decided_at });
  }

  // Tables the console reads that hold nothing in this company yet.
  for (const t of ['travel_rates', 'chat_threads']) T[t] ??= [];
  void traveller;
  return T;
}

/** The travel the arithmetic says could not have happened, for the travel_exceptions function. */
export function travelFor(T: Tables, since: string) {
  const anil = (T.employees ?? []).find(e => e.name === 'Anil Kumar Goud');
  if (!anil) return [];
  const today = dayKey(new Date());
  const k = (() => {
    for (let i = 2; i < 9; i++) {
      const d = shift(today, -i);
      if ((T.activities ?? []).some(a => a.employee_id === anil.id && a.status === 'completed' && dayKey(new Date(a.scheduled_start as string)) === d)) return d;
    }
    return shift(today, -2);
  })();
  if (k < since) return [];
  return [
    { employee_id: anil.id, employee_name: anil.name, happened_at: at(k, 12.2), km: 18.2, minutes: 9, implied_kmh: 121, reason: 'faster than a road' },
    { employee_id: anil.id, employee_name: anil.name, happened_at: at(k, 15.4), km: 0, minutes: 34, implied_kmh: null, reason: 'identical position' },
  ];
}
