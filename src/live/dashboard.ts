import { db, isLive, readAll } from './client';
import { loadEmployees, type Employee } from './people';
import type {
  Attention, CallMark, CallState, DashboardModel, DayFigures, DayState, Ranked, RibbonGroup,
} from '../data/dashboard';

/**
 * The Dashboard from the live database, for whoever is signed in. Row-level
 * security decides whose records come back: a manager sees their team, an
 * owner the company. Every day here is an India day (Asia/Kolkata), because
 * that is the day the rep worked, whatever the browser's clock says.
 */

const IST = 'Asia/Kolkata';
const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: false });

/** YYYY-MM-DD in India. */
const dayKey = (d: Date) => keyFmt.format(d);
/** Hours since midnight in India. */
const hoursOf = (d: Date) => {
  const [h, m] = timeFmt.format(d).split(':').map(Number);
  return (h % 24) + m / 60;
};
const parts = (k: string) => k.split('-').map(Number) as [number, number, number];
/** A date for display, at local midnight of that India day. */
const dateOf = (k: string) => {
  const [y, m, d] = parts(k);
  return new Date(y, m - 1, d);
};
const shift = (k: string, n: number) => {
  const [y, m, d] = parts(k);
  return keyFmt.format(new Date(Date.UTC(y, m - 1, d + n, 6)));
};
const weekdayOf = (k: string) => {
  const [y, m, d] = parts(k);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
/** Midnight of an India day, as an instant, for querying. */
const startOf = (k: string) => `${k}T00:00:00+05:30`;
const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
const monthLabel = (y: number, m: number, long = true) =>
  new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: long ? 'long' : 'short' });

const FIELD_DAY_START = 9;
const FIELD_DAY_END = 19;

type ActivityRow = {
  id: string; employee_id: string; client_id: string | null; status: string;
  scheduled_start: string | null; actual_start: string | null; created_at: string;
  geo_verdict: string | null; geo_mocked: boolean | null; is_unplanned: boolean | null;
  clients: { name: string } | null;
};

type Call = {
  id: string; employee: string; client: string; clientId: string | null;
  day: string; at: number; status: 'done' | 'missed' | 'started' | 'planned';
  verdict: string | null; mocked: boolean;
};

