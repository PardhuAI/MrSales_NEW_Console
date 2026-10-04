import { db, readAll } from './client';
import type { Person } from '../data/approvals';

export type Employee = Person & {
  code: string;
  role: string;
  designation: string;
  status: string;
  managerId: string | null;
  territoryId: string | null;
  lastSeenAt: string | null;
  /** Where the phone last was, by name, as the phone sends it. */
  lastPlace: string | null;
  joinedAt: string;
};

type Row = {
  id: string; code: string | null; name: string; hq: string | null; mobile_role: string | null;
  designation_short: string | null; designation: string | null; status: string | null;
  territory_id: string | null; last_seen_at: string | null; last_place: string | null; joined_at: string | null;
};

/**
 * Everyone this person may see, with their territory and current manager.
 * The manager comes from the dated reporting line (current_reporting), the
 * same source the phone and the old console use.
 */
export async function loadEmployees(): Promise<Map<string, Employee>> {
  const sb = db();
  const [rows, terr, rep] = await Promise.all([
    readAll<Row>((a, b) => sb.from('employees')
      .select('id, code, name, hq, mobile_role, designation_short, designation, status, territory_id, last_seen_at, last_place, joined_at')
      .order('name').range(a, b)),
    sb.from('territories').select('id, name'),
    sb.from('current_reporting').select('employee_id, manager_id'),
  ]);
  if (terr.error) throw new Error(terr.error.message);
  if (rep.error) throw new Error(rep.error.message);
  const territory = new Map((terr.data ?? []).map(t => [t.id as string, t.name as string]));
  const managerOf = new Map((rep.data ?? []).map(r => [r.employee_id as string, r.manager_id as string | null]));
  const names = new Map(rows.map(r => [r.id, r.name]));
  return new Map(rows.map(r => {
    const managerId = managerOf.get(r.id) ?? null;
    return [r.id, {
      id: r.id,
      name: r.name,
      code: r.code ?? '',
      hq: r.hq ?? '',
      role: r.mobile_role ?? '',
      designation: r.designation_short || r.designation || r.mobile_role || '',
      status: r.status ?? 'active',
      territoryId: r.territory_id,
      territory: (r.territory_id && territory.get(r.territory_id)) || '',
      managerId,
      manager: (managerId && names.get(managerId)) || 'nobody',
      lastSeenAt: r.last_seen_at,
      lastPlace: r.last_place?.trim() || null,
      joinedAt: r.joined_at ?? '',
    }];
  }));
}

export async function loadPeople(): Promise<Map<string, Person>> {
  return loadEmployees() as Promise<Map<string, Person>>;
}
