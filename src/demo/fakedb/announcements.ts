import type { FakeDb, Row, Rpc } from './engine';

/**
 * Announcements (migration 0113), in memory: two already sent, with some of
 * the field having read them, and send_announcement, remind_announcement and
 * mark_announcement_read with the same rules as the database.
 */

const ORG = '0d3a1f00-demo-4000-8000-c1e0c0e00001';
const DEMO_USER = '0d3a1f00-demo-4000-8000-0000000000aa';
const RSM_USER = '0d3a1f00-demo-4000-8000-0000000000bb';
const now = () => new Date().toISOString();
const fail = (m: string): never => {
  throw new Error(m);
};
const istDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);

/** Everyone in an audience, today. */
export function audienceOf(employees: Row[], kind: string, id: string | null): Row[] {
  const active = employees.filter(e => e.status === 'active');
  if (kind === 'everyone') return active;
  if (kind === 'role') return active.filter(e => e.designation_id === id);
  if (kind === 'territory') return active.filter(e => e.territory_id === id);
  if (kind === 'team') {
    const out: Row[] = [];
    let level = active.filter(e => e.manager_id === id);
    for (let depth = 0; level.length && depth < 12; depth++) {
      out.push(...level);
      const ids = new Set(level.map(e => e.id));
      level = active.filter(e => ids.has(e.manager_id as string) && !out.includes(e));
    }
    return out;
  }
  return [];
}

export function seedAnnouncements(T: Record<string, Row[]>, today: Date) {
  const employees = T.employees ?? [];
  const day = (n: number, h: number) => new Date(today.getTime() - n * 864e5 + (h - 12) * 36e5).toISOString();
  const rsm = employees.find(e => e.code === 'CL-RSM-01');
  const ravi = employees.find(e => e.code === 'CL-ASM-01');
  const sent: { id: string; title: string; body: string; kind: string; aid: string | null; name: string; pinned: string | null; by: string; byName: string; at: string; readEvery: number }[] = [
    {
      id: '0d3a1f00-demo-4000-8000-a0000000a001', title: 'New price list from 1 November',
      body: 'The November price list is on your phone under Resources, Price lists.\nPTS changes for six products. Quote the new prices from 1 November; orders before then keep the old ones.',
      kind: 'everyone', aid: null, name: 'Everyone', pinned: istDay(new Date(today.getTime() + 20 * 864e5)), by: DEMO_USER, byName: 'Pardhu Karnati', at: day(9, 10.5), readEvery: 5,
    },
    {
      id: '0d3a1f00-demo-4000-8000-a0000000a002', title: 'Team review on Saturday at 10 am',
      body: 'Monthly review at the Madhapur office, Saturday 10 am. Bring your tour plan for next month and the list of doctors you could not meet.',
      kind: 'team', aid: (ravi?.id as string) ?? null, name: `${ravi?.name ?? 'Ravi Teja Varma'}'s team`, pinned: null, by: RSM_USER, byName: String(rsm?.name ?? 'Venkata Ramana Rao'), at: day(2, 17), readEvery: 2,
    },
  ];
  for (const a of sent) {
    (T.announcements ??= []).push({ id: a.id, org_id: ORG, title: a.title, body: a.body, audience_kind: a.kind, audience_id: a.aid, audience_name: a.name, pinned_until: a.pinned, created_by: a.by, created_by_name: a.byName, created_at: a.at });
    audienceOf(employees, a.kind, a.aid).forEach((e, i) => {
      // Most read it within a day; every readEvery-th person has not opened it yet.
      const read = (i + 1) % a.readEvery !== 0;
      (T.announcement_reads ??= []).push({ announcement_id: a.id, employee_id: e.id, org_id: ORG, read_at: read ? new Date(Date.parse(a.at) + (4 + i * 7) * 6e4).toISOString() : null, reminded_at: null });
    });
  }
  T.announcements ??= [];
  T.announcement_reads ??= [];
}

