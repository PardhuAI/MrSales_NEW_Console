import type { FakeDb, Row, Rpc } from './engine';

/**
 * import_people (migration 0112), in memory: the same columns, the same
 * checks and the same all-or-nothing commit. Logins are not created here,
 * exactly as in the database; the console sends them afterwards.
 */

const ORG = '0d3a1f00-demo-4000-8000-c1e0c0e00001';
const now = () => new Date().toISOString();
const todayIst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** 2026-04-01, 01/04/2026, 1 Apr 2026 or an Excel day number; null for blank, false for unreadable. */
export function sheetDate(text: string | undefined): string | null | false {
  const t = (text ?? '').trim();
  if (!t) return null;
  let y: number, m: number, d: number;
  let hit: RegExpMatchArray | null;
  if ((hit = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, m, d] = [+hit[1], +hit[2], +hit[3]];
  else if ((hit = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) [d, m, y] = [+hit[1], +hit[2], +hit[3]];
  else if ((hit = t.match(/^(\d{1,2})[ -]([a-z]{3,9})[ ,-]+(\d{4})$/i))) {
    m = MONTHS.indexOf(hit[2].slice(0, 3).toLowerCase()) + 1;
    if (!m) return false;
    [d, y] = [+hit[1], +hit[3]];
  } else if ((hit = t.match(/^(\d{5})(\.0+)?$/))) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Number(hit[1]) * 864e5);
    return dt.toISOString().slice(0, 10);
  } else return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return false;
  return `${y}-${pad(m)}-${pad(d)}`;
}

const mobileOf = (t: string) => t.replace(/[\s().-]/g, '').replace(/^(\+91|0091|91(?=\d{10}$)|0(?=\d{10}$))/, '');
const cell = (r: Record<string, string>, k: string) => (r[k] ?? '').trim();

