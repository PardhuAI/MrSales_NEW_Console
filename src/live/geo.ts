import { db } from './client';

/** The company's geography: regions, territories inside them, areas inside those, clusters inside areas. */
export type Geo = {
  regions: { id: string; name: string }[];
  territories: { id: string; name: string; hq: string; regionId: string }[];
  areas: { id: string; name: string; territoryId: string; lat: number | null; lng: number | null }[];
  clusters: { id: string; name: string; areaId: string }[];
  /** Areas each person is currently posted to (territory_assignments). */
  postings: Map<string, string[]>;
};

export async function loadGeo(): Promise<Geo> {
  const sb = db();
  const [r, t, a, c, ta] = await Promise.all([
    sb.from('regions').select('id, name').order('name'),
    sb.from('territories').select('id, name, hq, region_id').order('name'),
    sb.from('areas').select('id, name, territory_id, lat, lng').order('name'),
    sb.from('clusters').select('id, name, area_id').order('name'),
    sb.from('territory_assignments').select('employee_id, area_ids, period'),
  ]);
  for (const x of [r, t, a, c, ta]) if (x.error) throw new Error(`Could not read your geography: ${x.error.message}`);
  const postings = new Map<string, string[]>();
  // A posting is current when its period is open-ended; the newest row wins.
  for (const p of (ta.data ?? []) as { employee_id: string; area_ids: string[] | null; period: string | null }[]) {
    if (!p.period || /,\s*\)$/.test(p.period) || /,\s*infinity\)/.test(p.period)) postings.set(p.employee_id, p.area_ids ?? []);
  }
  return {
    regions: (r.data ?? []) as Geo['regions'],
    territories: ((t.data ?? []) as { id: string; name: string; hq: string; region_id: string }[]).map(x => ({ id: x.id, name: x.name, hq: x.hq, regionId: x.region_id })),
    areas: ((a.data ?? []) as { id: string; name: string; territory_id: string; lat: number | null; lng: number | null }[]).map(x => ({ id: x.id, name: x.name, territoryId: x.territory_id, lat: x.lat, lng: x.lng })),
    clusters: ((c.data ?? []) as { id: string; name: string; area_id: string }[]).map(x => ({ id: x.id, name: x.name, areaId: x.area_id })),
    postings,
  };
}