export function announcementRpcs(
  audit: (db: FakeDb, action: string, entity: string, label: string, before?: unknown, after?: unknown, reason?: unknown) => void,
  roleOf: () => string,
  me: string,
): Record<string, Rpc> {
  return {
    send_announcement: (a, db) => {
      const role = roleOf();
      if (!['owner', 'admin', 'hr', 'management'].includes(role)) fail('only an owner, admin, HR or a manager may send an announcement');
      const title = String(a.p_title ?? '').trim();
      const body = String(a.p_body ?? '').trim();
      if (title.length < 2) fail('give the announcement a title');
      if (title.length > 120) fail('keep the title under 120 characters');
      if (!body) fail('write the message');
      if (body.length > 2000) fail('keep the message under 2,000 characters');
      const kind = String(a.p_audience);
      const id = (a.p_audience_id as string | null) ?? null;
      if (!['everyone', 'team', 'role', 'territory'].includes(kind)) fail('choose who it goes to');
      if ((kind === 'everyone') !== (id === null)) fail('choose which team, role or territory it goes to');
      if (a.p_pinned_until && String(a.p_pinned_until) < istDay(new Date())) fail('the pin date has passed; choose today or later');
      const employees = db.rows('employees');
      if (role === 'management') {
        const self = employees.find(e => e.code === 'CL-RSM-01');
        if (kind !== 'team' || id !== self?.id) fail('a manager sends announcements to their own team only');
      }
      const name = kind === 'everyone' ? 'Everyone'
        : kind === 'team' ? (() => { const m = employees.find(e => e.id === id && e.status === 'active'); return m ? `${m.name}'s team` : null; })()
          : kind === 'role' ? (db.rows('designations').find(d => d.id === id)?.name as string | undefined) ?? null
            : (db.rows('territories').find(t => t.id === id)?.name as string | undefined) ?? null;
      if (!name) fail('that team, role or territory is not in your company');
      const people = audienceOf(employees, kind, id);
      if (!people.length) fail(`nobody is in ${name} today, so there is nobody to send it to`);
      const aid = crypto.randomUUID();
      db.mutable('announcements').push({ id: aid, org_id: ORG, title, body, audience_kind: kind, audience_id: id, audience_name: name, pinned_until: a.p_pinned_until ?? null, created_by: DEMO_USER, created_by_name: me, created_at: now() });
      for (const e of people) {
        db.mutable('announcement_reads').push({ announcement_id: aid, employee_id: e.id, org_id: ORG, read_at: null, reminded_at: null });
        db.mutable('notifications').push({ id: crypto.randomUUID(), org_id: ORG, employee_id: e.id, title, body: body.slice(0, 240), kind: 'announcement', is_read: false, created_at: now(), entity: 'announcement', entity_id: aid, deep_link: `/announcements/${aid}`, group_count: 1 });
      }
      audit(db, 'sent an announcement', 'Announcement', title, null, `${name}, ${people.length} ${people.length === 1 ? 'person' : 'people'}`);
      return { id: aid, count: people.length };
    },
    remind_announcement: (a, db) => {
      const ann = db.rows('announcements').find(x => x.id === a.p_id) ?? fail('no such announcement in your company');
      const role = roleOf();
      if (!(['owner', 'admin', 'hr'].includes(role) || (role === 'management' && ann.created_by === DEMO_USER))) fail('only whoever sent it, or an owner, admin or HR, may send a reminder');
      const waiting = db.rows('announcement_reads').filter(r => r.announcement_id === ann.id && !r.read_at);
      for (const r of waiting) {
        r.reminded_at = now();
        db.mutable('notifications').push({ id: crypto.randomUUID(), org_id: ORG, employee_id: r.employee_id, title: `Reminder: ${ann.title}`, body: String(ann.body).slice(0, 240), kind: 'announcement', is_read: false, created_at: now(), entity: 'announcement', entity_id: ann.id, deep_link: `/announcements/${ann.id}`, group_count: 1 });
      }
      audit(db, 'reminded about an announcement', 'Announcement', String(ann.title), null, `${waiting.length} ${waiting.length === 1 ? 'person' : 'people'}`);
      return waiting.length;
    },
    mark_announcement_read: (a, db) => {
      for (const r of db.rows('announcement_reads').filter(x => x.announcement_id === a.p_id && x.employee_id === a.p_employee_id)) r.read_at ??= now();
      return null;
    },
  };
}