const statusOf = (s: string): Call['status'] =>
  s === 'completed' ? 'done' : s === 'missed' ? 'missed' : s === 'inProgress' ? 'started' : 'planned';

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const names = (list: string[], max = 3) =>
  list.length <= max ? list.join(', ').replace(/, ([^,]*)$/, ' and $1') : `${list.slice(0, max).join(', ')} and ${list.length - max} more`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export async function loadLiveDashboard(orgName: string): Promise<DashboardModel> {
  const sb = db();
  const now = new Date();
  const today = dayKey(now);
  const nowH = hoursOf(now);
  const [ty, tm] = parts(today);
  const prevMonthStart = (() => {
    const d = new Date(ty, tm - 2, 1);
    return `${monthKey(d.getFullYear(), d.getMonth() + 1)}-01`;
  })();
  // Six weeks for the day views, and back to the start of last month for the month chart.
  const windowStart = [shift(today, -40), prevMonthStart].sort()[0];
  const monthStart = `${monthKey(ty, tm)}-01`;
  const yearStart = (() => {
    const d = new Date(ty, tm - 1 - 11, 1);
    return `${monthKey(d.getFullYear(), d.getMonth() + 1)}-01`;
  })();

  const head = { count: 'exact' as const, head: true };
  const [
    employees, settings, holidays, activities, fakes, travel, leaves,
    clientsTotal, clientsNoPlace, clientsNoOwner, clientsNew, sales, targets,
  ] = await Promise.all([
    loadEmployees(),
    sb.from('org_settings').select('week_off_weekday, geo_fence_radius_m').maybeSingle(),
    sb.from('holidays').select('holiday_date, name').gte('holiday_date', windowStart),
    readAll<ActivityRow>((a, b) => sb.from('activities')
      .select('id, employee_id, client_id, status, scheduled_start, actual_start, created_at, geo_verdict, geo_mocked, is_unplanned, clients(name)')
      .gte('scheduled_start', startOf(windowStart))
      .lt('scheduled_start', startOf(shift(today, 1)))
      .order('scheduled_start')
      .range(a, b) as never),
    sb.from('fake_location_attempts')
      .select('employee_id, created_at, purpose, fake_distance_m, real_distance_m, real_seen_at, clients(name)')
      .gte('created_at', startOf(shift(today, -7)))
      .order('created_at', { ascending: false }),
    sb.rpc('travel_exceptions', { p_since: shift(today, -14) }),
    sb.from('leave_requests').select('employee_id, from_date, to_date').eq('status', 'approved').gte('to_date', shift(today, -10)),
    sb.from('clients').select('id', head),
    sb.from('clients').select('id', head).is('lat', null),
    sb.from('clients').select('id', head).is('owner_employee_id', null),
    sb.from('clients').select('id', head).gte('created_at', startOf(monthStart)),
    readAll<{ employee_id: string; sale_date: string; amount: number }>((a, b) => sb.from('sales_records')
      .select('employee_id, sale_date, amount').gte('sale_date', yearStart).range(a, b)),
    readAll<{ employee_id: string; period_year: number; period_month: number; amount: number }>((a, b) => sb.from('targets')
      .select('employee_id, period_year, period_month, amount').gte('period_year', ty - 1).range(a, b)),
  ]);
  for (const r of [settings, holidays, fakes, leaves, clientsTotal, clientsNoPlace, clientsNoOwner, clientsNew]) {
    if (r.error) throw new Error(r.error.message);
  }
  // The travel check is advice, not a figure: a failure there should not blank the screen.
  const travelRows = (travel.error ? [] : travel.data ?? []) as {
    employee_id: string; employee_name: string; happened_at: string; km: number; minutes: number; implied_kmh: number; reason: string;
  }[];

  const weekOff = settings.data?.week_off_weekday ?? 0;
  const holidayName = new Map((holidays.data ?? []).map(h => [h.holiday_date as string, h.name as string]));
  const isWorking = (k: string) => weekdayOf(k) !== weekOff && !holidayName.has(k);

  // ── the people who carry a phone ──
  // Field people are the ones whose app is the field app (mobile role MR, from
  // the company's own role names), plus any manager who logs calls of their own.
  // A manager who only approves is not "a person who has not visited anyone".
  const callers = new Set(activities.map(a => a.employee_id));
  const field = [...employees.values()].filter(e => e.status === 'active' && (e.role === 'MR' || callers.has(e.id)));
  const fieldIds = new Set(field.map(e => e.id));
  const person = (id: string) => employees.get(id);

  // ── every call in the window, as an India day and hour ──
  const calls: Call[] = activities.map(a => {
    const when = new Date(a.actual_start ?? a.scheduled_start ?? a.created_at);
    const day = dayKey(new Date(a.scheduled_start ?? a.actual_start ?? a.created_at));
    return {
      id: a.id,
      employee: a.employee_id,
      client: a.clients?.name ?? 'Client',
      clientId: a.client_id,
      day,
      at: hoursOf(when),
      status: statusOf(a.status),
      verdict: a.geo_verdict,
      mocked: Boolean(a.geo_mocked) || a.geo_verdict === 'suspect',
    };
  });
  const byDay = new Map<string, Call[]>();
  for (const c of calls) byDay.set(c.day, [...(byDay.get(c.day) ?? []), c]);

  const figuresFor = (k: string, isToday: boolean): DayFigures => {
    const list = byDay.get(k) ?? [];
    const done = list.filter(c => c.status === 'done');
    return {
      planned: list.length,
      done: done.length,
      missed: list.filter(c => c.status === 'missed').length,
      started: list.filter(c => c.status === 'started').length,
      dueByNow: isToday ? list.filter(c => c.status !== 'planned' || c.at <= nowH).length : list.length,
      active: new Set(done.map(c => c.employee)).size,
      team: field.length,
    };
  };

  // ── which day the timeline shows ──
  const todayCalls = byDay.get(today) ?? [];
  const todayState: DayState = holidayName.has(today)
    ? 'holiday'
    : weekdayOf(today) === weekOff
      ? 'weekOff'
      : nowH < FIELD_DAY_START && !todayCalls.some(c => c.status === 'done' || c.status === 'started')
        ? 'beforeStart'
        : 'working';
  let shownDay = today;
  if (todayState !== 'working') {
    for (let i = 1; i <= 40; i++) {
      const k = shift(today, -i);
      if ((byDay.get(k) ?? []).some(c => c.status !== 'planned')) {
        shownDay = k;
        break;
      }
    }
  }
  const shownIsToday = shownDay === today;
  const shownCalls = byDay.get(shownDay) ?? [];

  const markOf = (c: Call): CallMark => ({
    at: c.at,
    state: (c.mocked ? 'flagged' : c.status) as CallState,
    client: c.client,
    note: c.mocked
      ? 'The phone reported a fake location.'
      : c.status === 'done' && c.verdict === 'outOfRange'
        ? 'Logged outside the visit radius.'
        : c.status === 'started'
          ? 'Started on the phone and not finished.'
          : undefined,
  });

  // Every field person appears, with or without calls: the empty rows are the point.
  const groups = new Map<string, { label: string; people: RibbonGroup['people'] }>();
  for (const e of [...field].sort((a, b) => a.name.localeCompare(b.name))) {
    const label = e.managerId && person(e.managerId) ? `${person(e.managerId)!.name}'s team` : e.territory || 'Reporting to nobody';
    const g = groups.get(label) ?? { label, people: [] };
    g.people.push({
      id: e.id,
      name: e.name,
      hq: e.hq,
      calls: shownCalls.filter(c => c.employee === e.id).sort((a, b) => a.at - b.at).map(markOf),
    });
    groups.set(label, g);
  }
  // People with calls first within a team, then the quiet ones.
  const ribbon = [...groups.values()]
    .map(g => ({ ...g, people: [...g.people].sort((a, b) => Number(b.calls.length > 0) - Number(a.calls.length > 0)) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const hours = shownCalls.map(c => c.at);
  const startHour = Math.min(FIELD_DAY_START, Math.floor(Math.min(...hours, FIELD_DAY_START)));
  const endHour = Math.max(FIELD_DAY_END, Math.ceil(Math.max(...hours, FIELD_DAY_END - 1) + 0.5));

  // ── needs attention ──
  const attention: Attention[] = [];
  const fakeRows = (fakes.data ?? []) as unknown as {
    employee_id: string; created_at: string; purpose: string | null; real_distance_m: number | null; clients: { name: string } | null;
  }[];
  const fakeBy = new Map<string, typeof fakeRows>();
  for (const f of fakeRows) fakeBy.set(f.employee_id, [...(fakeBy.get(f.employee_id) ?? []), f]);
  for (const [id, list] of fakeBy) {
    const last = list[0];
    const who = person(id)?.name ?? 'Someone';
    attention.push({
      id: `fake-${id}`,
      severity: 'critical',
      title: list.length === 1 ? `${who} tried to use a fake location` : `${who} tried to use a fake location ${list.length} times this week`,
      reason: `Latest ${relative(new Date(last.created_at), now)}${last.clients?.name ? ` at ${last.clients.name}` : ''}. It was blocked.`
        + (last.real_distance_m != null ? ` Their last genuine position was ${distance(last.real_distance_m)} from the client.` : ''),
      action: 'Open their day',
      to: '/field',
    });
  }
  const mockedBy = new Map<string, number>();
  for (const c of calls) if (c.mocked && c.day >= shift(today, -14) && !fakeBy.has(c.employee)) mockedBy.set(c.employee, (mockedBy.get(c.employee) ?? 0) + 1);
  for (const [id, n] of mockedBy) {
    attention.push({
      id: `mock-${id}`, severity: 'critical',
      title: `${person(id)?.name ?? 'Someone'}'s phone reported a fake location on ${plural(n, 'visit')}`,
      reason: 'In the last two weeks. Worth a conversation before a conclusion.',
      action: 'Open their day', to: '/field',
    });
  }
  const travelBy = new Map<string, typeof travelRows>();
  for (const t of travelRows) travelBy.set(t.employee_id, [...(travelBy.get(t.employee_id) ?? []), t]);
  for (const [id, list] of travelBy) {
    const worst = list.find(t => t.reason !== 'faster than a road') ?? list[0];
    const hard = worst.reason !== 'faster than a road';
    const what = worst.reason === 'identical position'
      ? 'two visits at exactly the same coordinates, which real GPS never repeats'
      : worst.reason === 'out of order'
        ? 'the phone clock ran backwards between two visits'
        : `${Math.round(worst.km)} km in ${Math.round(worst.minutes)} minutes`;
    attention.push({
      id: `travel-${id}`, severity: hard ? 'critical' : 'warning',
      title: list.length === 1
        ? `A journey of ${worst.employee_name || person(id)?.name}'s does not add up`
        : `${list.length} journeys of ${worst.employee_name || person(id)?.name}'s do not add up`,
      reason: `${dateOf(dayKey(new Date(worst.happened_at))).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}: ${what}. A flight or a bad GPS fix can explain it; the day shows both visits.`,
      action: 'See both visits', to: '/field',
    });
  }

  const unfinished = calls.filter(c => c.status === 'started' && c.day < today);
  if (unfinished.length) {
    const per = new Map<string, number>();
    for (const c of unfinished) per.set(c.employee, (per.get(c.employee) ?? 0) + 1);
    const top = [...per.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${person(id)?.name ?? 'Someone'} ${n}`);
    attention.push({
      id: 'unfinished', severity: 'warning',
      title: `${plural(unfinished.length, 'visit was', 'visits were')} started and never finished`,
      reason: `${names(top)}. They count as neither done nor missed until someone closes them.`,
      action: 'See the visits', to: '/field',
    });
  }

  if (todayState === 'working' && nowH >= 13) {
    const quiet = field.filter(e => {
      const mine = todayCalls.filter(c => c.employee === e.id);
      return mine.length > 0 && !mine.some(c => c.status === 'done' || c.status === 'started');
    });
    if (quiet.length) {
      attention.push({
        id: 'quiet-today', severity: 'warning',
        title: quiet.length === 1 ? `${quiet[0].name} has not logged a call today` : `${quiet.length} people have not logged a call today`,
        reason: quiet.length === 1
          ? `${plural(todayCalls.filter(c => c.employee === quiet[0].id).length, 'call')} planned${quiet[0].hq ? ` in ${quiet[0].hq}` : ''}, none started by ${clock(nowH)}.`
          : `${names(quiet.map(e => e.name))}. Each has calls planned and none started.`,
        action: 'Open the field', to: '/field',
      });
    }
  }

  const onLeave = (id: string, k: string) =>
    (leaves.data ?? []).some(l => l.employee_id === id && (l.from_date as string) <= k && (l.to_date as string) >= k);
  const lastWeek = Array.from({ length: 7 }, (_, i) => shift(today, -1 - i)).filter(isWorking);
  const silent = field.filter(e =>
    lastWeek.length >= 3
    // Someone who joined during the week has not had a week to be quiet in.
    && (!e.joinedAt || e.joinedAt <= lastWeek[lastWeek.length - 1])
    && !lastWeek.every(k => onLeave(e.id, k))
    && !calls.some(c => c.employee === e.id && c.status === 'done' && lastWeek.includes(c.day)));
  if (silent.length) {
    attention.push({
      id: 'silent-week', severity: 'warning',
      title: silent.length === 1 ? `${silent[0].name} has logged no visits for a week` : `${silent.length} people have logged no visits for a week`,
      reason: `${silent.length === 1 ? '' : `${names(silent.map(e => e.name))}. `}No completed call on the last ${plural(lastWeek.length, 'working day')}, and not on leave.`,
      action: 'See the team', to: '/team',
    });
  }

  const weekDone = calls.filter(c => c.status === 'done' && c.day >= shift(today, -7));
  const noPlace = field.filter(e => {
    const mine = weekDone.filter(c => c.employee === e.id);
    return mine.length >= 3 && mine.every(c => !c.verdict || c.verdict === 'unavailable');
  });
  if (noPlace.length) {
    attention.push({
      id: 'no-gps', severity: 'warning',
      title: noPlace.length === 1 ? `${noPlace[0].name}'s visits this week had no location` : `${noPlace.length} people's visits this week had no location`,
      reason: `${noPlace.length === 1 ? '' : `${names(noPlace.map(e => e.name))}. `}None of them could be checked against the visit radius. Their phone's location may be off.`,
      action: 'Open the field', to: '/field',
    });
  }

  const checked = weekDone.filter(c => c.verdict === 'verified' || c.verdict === 'outOfRange');
  const outside = checked.filter(c => c.verdict === 'outOfRange').length;
  if (checked.length >= 10 && outside / checked.length > 0.15) {
    attention.push({
      id: 'out-of-range', severity: 'info',
      title: `${pct(outside, checked.length)}% of last week's visits were outside the visit radius`,
      reason: `${outside} of ${checked.length} checked visits. Often a client's registered location is wrong; the data quality page lists them.`,
      action: 'Check client locations', to: '/clients/quality',
    });
  }
  const masterGaps = (clientsNoPlace.count ?? 0) + (clientsNoOwner.count ?? 0);
  if (masterGaps > 0) {
    attention.push({
      id: 'clients', severity: 'info',
      title: `${plural(masterGaps, 'client needs', 'clients need')} fixing in the client list`,
      reason: [
        clientsNoPlace.count ? `${plural(clientsNoPlace.count, 'has', 'have')} no registered location, so visits there cannot be checked` : '',
        clientsNoOwner.count ? `${plural(clientsNoOwner.count, 'is', 'are')} not assigned to anyone` : '',
      ].filter(Boolean).join('; ').replace(/^./, x => x.toUpperCase()) + '.',
      action: 'Fix in clients', to: '/clients/quality',
    });
  }
  const order = { critical: 0, warning: 1, info: 2 };
  attention.sort((a, b) => order[a.severity] - order[b.severity]);

  // ── the month ──
  const salesIn = (y: number, m: number, who?: Set<string>) => sales
    .filter(s => s.sale_date.startsWith(monthKey(y, m)) && (!who || who.has(s.employee_id)))
    .reduce((t, s) => t + Number(s.amount), 0);
  const targetIn = (y: number, m: number, who?: Set<string>) => targets
    .filter(t => t.period_year === y && t.period_month === m && (!who || who.has(t.employee_id)))
    .reduce((t, s) => t + Number(s.amount), 0);
  const prev = new Date(ty, tm - 2, 1);
  const [py, pm] = [prev.getFullYear(), prev.getMonth() + 1];
  const monthSales = salesIn(ty, tm);
  const monthTarget = targetIn(ty, tm);
  const prevSales = salesIn(py, pm);
  const prevTarget = targetIn(py, pm);

  const monthCalls = calls.filter(c => c.day >= monthStart);
  const monthDone = monthCalls.filter(c => c.status === 'done');
  const withCheck = monthDone.filter(c => c.verdict);
  let workingDaysLeft = 0;
  for (let k = shift(today, 1); k.startsWith(monthKey(ty, tm)); k = shift(k, 1)) if (isWorking(k)) workingDaysLeft++;

  const year = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(ty, tm - 1 - 11 + i, 1);
    const [y, m] = [d.getFullYear(), d.getMonth() + 1];
    return { month: monthLabel(y, m, false), sales: salesIn(y, m), target: targetIn(y, m) };
  });

  // ── the last twenty working days ──
  const trend: DashboardModel['trend'] = [];
  for (let k = today; trend.length < 20 && k >= windowStart; k = shift(k, -1)) {
    if (!isWorking(k)) continue;
    if (k === today && todayState !== 'working') continue;
    const list = byDay.get(k) ?? [];
    trend.unshift({
      date: k,
      label: dateOf(k).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      done: list.filter(c => c.status === 'done').length,
      missed: list.filter(c => c.status === 'missed').length,
    });
  }

  // ── the same chart for this month and last month ──
  const monthTrend = (start: string, end: string) => {
    const out: DashboardModel['trend'] = [];
    for (let k = start; k <= end; k = shift(k, 1)) {
      if (!isWorking(k) || (k === today && todayState !== 'working')) continue;
      const list = byDay.get(k) ?? [];
      out.push({
        date: k,
        label: dateOf(k).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        done: list.filter(c => c.status === 'done').length,
        missed: list.filter(c => c.status === 'missed').length,
      });
    }
    return out;
  };
  const trends: DashboardModel['trends'] = {
    recent: trend,
    thisMonth: { label: monthLabel(ty, tm), days: monthTrend(monthStart, today) },
    lastMonth: { label: monthLabel(...(parts(prevMonthStart).slice(0, 2) as [number, number])), days: monthTrend(prevMonthStart, shift(monthStart, -1)) },
  };

  // ── managers and their teams ──
  const weekStart = shift(today, -((weekdayOf(today) + 6) % 7));
  // In the first week a month has too little in it to rank anyone on, so the
  // ranking and the manager table read the month just closed, and say so.
  const monthHasTargets = monthTarget > 0;
  const early = parts(today)[2] <= 7;
  const [sy, sm] = (monthHasTargets && !early) || !prevTarget ? [ty, tm] : [py, pm];
  const salesMonth = monthLabel(sy, sm);
  const managers = [...new Set([...employees.values()].map(e => e.managerId).filter(Boolean) as string[])]
    .map(id => person(id))
    .filter((m): m is Employee => Boolean(m) && m!.status === 'active')
    .map(m => {
      const team = field.filter(e => e.managerId === m.id);
      const ids = new Set(team.map(e => e.id));
      const week = calls.filter(c => ids.has(c.employee) && c.day >= weekStart && c.day <= today);
      const recent = calls.filter(c => ids.has(c.employee) && c.status === 'done' && c.day >= shift(today, -30));
      const checkedRecent = recent.filter(c => c.verdict);
      return {
        id: m.id,
        name: m.name,
        territory: m.territory || m.hq,
        team: team.length,
        doneWeek: week.filter(c => c.status === 'done').length,
        plannedWeek: week.filter(c => c.day < today || c.status !== 'planned' || c.at <= nowH).length,
        verifiedShare: checkedRecent.length ? checkedRecent.filter(c => c.verdict === 'verified').length / checkedRecent.length : null,
        sales: salesIn(sy, sm, ids),
        target: targetIn(sy, sm, ids),
      };
    })
    .filter(m => m.team > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  // ── ahead and behind ──
  let ranks: DashboardModel['ranks'] = null;
  const reps = field.filter(e => !managers.some(m => m.id === e.id));
  const withTarget = reps
    .map(e => ({ e, t: targetIn(sy, sm, new Set([e.id])), s: salesIn(sy, sm, new Set([e.id])) }))
    .filter(x => x.t > 0)
    .sort((a, b) => b.s / b.t - a.s / a.t);
  const rank = (e: Employee, value: string): Ranked => ({ id: e.id, name: e.name, hq: e.hq, value });
  if (withTarget.length >= 4) {
    ranks = {
      basis: 'target',
      month: salesMonth,
      top: withTarget.slice(0, 3).map(x => rank(x.e, `${pct(x.s, x.t)}%`)),
      low: withTarget.slice(-3).reverse().map(x => rank(x.e, `${pct(x.s, x.t)}%`)),
    };
  } else if (reps.length >= 4) {
    // By calls done in 30 days. Ahead means someone actually worked; behind
    // never repeats a name from ahead.
    const done30 = reps
      .map(e => ({ e, n: calls.filter(c => c.employee === e.id && c.status === 'done' && c.day >= shift(today, -30)).length }))
      .sort((a, b) => b.n - a.n);
    const top = done30.filter(x => x.n > 0).slice(0, 3);
    const low = [...done30].reverse().filter(x => !top.includes(x)).slice(0, 3);
    if (top.length) {
      ranks = {
        basis: 'calls',
        month: salesMonth,
        top: top.map(x => rank(x.e, String(x.n))),
        low: low.map(x => rank(x.e, String(x.n))),
      };
    }
  }

  return {
    demo: !isLive,
    orgName,
    now,
    today: { date: dateOf(today), state: todayState, holidayName: holidayName.get(today), ...figuresFor(today, true) },
    shown: {
      date: dateOf(shownDay),
      isToday: shownIsToday,
      startHour,
      endHour,
      groups: ribbon,
      ...figuresFor(shownDay, shownIsToday),
    },
    attention,
    month: {
      label: monthLabel(ty, tm),
      sales: monthSales,
      target: monthTarget,
      previous: prevSales || prevTarget ? { label: monthLabel(py, pm), sales: prevSales, target: prevTarget } : null,
      callsDone: monthDone.length,
      verifiedShare: withCheck.length ? withCheck.filter(c => c.verdict === 'verified').length / withCheck.length : null,
      clientsVisited: new Set(monthDone.map(c => c.clientId).filter(Boolean)).size,
      clientsTotal: clientsTotal.count ?? 0,
      newClients: clientsNew.count ?? 0,
      workingDaysLeft,
      year,
    },
    trend,
    trends,
    managers,
    salesMonth,
    ranks,
  };
  void fieldIds;
}

function relative(d: Date, now: Date) {
  const mins = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} minutes ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(h / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function distance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function clock(h: number) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
}
