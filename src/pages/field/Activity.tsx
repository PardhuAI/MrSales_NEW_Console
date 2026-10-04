import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CaretLeft, CaretRight, Faders } from '@phosphor-icons/react';
import { useResource } from '../../data/resource';
import { loadFieldDay, workTypeLabel, type FieldDayModel, type PersonDay } from '../../live/field';
import { IST_TODAY, ago, longDay, shiftDay, timeOf } from '../../lib/days';
import { count } from '../../lib/format';
import { DateInput, Filter, Pill, SearchBox, Summary, Toolbar, useShowMore } from '../../components/kit';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';

/**
 * Activity: everyone in the field for one day. Called activity, never live
 * tracking: the phone captures a position at each visit, not a stream.
 * People whose location needs a look come first, then those with nothing done.
 */

type Gps = 'all' | 'problems' | 'clean';

const clock = (h: number | null) => {
  if (h == null) return '';
  const hh = Math.floor(h);
  return `${((hh + 11) % 12) + 1}:${String(Math.round((h - hh) * 60)).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
};

/** The location word for a person's day: the worst thing that happened, in words. */
function locationOf(p: PersonDay): { word: string; tone: 'good' | 'warning' | 'critical' | 'neutral'; rank: number } | null {
  const done = p.done + p.open;
  if (p.fake || p.blocked) return { word: p.fake ? 'Fake location' : 'Fake location blocked', tone: 'critical', rank: 4 };
  if (!done) return null;
  // One visit outside the radius is ordinary (a doctor met at the hospital);
  // two or more, or a quarter of the day, is a pattern worth a look.
  if (p.outside >= 2 || (p.outside && p.outside / done >= 0.25)) return { word: `${p.outside} outside the radius`, tone: 'warning', rank: 3 };
  if (p.noLocation === done) return { word: 'No location', tone: 'warning', rank: 2 };
  if (p.outside) return { word: '1 outside the radius', tone: 'warning', rank: 1.5 };
  if (p.noLocation) return { word: `${p.noLocation} without location`, tone: 'neutral', rank: 1 };
  return { word: 'All at the client', tone: 'good', rank: 0 };
}

export function FieldActivity() {
  const [params, setParams] = useSearchParams();
  const today = IST_TODAY();
  const date = params.get('date') ?? today;
  const setDate = (d: string) => setParams(p => { p.set('date', d); return p; }, { replace: true });
  const r = useResource<FieldDayModel>(`field:day:${date}`, () => loadFieldDay(date));

  return (
    <div className="page-body">
      <Toolbar>
        <div className="day-step" role="group" aria-label="Day">
          <button type="button" className="icon-btn" aria-label="The day before" onClick={() => setDate(shiftDay(date, -1))}><CaretLeft size={16} /></button>
          <DateInput label="Day" value={date} max={today} onChange={setDate} />
          <button type="button" className="icon-btn" aria-label="The day after" disabled={date >= today} onClick={() => setDate(shiftDay(date, 1))}><CaretRight size={16} /></button>
        </div>
        {date !== today && <button type="button" className="link" onClick={() => setDate(today)}>Back to today</button>}
        <span className="toolbar-end"><Freshness at={r.at} error={r.error} reload={() => void r.reload()} label="Read this day again" /></span>
      </Toolbar>
      {r.status === 'error' && !r.data ? <LoadError what="This day" error={r.error} retry={() => void r.reload()} />
        : !r.data ? <Loading label="Reading the day" lines={1} />
        : <DayTable m={r.data} goTo={setDate} />}
    </div>
  );
}

function DayTable({ m, goTo }: { m: FieldDayModel; goTo: (d: string) => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [manager, setManager] = useState('all');
  const [gps, setGps] = useState<Gps>('all');
  const [more, setMore] = useState(false);
  const [region, setRegion] = useState('all');
  const [territory, setTerritory] = useState('all');
  const [area, setArea] = useState('all');
  const [hq, setHq] = useState('all');

  const hqs = useMemo(() => [...new Set(m.people.map(p => p.hq).filter(Boolean))].sort(), [m]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return m.people
      .filter(p => !needle || `${p.name} ${p.code} ${p.hq}`.toLowerCase().includes(needle))
      .filter(p => manager === 'all' || p.managerId === manager)
      .filter(p => region === 'all' || p.regionId === region)
      .filter(p => territory === 'all' || p.territoryId === territory)
      .filter(p => area === 'all' || p.areaIds.includes(area))
      .filter(p => hq === 'all' || p.hq === hq)
      .filter(p => {
        const l = locationOf(p);
        return gps === 'all' || (gps === 'problems' ? (l?.rank ?? 0) >= 2 : l?.rank === 0);
      })
      .sort((a, b) => (locationOf(b)?.rank ?? 0) - (locationOf(a)?.rank ?? 0)
        || Number(a.done > 0) - Number(b.done > 0)
        || a.name.localeCompare(b.name));
  }, [m, q, manager, region, territory, area, hq, gps]);
  const { shown, more: showMore } = useShowMore(rows, 60);

  const planned = m.people.reduce((s, p) => s + p.planned, 0);
  const done = m.people.reduce((s, p) => s + p.done, 0);
  const missed = m.people.reduce((s, p) => s + p.missed, 0);
  const active = m.people.filter(p => p.done > 0).length;
  const needLook = m.people.filter(p => (locationOf(p)?.rank ?? 0) >= 2).length;
  const isToday = m.date === m.today;
  const extra = [region, territory, area, hq].filter(x => x !== 'all').length;
  const clear = () => { setQ(''); setManager('all'); setGps('all'); setRegion('all'); setTerritory('all'); setArea('all'); setHq('all'); };

  return (
    <Arrive>
      <Summary>
        {m.off && !planned ? (
          <><strong>{longDay(m.date)}</strong>{m.off === 'holiday' ? ` was ${m.holidayName ?? 'a company holiday'}` : ' was the week off'}. Nobody was expected in the field. <button type="button" className="link" onClick={() => goTo(m.prevWorking)}>See {longDay(m.prevWorking)}</button></>
        ) : !planned ? (
          <><strong>{longDay(m.date)}</strong>: no calls planned or logged{isToday ? ' yet' : ''} by {count(m.people.length, 'field person', 'field people')}.</>
        ) : (
          <>
            <strong>{longDay(m.date)}</strong>: {done} of {count(planned, 'call')} done by {active} of {count(m.people.length, 'person', 'people')}
            {missed ? `, ${missed} missed` : ''}.
            {needLook ? <> <span className="warn-text">{count(needLook, 'person', 'people')}</span> {needLook === 1 ? 'has' : 'have'} visits whose location needs a look.</> : ' Every checked visit was at the client.'}
          </>
        )}
      </Summary>

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Name, employee code or HQ" label="Find a person" />
        <Filter label="Manager" value={manager} onChange={setManager} options={[{ value: 'all', label: 'Everyone' }, ...m.managers.map(x => ({ value: x.id, label: x.name }))]} />
        <Filter<Gps> label="Location" value={gps} onChange={setGps} options={[
          { value: 'all', label: 'Any' }, { value: 'problems', label: 'Needs a look' }, { value: 'clean', label: 'All at the client' },
        ]} />
        <button type="button" className={`btn btn-secondary btn-small${more || extra ? ' on' : ''}`} aria-expanded={more} onClick={() => setMore(v => !v)}>
          <Faders size={14} aria-hidden="true" /> More filters{extra ? ` (${extra})` : ''}
        </button>
      </Toolbar>
      {more && (
        <Toolbar>
          <Filter label="Region" value={region} onChange={v => { setRegion(v); setTerritory('all'); setArea('all'); }} options={[{ value: 'all', label: 'All' }, ...m.geo.regions.map(x => ({ value: x.id, label: x.name }))]} />
          <Filter label="Territory" value={territory} onChange={v => { setTerritory(v); setArea('all'); }} options={[{ value: 'all', label: 'All' }, ...m.geo.territories.filter(t => region === 'all' || t.regionId === region).map(x => ({ value: x.id, label: x.name }))]} />
          <Filter label="Area" value={area} onChange={setArea} options={[{ value: 'all', label: 'All' }, ...m.geo.areas.filter(a => territory === 'all' || a.territoryId === territory).map(x => ({ value: x.id, label: x.name }))]} />
          <Filter label="HQ" value={hq} onChange={setHq} options={[{ value: 'all', label: 'All' }, ...hqs.map(h => ({ value: h, label: h }))]} />
        </Toolbar>
      )}

      {m.people.length === 0 ? (
        <Empty title="Nobody is in the field yet">People whose role opens the field app appear here once they are added. <Link className="link" to="/team/new">Add a person</Link></Empty>
      ) : rows.length === 0 ? (
        <div className="list-empty">
          <Empty title="Nobody matches these filters">Try another name, or <button type="button" className="link" onClick={clear}>clear the filters</button>.</Empty>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Day plan</th>
                <th scope="col" className="num">Planned</th>
                <th scope="col" className="num">Done</th>
                <th scope="col" className="num">Missed</th>
                <th scope="col">Location</th>
                <th scope="col" className="hide-narrow">First and last call</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(p => {
                const loc = locationOf(p);
                const to = `/field/${p.id}/${m.date}`;
                return (
                  <tr key={p.id} className="clickable" onClick={() => nav(to)}>
                    <th scope="row">
                      <Link className="cell-link" to={to} onClick={e => e.stopPropagation()}>{p.name}</Link>
                      <span className="cell-sub">{[p.code, p.hq, p.manager && `reports to ${p.manager}`].filter(Boolean).join(' · ')}</span>
                      {isToday && p.lastPlace && p.lastSeenAt && <span className="cell-sub">last seen near {p.lastPlace}, {ago(p.lastSeenAt)}</span>}
                    </th>
                    <td>
                      {p.plan ? <span>{timeOf(p.plan.at)}<span className="cell-sub">{[p.plan.workType === 'fieldWork' ? '' : workTypeLabel(p.plan.workType), p.plan.area].filter(Boolean).join(' · ')}</span></span>
                        : m.off ? <span className="cell-quiet">Day off</span> : <Pill tone="warning">Not filed</Pill>}
                    </td>
                    <td className="num">{p.planned}</td>
                    <td className="num">{p.done}{p.open ? <span className="cell-sub-inline"> +{p.open} open</span> : ''}</td>
                    <td className="num">{p.missed ? <span className="warn-text">{p.missed}</span> : <span className="cell-quiet">0</span>}</td>
                    <td>{loc ? <Pill tone={loc.tone}>{loc.word}</Pill> : <span className="cell-quiet">Nothing done</span>}</td>
                    <td className="hide-narrow">{p.first != null ? `${clock(p.first)} to ${clock(p.last)}` : <span className="cell-quiet">None</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {showMore}
    </Arrive>
  );
}
