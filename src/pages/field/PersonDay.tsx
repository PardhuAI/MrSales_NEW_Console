import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowsOut } from '@phosphor-icons/react';
import { DayStrip } from '../../components/DayStrip';
import { useResource } from '../../data/resource';
import { loadDayRecord, photoUrls, reviewFakeLocations, VERDICT, workTypeLabel, type DayRecord, type Visit } from '../../live/field';
import { invalidate } from '../../data/resource';
import { dashboardStore } from '../../data/dashboard';
import { useMe } from '../../live/session';
import { IST_TODAY, dayMonth, longDay, timeOf } from '../../lib/days';
import { count, rupees } from '../../lib/format';
import { Confirm, Drawer, Notice, Pill } from '../../components/kit';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useCan } from '../../app/access';
import { useFieldLive } from '../../live/fieldLive';

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

/** How much later a visit kept offline reached the server, in words; empty when it arrived as it happened (0117). */
const late = (v: Visit) => {
  if (!v.capturedAt || !v.receivedAt) return '';
  const min = Math.round((Date.parse(v.receivedAt) - Date.parse(v.capturedAt)) / 60_000);
  if (min < 30) return '';
  if (min < 90) return `${min} minutes`;
  const h = Math.round(min / 60);
  return h < 36 ? `${h} hours` : `${Math.round(h / 24)} days`;
};
const metres = (m: number | null) => (m == null ? '' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

export function PersonDay() {
  useFieldLive();
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
  const [open, setOpenState] = useState<Visit | null>(null);
  // A dot on Today links here with ?visit=<id>: that visit opens at once.
  const [params, setParams] = useSearchParams();
  const asked = params.get('visit');
  useEffect(() => {
    if (!asked) return;
    const v = d.visits.find(x => x.id === asked);
    if (v) setOpenState(v);
  }, [asked, d.visits]);
  const setOpen = (v: Visit | null) => {
    setOpenState(v);
    // Closing forgets the visit in the address, so Back and refresh do not reopen it.
    if (!v && asked) setParams(p => { p.delete('visit'); return p; }, { replace: true });
  };
  const [big, setBig] = useState(false);
  const done = d.visits.filter(v => v.status === 'completed');
  const missed = d.visits.filter(v => v.status === 'missed');
  const started = d.visits.filter(v => v.status === 'inProgress');
  const outside = d.visits.filter(v => v.verdict === 'outOfRange').length;
  const fake = d.visits.filter(v => v.mocked).length;
  // A review draws a line: what happened at or before it is dealt with.
  const me = useMe();
  const after = (t: string) => !d.review || t > d.review.at;
  const openAll = d.blocked.filter(b => after(b.at));
  const openBlocked = openAll.filter(b => !b.device);
  const openDevice = openAll.filter(b => b.device);
  const openFake = d.visits.filter(v => v.mocked && after(v.at)).length;
  const mayReview = ['owner', 'admin', 'hr', 'management'].includes(me.role);
  const [asking, setAsking] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewProblem, setReviewProblem] = useState('');
  const [reviewNotice, setReviewNotice] = useState('');
  const review = async (note: string) => {
    setReviewing(true); setReviewProblem('');
    try {
      const n = await reviewFakeLocations(p.id, note);
      setAsking(false);
      setReviewNotice(`${p.name}'s fake-location ${n === 1 ? 'warning is' : 'warnings are'} marked reviewed. A new attempt will warn again.`);
      invalidate('field:', 'home:');
      void dashboardStore.load();
      reload();
    } catch (e) { setReviewProblem(e instanceof Error ? e.message : String(e)); } finally { setReviewing(false); }
  };
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
        </div>
        <DayStrip value={d.date} max={today} onChange={k => nav(`/field/${p.id}/${k}`)} label={`${p.name}'s day`} />
        <p className="pday-line"><strong>{longDay(d.date)}{d.date === today ? ', today' : ''}.</strong> {line}</p>
        <p className="eyebrow">
          {allowed('people') && <Link className="link" to={`/team/${p.id}`}>Open their record</Link>}
          <Freshness at={at} error={error} reload={reload} label="Read this day again" />
        </p>
      </Arrive>

      {(openFake > 0 || openAll.length > 0) && (
        <Arrive className="alert critical" index={1}>
          <Pill tone="critical">Fake location</Pill>
          <p>
            {openBlocked.length > 0 && <>The phone detected a fake location app {openBlocked.length === 1 ? 'once' : `${openBlocked.length} times`} and blocked the visit{openBlocked[0].client ? ` at ${openBlocked[0].client}` : ''}, at {timeOf(openBlocked[0].at)}.{openBlocked[0].realDistance != null ? ` The last genuine position was ${metres(openBlocked[0].realDistance)} from the client.` : ''} </>}
            {openFake > 0 && <>{count(openFake, 'visit was', 'visits were')} logged while the phone reported a simulated position. </>}
            {openDevice.map(b => <span key={b.at}>{b.device === 'Rooted phone' ? `The app found the phone was rooted at ${timeOf(b.at)} and did not open.` : `${b.device} was found installed at ${timeOf(b.at)}; the app would not open until it was uninstalled.`} </span>)}
            Worth a conversation before a conclusion.
            {mayReview && <> <button type="button" className="link" onClick={() => setAsking(true)}>Mark as reviewed</button></>}
          </p>
        </Arrive>
      )}
      {d.review && (fake > openFake || d.blocked.length > openAll.length) && (
        <Arrive className="alert" index={1}>
          <Pill>Reviewed</Pill>
          <p>
            Fake-location warnings up to {dayMonth(d.review.at.slice(0, 10))}, {timeOf(d.review.at)} were reviewed by {d.review.by}{d.review.note ? `: “${d.review.note}”` : '.'} They stay on this day as a record.
          </p>
        </Arrive>
      )}
      <Confirm open={asking} title={`Mark ${p.name}'s warnings as reviewed?`} confirmLabel="Mark as reviewed" busy={reviewing} error={reviewProblem}
        reason={{ label: 'Note', required: false, placeholder: 'For example: spoke to them; a location app was left on.' }}
        onCancel={() => setAsking(false)} onConfirm={note => void review(note)}>
        <p>Every fake-location warning for {p.name} so far stops showing on Today, Needs attention and their phone's page for their manager. A new attempt will warn again. Nothing is deleted.</p>
      </Confirm>
      {reviewNotice && <Notice onDone={() => setReviewNotice('')}>{reviewNotice}</Notice>}

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
  const allowed = useCan();
  return (
    <Drawer open={Boolean(v)} onClose={onClose} title={v?.client?.name ?? 'Visit'} sub={v ? `${timeOf(v.at)}${v.endedAt ? ` to ${timeOf(v.endedAt)}` : ''} · ${(STATUS[v.status] ?? { word: v.status }).word}` : ''}>
      {v?.client && allowed('clients') && (
        <p className="visit-client-link"><Link className="link" to={`/clients/${v.client.id}`}>Open {v.client.name}'s record</Link> for every visit, order and complaint.</p>
      )}
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
        {v.unplanned && <Pill>Unplanned</Pill>}
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
            {late(v) && <><dt>Sent</dt><dd>{timeOf(v.receivedAt!)}, {late(v)} later. The phone had no connection and kept the visit.</dd></>}
            {v.timeSuspect && <><dt>Phone clock</dt><dd>The time the phone gave was in the future or weeks old, so the time it arrived is shown instead.</dd></>}
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
