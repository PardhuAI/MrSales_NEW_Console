import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowsOut, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { useResource } from '../../data/resource';
import { loadDayRecord, photoUrls, VERDICT, workTypeLabel, type DayRecord, type Visit } from '../../live/field';
import { IST_TODAY, dayMonth, longDay, timeOf } from '../../lib/days';
import { count, rupees } from '../../lib/format';
import { Drawer, Pill } from '../../components/kit';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useCan } from '../../app/access';

/**
 * One person's day: what they planned, every call in order, where the phone was
 * at each one, and what they reported. The map is drawn from the captured
 * positions alone, on their true relative geography; there is no basemap, so
 * nothing implies a precision the data does not have.
 */

const STATUS: Record<string, { word: string; tone: 'good' | 'warning' | 'critical' | 'neutral' }> = {
  completed: { word: 'Done', tone: 'good' },
  missed: { word: 'Missed', tone: 'warning' },
  inProgress: { word: 'Started, not finished', tone: 'warning' },
  planned: { word: 'Planned', tone: 'neutral' },
  upcoming: { word: 'Planned', tone: 'neutral' },
};

const metres = (m: number | null) => (m == null ? '' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

export function PersonDay() {
  const { employeeId = '', date = IST_TODAY() } = useParams();
  const r = useResource<DayRecord>(`field:person:${employeeId}:${date}`, () => loadDayRecord(employeeId, date));
  if (r.status === 'error' && !r.data) return <LoadError what="This day" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading the day" />;
  if (!r.data.person) {
    return (
      <Empty title="No such person">
        The link may be out of date, or this person is outside the people you can see. <Link className="link" to="/field">Back to activity</Link>
      </Empty>
    );
  }
  return <DayView d={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function DayView({ d, at, error, reload }: { d: DayRecord; at: Date | null; error: string; reload: () => void }) {
  const p = d.person!;
  const nav = useNavigate();
  const allowed = useCan();
  const [open, setOpen] = useState<Visit | null>(null);
  const [big, setBig] = useState(false);
  const done = d.visits.filter(v => v.status === 'completed');
  const missed = d.visits.filter(v => v.status === 'missed');
  const started = d.visits.filter(v => v.status === 'inProgress');
  const outside = d.visits.filter(v => v.verdict === 'outOfRange').length;
  const fake = d.visits.filter(v => v.mocked).length;
  const noLoc = d.visits.filter(v => (v.status === 'completed' || v.status === 'inProgress') && (!v.verdict || v.verdict === 'unavailable')).length;
  const times = [...done, ...started].map(v => v.at).sort();
  const today = IST_TODAY();

  const line = d.visits.length === 0
    ? d.onLeave ? 'On approved leave.' : d.off ? (d.off === 'holiday' ? `${d.holidayName ?? 'A company holiday'}.` : 'The week off.') : d.plan ? 'A day plan was filed, but no calls were logged against it.' : 'No day plan and no calls. The day was never declared.'
    : `${done.length} of ${count(d.visits.length, 'call')} done${times.length ? ` between ${timeOf(times[0])} and ${timeOf(times[times.length - 1])}` : ''}.`
      + (missed.length ? ` ${missed.length} missed.` : '')
      + (started.length ? ` ${count(started.length, 'visit was', 'visits were')} started and not finished.` : '');

  return (
    <div className="pday">
      <Arrive className="pday-head">
        <Link className="link back-link" to={`/field?date=${d.date}`}><ArrowLeft size={13} aria-hidden="true" /> Activity on {dayMonth(d.date)}</Link>
        <div className="pday-title-row">
          <div>
            <h2 className="page-title-lg">{p.name}</h2>
            <p className="pday-who">{[p.code, p.designation, p.hq, p.managerId && `reports to ${p.manager}`].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="pday-nav" role="group" aria-label="Day">
            <button type="button" className="icon-btn" aria-label="The previous day with a record" disabled={!d.prev} onClick={() => d.prev && nav(`/field/${p.id}/${d.prev}`)}><CaretLeft size={16} /></button>
            <span className="pday-date">{longDay(d.date)}{d.date === today ? ', today' : ''}</span>
            <button type="button" className="icon-btn" aria-label="The next day with a record" disabled={!d.next} onClick={() => d.next && nav(`/field/${p.id}/${d.next}`)}><CaretRight size={16} /></button>
          </div>
        </div>
        <p className="pday-line">{line}</p>
        <p className="eyebrow">
          {allowed('people') && <Link className="link" to={`/team/${p.id}`}>Open their record</Link>}
          <Freshness at={at} error={error} reload={reload} label="Read this day again" />
        </p>
      </Arrive>

      {(fake > 0 || d.blocked.length > 0) && (
        <Arrive className="alert critical" index={1}>
          <Pill tone="critical">Fake location</Pill>
          <p>
            {d.blocked.length > 0 && <>The phone detected a fake location app {d.blocked.length === 1 ? 'once' : `${d.blocked.length} times`} and blocked the visit{d.blocked[0].client ? ` at ${d.blocked[0].client}` : ''}, at {timeOf(d.blocked[0].at)}.{d.blocked[0].realDistance != null ? ` The last genuine position was ${metres(d.blocked[0].realDistance)} from the client.` : ''} </>}
            {fake > 0 && <>{count(fake, 'visit was', 'visits were')} logged while the phone reported a simulated position. </>}
            Worth a conversation before a conclusion.
          </p>
        </Arrive>
      )}

      <Arrive className="plan-band" index={1}>
        {d.plan ? (
          <>
            <p><span className="plan-label">Day plan</span> filed at {timeOf(d.plan.at)} · {workTypeLabel(d.plan.workType)}{d.plan.area ? ` · ${d.plan.area}` : ''}{d.plan.cluster ? ` · ${d.plan.cluster}` : ''}{d.plan.address ? ` · declared from ${d.plan.address}` : ''}</p>
            {d.plan.remarks && <p className="plan-remarks">{p.name.split(' ')[0]} wrote: “{d.plan.remarks}”</p>}
          </>
        ) : (
          <p><span className="plan-label">Day plan</span> {d.off || d.onLeave ? 'not needed on this day.' : <>not filed. <span className="warn-text">Nothing can be claimed for a day without one.</span></>}</p>
        )}
      </Arrive>

      {d.visits.length > 0 && (
        <div className="pday-grid">
          <Arrive as="section" className="block" index={2}>
            <div className="block-head">
              <h3 className="section-title">Every call, in order</h3>
              <span className="block-meta">{[outside && `${outside} outside the radius`, noLoc && `${noLoc} without location`].filter(Boolean).join(' · ')}</span>
            </div>
            <ol className="timeline">
              {d.visits.map((v, i) => {
                const st = STATUS[v.status] ?? { word: v.status, tone: 'neutral' as const };
                const ver = v.verdict ? VERDICT[v.verdict] : null;
                return (
                  <li key={v.id}>
                    <button type="button" className={`tl-item${open?.id === v.id ? ' on' : ''}`} onClick={() => setOpen(v)} aria-haspopup="dialog">
                      <span className="tl-n" aria-hidden="true">{i + 1}</span>
                      <span className="tl-time">{timeOf(v.at)}</span>
                      <span className="tl-body">
                        <span className="tl-client">{v.client?.name ?? 'A client no longer on the list'}</span>
                        <span className="tl-sub">{[v.client?.area, v.purpose, v.unplanned && 'unplanned'].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className="tl-marks">
                        {st.tone !== 'good' && <Pill tone={st.tone}>{st.word}</Pill>}
                        {ver && (v.status === 'completed' || v.status === 'inProgress') && <Pill tone={ver.tone}>{v.verdict === 'outOfRange' ? `${metres(v.distance)} away` : ver.word}</Pill>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </Arrive>

          <Arrive as="section" className="block pday-map" index={3}>
            <div className="block-head">
              <h3 className="section-title">Where the phone was</h3>
              <button type="button" className="link" onClick={() => setBig(true)}><ArrowsOut size={13} aria-hidden="true" /> Open full size</button>
            </div>
            <VisitMap visits={d.visits} selected={open} onSelect={setOpen} />
          </Arrive>
        </div>
      )}

      <Drawer open={big} onClose={() => setBig(false)} title={`${p.name}, ${longDay(d.date)}`} sub="Positions captured at each visit" wide>
        <VisitMap visits={d.visits} selected={open} onSelect={v => { setBig(false); setOpen(v); }} tall />
      </Drawer>

      <VisitDrawer visit={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/**
 * The day's positions on their real relative geography, with the route between
 * them in order. A visit outside the radius draws a thin line to where the
 * client is registered, so the distance can be seen, not just read.
 */
function VisitMap({ visits, selected, onSelect, tall = false }: { visits: Visit[]; selected: Visit | null; onSelect: (v: Visit) => void; tall?: boolean }) {
  const pts = visits.map((v, i) => ({ v, i })).filter(x => x.v.lat != null && x.v.lng != null);
  const box = useMemo(() => {
    const all = pts.flatMap(({ v }) => [[v.lat!, v.lng!], ...(v.verdict === 'outOfRange' && v.client?.lat != null ? [[v.client.lat, v.client.lng!]] : [])]);
    if (!all.length) return null;
    const lats = all.map(x => x[0]);
    const lngs = all.map(x => x[1]);
    const pad = 0.004;
    let [a, b, c, e] = [Math.min(...lats) - pad, Math.max(...lats) + pad, Math.min(...lngs) - pad, Math.max(...lngs) + pad];
    // Keep a degree of longitude as wide as it really is at this latitude.
    const k = Math.cos(((a + b) / 2) * Math.PI / 180);
    const w = (e - c) * k;
    const h = b - a;
    if (w > h) { const m = (a + b) / 2; a = m - w / 2; b = m + w / 2; } else { const m = (c + e) / 2; c = m - h / k / 2; e = m + h / k / 2; }
    return { a, b, c, e, k };
  }, [pts]);
  if (!box) {
    return <Empty title="No positions to plot">None of this day's calls captured a location, so the visits cannot be placed.</Empty>;
  }
  const x = (lng: number) => ((lng - box.c) / (box.e - box.c)) * 100;
  const y = (lat: number) => 100 - ((lat - box.a) / (box.b - box.a)) * 100;
  const spanKm = (box.b - box.a) * 111;
  const scale = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50].find(s => s > spanKm / 6) ?? 50;
  const cls = (v: Visit) => (v.mocked ? 'fake' : v.status === 'missed' ? 'missed' : v.verdict === 'outOfRange' ? 'outside' : v.verdict === 'verified' ? 'at' : 'none');
  return (
    <figure className={`vmap${tall ? ' tall' : ''}`}>
      <svg viewBox="-4 -4 108 108" role="img" aria-label={`${count(pts.length, 'position')} captured on this day`}>
        <polyline className="vmap-route" points={pts.map(({ v }) => `${x(v.lng!)},${y(v.lat!)}`).join(' ')} />
        {pts.map(({ v }) => v.verdict === 'outOfRange' && v.client?.lat != null && (
          <g key={`c${v.id}`}>
            <line className="vmap-gap" x1={x(v.lng!)} y1={y(v.lat!)} x2={x(v.client.lng!)} y2={y(v.client.lat)} />
            <circle className="vmap-home" cx={x(v.client.lng!)} cy={y(v.client.lat)} r={1.3} />
          </g>
        ))}
        {pts.map(({ v, i }) => (
          <g key={v.id} className={`vmap-pt ${cls(v)}${selected?.id === v.id ? ' on' : ''}`} onClick={() => onSelect(v)}>
            <circle cx={x(v.lng!)} cy={y(v.lat!)} r={selected?.id === v.id ? 3.6 : 3} />
            <text x={x(v.lng!)} y={y(v.lat!) + 1.1}>{i + 1}</text>
          </g>
        ))}
        <g className="vmap-scale">
          <line x1="2" x2={2 + (scale / spanKm) * 100} y1="102" y2="102" />
          <text x="2" y="100">{scale < 1 ? `${scale * 1000} m` : `${scale} km`}</text>
        </g>
      </svg>
      <figcaption className="vmap-key">
        <span><i className="k at" />At the client</span>
        <span><i className="k outside" />Outside the radius</span>
        <span><i className="k missed" />Missed</span>
        <span><i className="k fake" />Fake location</span>
        <span><i className="k home" />Registered client location</span>
      </figcaption>
      {pts.length < visits.length && <p className="vmap-note">{count(visits.length - pts.length, 'call has', 'calls have')} no position and {visits.length - pts.length === 1 ? 'is' : 'are'} not drawn.</p>}
    </figure>
  );
}

function VisitDrawer({ visit: v, onClose }: { visit: Visit | null; onClose: () => void }) {
  return (
    <Drawer open={Boolean(v)} onClose={onClose} title={v?.client?.name ?? 'Visit'} sub={v ? `${timeOf(v.at)}${v.endedAt ? ` to ${timeOf(v.endedAt)}` : ''} · ${(STATUS[v.status] ?? { word: v.status }).word}` : ''}>
      {v && <VisitDetail v={v} />}
    </Drawer>
  );
}

function VisitDetail({ v }: { v: Visit }) {
  const ver = v.verdict ? VERDICT[v.verdict] : null;
  const done = v.status === 'completed' || v.status === 'inProgress';
  return (
    <>
      <div className="pill-row">
        <Pill tone={(STATUS[v.status] ?? { tone: 'neutral' }).tone}>{(STATUS[v.status] ?? { word: v.status }).word}</Pill>
        {done && ver && <Pill tone={ver.tone}>{ver.word}</Pill>}
        {v.unplanned && <Pill tone="accent">Unplanned</Pill>}
      </div>
      {v.mocked && (
        <p className="drawer-note critical">
          The phone reported a simulated GPS position for this visit{v.claimedVerdict ? `, while claiming it was ${v.claimedVerdict === 'verified' ? 'at the client' : v.claimedVerdict}` : ''}. That is a setting someone chose on the phone, not a weak signal.
        </p>
      )}

      {done && (
        <section className="drawer-section">
          <h3>Location evidence</h3>
          <dl className="facts">
            <dt>Captured</dt><dd>{v.capturedAt ? timeOf(v.capturedAt) : 'No position was captured'}</dd>
            <dt>Distance from the client</dt><dd>{v.distance != null ? `${metres(v.distance)} from the registered location` : v.client?.lat == null ? 'The client has no registered location' : 'Not measured'}</dd>
            <dt>Visit radius</dt><dd>{v.radius ? `${Math.round(v.radius)} m, as set when the visit was logged` : 'Not recorded'}</dd>
            {v.accuracy != null && <><dt>GPS accuracy</dt><dd>within {Math.round(v.accuracy)} m</dd></>}
            {v.outOfRangeReason && <><dt>Reason given</dt><dd>“{v.outOfRangeReason}”</dd></>}
          </dl>
        </section>
      )}

      <section className="drawer-section">
        <h3>Call report</h3>
        <dl className="facts">
          <dt>Purpose</dt><dd>{v.purpose ?? 'Not given'}</dd>
          {v.status === 'missed' ? <><dt>Why missed</dt><dd>{v.remarks ?? 'No reason given'}</dd></> : (
            <>
              <dt>Feedback</dt><dd>{v.feedback ?? 'Not recorded'}</dd>
              <dt>Products discussed</dt><dd>{v.products.length ? v.products.join(', ') : 'None recorded'}</dd>
              <dt>Samples</dt><dd>{v.samples ?? 'None'}</dd>
              <dt>Promotional material</dt><dd>{v.pop ?? 'None handed over'}</dd>
              <dt>Order on the spot</dt><dd>{v.pob ? rupees(v.pob) : 'None'}</dd>
              <dt>Next visit</dt><dd>{v.nextVisit ? dayMonth(v.nextVisit) : 'Not committed'}</dd>
              {v.remarks && <><dt>Remarks</dt><dd>{v.remarks}</dd></>}
            </>
          )}
          <dt>Day plan</dt><dd>{v.hasDayPlan ? 'Filed, so this visit can be claimed' : 'None, so nothing can be claimed for it'}</dd>
          {v.client && <><dt>Client</dt><dd><Link className="link" to={`/clients/${v.client.id}`}>{v.client.name}</Link></dd></>}
        </dl>
      </section>

      {v.rcpa.length > 0 && (
        <section className="drawer-section">
          <h3>Prescription audit</h3>
          <div className="table-wrap">
            <table className="table table-compact">
              <thead><tr><th scope="col">Product</th><th scope="col" className="num">Ours</th><th scope="col">Competitor</th><th scope="col" className="num">Theirs</th></tr></thead>
              <tbody>
                {v.rcpa.map((r, i) => (
                  <tr key={i}><td>{r.product}</td><td className="num">{r.ours}</td><td>{r.competitor ?? 'Not named'}</td><td className="num">{r.theirs}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {v.rcpaScore != null && <p className="drawer-note">The rep's own read on this client: {v.rcpaScore} of 5.</p>}
        </section>
      )}

      {v.photos.length > 0 && (
        <section className="drawer-section">
          <h3>Photos taken at the call</h3>
          <Photos paths={v.photos} />
        </section>
      )}
    </>
  );
}

/** Photos from the private bucket, each through a signed link that lasts an hour. */
function Photos({ paths }: { paths: string[] }) {
  const [urls, setUrls] = useState<(string | null)[] | null>(null);
  const [failed, setFailed] = useState('');
  const key = paths.join('|');
  useEffect(() => {
    let live = true;
    setUrls(null);
    setFailed('');
    photoUrls(paths).then(u => live && setUrls(u)).catch(e => live && setFailed(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (failed) return <p className="form-error">The photos could not be opened: {failed}</p>;
  if (!urls) return <p className="drawer-note">Opening {count(paths.length, 'photo')}…</p>;
  return (
    <div className="thumbs">
      {urls.map((u, i) => (
        <figure key={paths[i]} className="thumb">
          {u ? <a href={u} target="_blank" rel="noreferrer"><img src={u} alt={`Photo ${i + 1} taken at the call`} loading="lazy" /></a> : <span className="thumb-none">You cannot open this photo</span>}
          <figcaption>Photo {i + 1}</figcaption>
        </figure>
      ))}
    </div>
  );
}
