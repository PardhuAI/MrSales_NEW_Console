import { db } from './client';

/** The company's week off and holidays, so a day strip can say which days nobody works. */
export type OffDays = { weekOff: number; holidays: Map<string, string> };

export async function loadOffDays(): Promise<OffDays> {
  const sb = db();
  const [s, h] = await Promise.all([
    sb.from('org_settings').select('week_off_weekday').maybeSingle(),
    sb.from('holidays').select('holiday_date, name'),
  ]);
  if (h.error) throw new Error(`Could not read the holidays: ${h.error.message}`);
  return { weekOff: Number(s.data?.week_off_weekday ?? 0), holidays: new Map((h.data ?? []).map(r => [r.holiday_date as string, r.name as string])) };
}