export function peopleRpcs(
  audit: (db: FakeDb, action: string, entity: string, label: string, before?: unknown, after?: unknown, reason?: unknown) => void,
  roleOf: () => string,
): Record<string, Rpc> {
  return {
    import_people: (a, db) => {
      const role = roleOf();
      if (!['owner', 'admin', 'hr'].includes(role)) throw new Error('only an owner, admin or HR may import people');
      const rows = (a.p_rows as Record<string, string>[]) ?? [];
      const errors: { row: number; field: string; message: string }[] = [];
      const err = (row: number, field: string, message: string) => errors.push({ row, field, message });
      const employees = db.rows('employees');
      const byCode = (c: string) => employees.find(e => String(e.code).toUpperCase() === c);
      const roleByName = (t: string) => {
        const l = t.toLowerCase();
        return db.rows('designations').filter(d => String(d.name).toLowerCase() === l || String(d.short_name).toLowerCase() === l)
          .sort((x, y) => Number(y.is_active) - Number(x.is_active))[0];
      };
      const territoryByName = (t: string) => {
        const l = t.toLowerCase();
        const all = db.rows('territories');
        return all.find(x => String(x.name).toLowerCase() === l) ?? all.find(x => String(x.hq).toLowerCase() === l);
      };
      const today = todayIst();
      const limit = new Date(Date.parse(today) + 90 * 864e5).toISOString().slice(0, 10);

      const seen = new Map<string, number>();
      const app = new Map<string, string>();
      const lineMgr = new Map<string, string>();
      for (const e of employees) {
        const m = e.manager_id ? employees.find(x => x.id === e.manager_id) : null;
        if (m) lineMgr.set(String(e.code).toUpperCase(), String(m.code).toUpperCase());
      }
      const sheetCodes = new Set(rows.map(r => cell(r, 'code').toUpperCase()).filter(Boolean));
      let create = 0;
      let update = 0;

      rows.forEach((r, i) => {
        const line = Number(r.row) || i + 2;
        const code = cell(r, 'code').toUpperCase();
        let e: Row | undefined;
        if (!code) err(line, 'Employee code', 'Every person needs an employee code. It is how they sign in.');
        else if (seen.has(code)) err(line, 'Employee code', `${code} is also on row ${seen.get(code)}. Each code may appear once; delete one of the two rows.`);
        else { seen.set(code, line); e = byCode(code); }

        const name = cell(r, 'name');
        if (!name && !e) err(line, 'Name', 'Write their full name, as on their ID.');
        else if (name && name.length < 2) err(line, 'Name', 'A name needs at least two letters.');

        const roleText = cell(r, 'role');
        let d: Row | undefined;
        if (!roleText) { if (!e) err(line, 'Role', 'Write their role, as it is named under Settings, Roles.'); }
        else {
          d = roleByName(roleText);
          if (!d) err(line, 'Role', `There is no role called "${roleText}". Use one of the names under Settings, Roles, or add it there first.`);
          else if (!d.is_active && (!e || e.designation_id !== d.id)) err(line, 'Role', `${d.name} is retired, so nobody new is given it. Choose a role in use.`);
          else if (e && e.mobile_role === 'ASM' && d.app_view !== 'manager' && employees.some(x => x.manager_id === e!.id && x.status === 'active')) err(line, 'Role', `${e.name} has a team reporting to them, so they keep a manager role. Move their team first.`);
        }
        if (code) app.set(code, String(d?.app_view ?? (e ? (e.mobile_role === 'ASM' ? 'manager' : 'field') : 'office')));

        const terr = cell(r, 'territory');
        if (!terr) { if (!e) err(line, 'Territory', 'Write the territory they are posted to, as named under Settings, Geography.'); }
        else if (!territoryByName(terr)) err(line, 'Territory', `There is no territory or HQ called "${terr}". Add it under Settings, Geography first, or fix the spelling.`);

        const mgr = cell(r, 'reports_to').toUpperCase();
        if (mgr) {
          if (mgr === code) err(line, 'Reports to', 'Nobody reports to themselves. Write their manager\'s code.');
          else if (seen.has(mgr)) {
            if (app.get(mgr) !== 'manager') err(line, 'Reports to', `${mgr}, on row ${seen.get(mgr)}, does not have a manager role, so they cannot approve anybody's day.`);
            if (code) lineMgr.set(code, mgr);
          } else if (sheetCodes.has(mgr) && !byCode(mgr)) {
            err(line, 'Reports to', `${mgr} is further down the sheet. Move their row above row ${line}, so the manager is added first.`);
          } else {
            const m = byCode(mgr);
            if (!m) err(line, 'Reports to', `No employee has the code ${mgr}. Add them above row ${line} or fix the code.`);
            else if (m.status !== 'active') err(line, 'Reports to', `${m.name} (${mgr}) has left, so they cannot approve anybody's day.`);
            else if ((app.get(mgr) ?? (m.mobile_role === 'ASM' ? 'manager' : 'field')) !== 'manager') err(line, 'Reports to', `${m.name} is a ${m.designation}, which does not open the manager app, so they cannot approve anybody's day.`);
            if (code) lineMgr.set(code, mgr);
          }
        } else if (!e && d?.app_view === 'field') {
          err(line, 'Reports to', 'A field role needs a manager to approve their day, leave and claims. Write the manager\'s employee code.');
        }

        const joined = sheetDate(cell(r, 'joined_on'));
        if (joined === false) err(line, 'Joined on', `"${cell(r, 'joined_on')}" is not a date we can read. Write it as 2026-04-01, 01/04/2026 or 1 Apr 2026.`);
        else if (joined === null && !e) err(line, 'Joined on', 'Write the date they joined, as 2026-04-01, 01/04/2026 or 1 Apr 2026.');
        else if (joined && joined > limit) err(line, 'Joined on', `${joined} is more than 90 days away. Check the year, or add them nearer the day.`);

        const mob = cell(r, 'mobile');
        if (mob && !/^\d{10}$/.test(mobileOf(mob))) err(line, 'Mobile', `"${mob}" is not a 10 digit mobile number. It may start with +91.`);

        const email = cell(r, 'email').toLowerCase();
        if (!email) { if (!e) err(line, 'Email', 'Write their email. Their login and password resets are sent there.'); }
        else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) err(line, 'Email', `"${cell(r, 'email')}" is not an email address.`);
        else if (/@.*\.mrsales\.local$/.test(email)) err(line, 'Email', 'Use their real work or personal email, not a mrsales.local address.');

        const basic = cell(r, 'basic');
        if (basic) {
          const v = Number(basic.replace(/[,₹\s]/g, ''));
          if (!['owner', 'hr'].includes(role)) err(line, 'Basic salary', 'Only an owner or HR may set pay. Leave this column empty.');
          else if (!Number.isFinite(v) || v <= 0) err(line, 'Basic salary', `"${basic}" is not an amount. Write the monthly basic in rupees, like 18000.`);
          else if (e) {
            const last = db.rows('employee_salaries').filter(s => s.employee_id === e!.id).sort((x, y) => String(y.effective_from).localeCompare(String(x.effective_from)))[0];
            if (last && Number(last.basic) !== v) err(line, 'Basic salary', `${e.name} already has a salary of ${last.basic}. Change it under Expenses and pay, Salaries, with the date it applies from.`);
          }
        }

        if (code) { if (e) update++; else create++; }
      });

      rows.forEach((r, i) => {
        const code = cell(r, 'code').toUpperCase();
        if (!code || !cell(r, 'reports_to')) return;
        for (let walk = lineMgr.get(code), g = 0; walk && g < 200; walk = lineMgr.get(walk), g++) {
          if (walk === code) {
            err(Number(r.row) || i + 2, 'Reports to', `This makes a loop: ${code} would end up reporting to themselves further up the line. Fix one of the managers in the chain.`);
            break;
          }
        }
      });

      // Seats are checked when logins are sent, not here (as in import_people).

      if (errors.length || !a.p_commit) {
        return { sheet: 'people', total: rows.length, create, update, rejected: errors.length, committed: false, errors, created: [] };
      }

      const created: { id: string; code: string }[] = [];
      for (const r of rows) {
        const code = cell(r, 'code').toUpperCase();
        const e = byCode(code);
        const d = cell(r, 'role') ? roleByName(cell(r, 'role')) : undefined;
        const t = cell(r, 'territory') ? territoryByName(cell(r, 'territory')) : undefined;
        const m = cell(r, 'reports_to') ? byCode(cell(r, 'reports_to').toUpperCase()) : undefined;
        const joined = sheetDate(cell(r, 'joined_on')) || null;
        const mob = cell(r, 'mobile') ? mobileOf(cell(r, 'mobile')) : null;
        const email = cell(r, 'email').toLowerCase() || null;
        const basic = cell(r, 'basic') ? Number(cell(r, 'basic').replace(/[,₹\s]/g, '')) : null;
        if (!e) {
          const id = crypto.randomUUID();
          db.mutable('employees').push({
            id, org_id: ORG, code, name: cell(r, 'name'), mobile_role: d!.app_view === 'manager' ? 'ASM' : 'MR', designation: d!.name, designation_id: d!.id,
            designation_short: d!.short_name, department: cell(r, 'department') || 'Sales and marketing', manager_id: m?.id ?? null, territory_id: t!.id,
            hq: cell(r, 'hq') || t!.hq, joined_at: joined, mobile: mob, email, blood_group: null, status: 'active', last_seen_at: null, lat: null, lng: null,
            created_at: now(), updated_at: now(), last_device_id: null, location_requested_at: null, mock_alerted_at: null, last_mock_at: null, last_place: null,
          });
          if (m) db.mutable('manager_assignments').push({ id: crypto.randomUUID(), org_id: ORG, employee_id: id, manager_id: m.id, period: `[${joined},)`, changed_by: null, created_at: now() });
          if (basic) db.mutable('employee_salaries').push({ id: crypto.randomUUID(), org_id: ORG, employee_id: id, effective_from: joined, basic, component_values: {}, structure_id: null, note: 'From the people import', created_by: null, created_at: now() });
          created.push({ id, code });
        } else {
          Object.assign(e, {
            name: cell(r, 'name') || e.name,
            ...(d ? { designation_id: d.id, designation: d.name, designation_short: d.short_name, mobile_role: d.app_view === 'manager' ? 'ASM' : 'MR' } : {}),
            department: cell(r, 'department') || e.department,
            territory_id: t?.id ?? e.territory_id,
            hq: cell(r, 'hq') || t?.hq || e.hq,
            joined_at: joined ?? e.joined_at,
            mobile: mob ?? e.mobile,
            email: email ?? e.email,
            updated_at: now(),
          });
          if (m && m.id !== e.manager_id) {
            audit(db, 'changed manager', 'Employee', String(e.name), employees.find(x => x.id === e.manager_id)?.name ?? 'nobody', m.name, 'People import');
            e.manager_id = m.id;
          }
          if (basic && !db.rows('employee_salaries').some(s => s.employee_id === e.id)) {
            db.mutable('employee_salaries').push({ id: crypto.randomUUID(), org_id: ORG, employee_id: e.id, effective_from: joined ?? e.joined_at, basic, component_values: {}, structure_id: null, note: 'From the people import', created_by: null, created_at: now() });
          }
        }
      }
      audit(db, `imported ${create} ${create === 1 ? 'person' : 'people'}, updated ${update}`, 'Employee', `${create} added, ${update} updated`);
      return { sheet: 'people', total: rows.length, create, update, rejected: 0, committed: true, errors: [], created };
    },
  };
}
