import { ArrowRight, ArrowClockwise } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { useDashboard, dashboardStore, type DashboardModel, type Attention } from '../data/dashboard';
import { useApprovals } from '../data/approvals';
import { queues } from '../data/queues';
import { useCan } from '../app/access';
import { count, days, percent, rupees, rupeesShort } from '../lib/format';
import { Arrive, CountUp, EASE } from '../components/motion';
import { DayRibbon } from './DayRibbon';

/**
 * Today: how the field is doing, what needs a decision or a word, and whether
 * the month is on track. Management tracks, controls, guides and maintains
 * the field force from here, so every line is a fact from the records, every
 * alert names a person and leads somewhere, and a day off says so plainly.
 */

const severityWord: Record<Attention['severity'], string> = {
  critical: 'Urgent',
  warning: 'Today',
  info: 'When you can',
};

const weekdayDate = (d: Date) => d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
const weekday = (d: Date) => d.toLocaleDateString('en-IN', { weekday: 'long' });
const ago = (d: Date | null) => {
  if (!d) return '';
  const m = Math.round((Date.now() - d.getTime()) / 60_000);
  return m < 1 ? 'just now' : m === 1 ? 'a minute ago' : m < 60 ? `${m} minutes ago` : `${Math.round(m / 60)} hours ago`;
};
const hoursNow = (d: Date) => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(d).split(':').map(Number);
  return (h % 24) + m / 60;
};

export function Dashboard() {
  const { status, model, error, at } = useDashboard();

  if (status === 'error' && !model) {
    return (
      <div className="dash-state" role="alert">
        <p className="dash-state-title">The dashboard could not be read</p>
        <p className="dash-state-text">{error} Check the connection and try again.</p>
        <button type="button" className="btn btn-secondary" onClick={() => void dashboardStore.load()}>Try again</button>
      </div>
    );
  }
  if (!model) {
    return (
      <div className="dash-loading" aria-busy="true" aria-label="Reading today's field">
        <span className="skeleton sk-line" />
        <span className="skeleton sk-hero" />
        <span className="skeleton sk-block" />
      </div>
    );
  }
  return <DashboardView m={model} updatedAt={at} refreshError={error} />;
}

function DashboardView({ m, updatedAt, refreshError }: { m: DashboardModel; updatedAt: Date | null; refreshError: string }) {
  const allowed = useCan();
  const store = useApprovals();
  const approvals = allowed('approvals') ? queues(store.pending()) : [];
  const waiting = approvals.reduce((s, q) => s + q.count, 0);
  const seesField = allowed('field');
  const seesSales = allowed('sales');

  return (
    <div className="dash">
      <Arrive className="page-head">
        <p className="eyebrow">
          <span>{weekdayDate(m.now)}</span>
          {m.demo ? (
            <span className="demo-tag">Demo data</span>
          ) : (
            <span className="live-tag">
              Updated {ago(updatedAt)}
              <button type="button" className="live-refresh" onClick={() => void dashboardStore.load()} aria-label="Refresh the dashboard">
                <ArrowClockwise size={13} aria-hidden="true" />
              </button>
            </span>
          )}
          {refreshError && <span className="live-error" role="status">The last refresh failed; showing what was read before.</span>}
        </p>
      </Arrive>

      {seesField && <Hero m={m} />}

      {seesField && m.shown.team > 0 && (
        <Arrive index={2}>
          <DayRibbon
            title={m.shown.isToday ? 'The field today' : `The field on ${weekday(m.shown.date)}, ${m.shown.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}`}
            groups={m.shown.groups}
            startHour={m.shown.startHour}
            endHour={m.shown.endHour}
            nowHour={m.shown.isToday ? hoursNow(m.now) : undefined}
          />
        </Arrive>
      )}

      <div className="pair">
        <Arrive as="section" className="block needs" index={3}>
          <div className="block-head">
            <h2 className="section-title">Needs you</h2>
            {m.attention.length > 0 && allowed('attention') && (
              <Link className="link" to="/attention">All of it <ArrowRight size={13} aria-hidden="true" /></Link>
            )}
          </div>
          {m.attention.length === 0 ? (
            <p className="block-empty">
              Nothing needs you. Fake locations, quiet days, unfinished visits and journeys that do not add up appear
              here as soon as they happen.
            </p>
          ) : (
            <ol className="attention">
              {m.attention.slice(0, 6).map(a => (
                <li key={a.id} className={`att ${a.severity}`}>
                  <span className={`pill ${a.severity}`}>{severityWord[a.severity]}</span>
                  <div className="att-text">
                    <p className="att-title">{a.title}</p>
                    <p className="att-reason">{a.reason}</p>
                  </div>
                  <Link className="link att-action" to={a.to}>{a.action}</Link>
                </li>
              ))}
            </ol>
          )}
        </Arrive>

        {allowed('approvals') && (
          <Arrive as="section" className="block approvals" index={4}>
            <div className="block-head">
              <h2 className="section-title">Waiting for your decision</h2>
              <span className="block-meta">{waiting ? count(waiting, 'request') : ''}</span>
            </div>
            {store.status() !== 'ready' ? (
              <p className="block-empty">{store.status() === 'error' ? 'The queue could not be read.' : 'Reading the queue…'}</p>
            ) : approvals.length === 0 ? (
              <p className="block-empty">Nothing is waiting. Claims, orders, tour plans and leave appear here as soon as they are sent.</p>
            ) : (
              <ul className="queues">
                {approvals.map(q => (
                  <li key={q.kind}>
                    <Link className="queue" to={`/approvals?kind=${q.kind}`}>
                      <span className="queue-count">{q.count}</span>
                      <span className="queue-text">
                        <span className="queue-kind">{q.label}</span>
                        <span className="queue-meta">
                          {q.kind === 'expense' ? `${count(q.days, 'day')} · ` : ''}{q.value ? `${rupees(q.value)} · ` : ''}
                          {q.oldestDays === 0 ? 'sent today' : `oldest ${days(q.oldestDays)}`}
                          {q.oldestDays > 5 && <span className="overdue"> · over 5 days</span>}
                        </span>
                      </span>
                      <ArrowRight className="queue-go" size={15} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Arrive>
        )}
      </div>

      {(seesSales || seesField) && <Month m={m} sales={seesSales} field={seesField} />}

      {seesField && m.trend.some(t => t.done || t.missed) && <Trend m={m} />}

      {seesField && (m.managers.length > 0 || m.ranks) && (
        <div className="pair pair-wide">
          {m.managers.length > 0 && (
            <Arrive as="section" className="block" index={7}>
              <div className="block-head">
                <h2 className="section-title">By manager</h2>
                <Link className="link" to="/team/managers">Every team <ArrowRight size={13} aria-hidden="true" /></Link>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Manager</th>
                      <th scope="col" className="num">Calls this week</th>
                      <th scope="col" className="num">Location checked</th>
                      {seesSales && <th scope="col" className="num">Sold</th>}
                      {seesSales && <th scope="col" className="num">Of target</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {m.managers.map(r => (
                      <tr key={r.id}>
                        <th scope="row">
                          <span className="cell-main">{r.name}</span>
                          <span className="cell-sub">{r.territory ? `${r.territory} · ` : ''}{count(r.team, 'person', 'people')}</span>
                        </th>
                        <td className="num">{r.doneWeek}<span className="cell-sub-inline"> of {r.plannedWeek}</span></td>
                        <td className="num">{r.verifiedShare === null ? '—' : `${Math.round(r.verifiedShare * 100)}%`}</td>
                        {seesSales && <td className="num">{r.sales ? rupeesShort(r.sales) : '—'}</td>}
                        {seesSales && (
                          <td className="num">
                            {r.target ? (
                              <>
                                <span className="inline-meter" aria-hidden="true">
                                  <span style={{ transform: `scaleX(${Math.min(r.sales / r.target, 1)})` }} />
                                </span>
                                {percent(r.sales, r.target)}
                              </>
                            ) : (
                              <span className="cell-sub-inline">No target</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Arrive>
          )}

          {m.ranks && (
            <Arrive as="section" className="block" index={8}>
              <div className="block-head">
                <h2 className="section-title">Ahead and behind</h2>
                <span className="block-meta">{m.ranks.basis === 'target' ? 'Share of monthly target' : 'Calls done, last 30 days'}</span>
              </div>
              <div className="ranks">
                <RankList title="Furthest ahead" people={m.ranks.top} />
                <RankList title="Furthest behind" people={m.ranks.low} />
              </div>
            </Arrive>
          )}
        </div>
      )}

      {m.demo && <p className="foot-note">Demo data for design review. Names and figures are samples.</p>}
    </div>
  );
}

/** One sentence that answers "how is the field doing", for whatever kind of day today is. */
function Hero({ m }: { m: DashboardModel }) {
  const t = m.today;
  const s = m.shown;
  const last = s.isToday ? '' : `${weekday(s.date)}, ${s.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}`;
  const lastLine = !s.isToday && s.planned
    ? `${last}: ${s.done} of ${count(s.planned, 'call')} done by ${s.active} of ${count(s.team, 'person', 'people')}${s.missed ? `, ${s.missed} missed` : ''}.`
    : !s.isToday ? 'No calls have been recorded in the last six weeks.' : '';

  if (t.team === 0) {
    return (
      <Arrive className="hero" index={1}>
        <p className="hero-line">Your field team is not on Mr Sales yet</p>
        <p className="hero-sub">
          Add the people who visit clients, give them phone logins, and their day appears here as they work.
          {' '}<Link className="link" to="/team/new">Add a person</Link>
        </p>
      </Arrive>
    );
  }

  let big: React.ReactNode;
  let sub: string;
  if (t.state === 'weekOff') {
    big = <>{weekday(t.date)}, the week off</>;
    sub = lastLine;
  } else if (t.state === 'holiday') {
    big = <>{t.holidayName ?? 'A company holiday'}</>;
    sub = `A company holiday. ${lastLine}`;
  } else if (t.state === 'beforeStart') {
    big = t.planned ? <>Today: {count(t.planned, 'call')} planned</> : <>The field day starts at 9 am</>;
    sub = lastLine;
  } else if (t.planned === 0) {
    big = <>No calls planned today</>;
    sub = `${count(t.team, 'field person', 'field people')}. Calls appear here as people plan and log their day.`;
  } else {
    big = (
      <>
        <span className="hero-figure"><CountUp value={t.done} format={n => String(Math.round(n))} /></span>
        {' '}of {count(t.planned, 'call')} done
      </>
    );
    const left = t.planned - t.done - t.missed;
    const behind = t.dueByNow - t.done - t.missed;
    sub = `${t.active} of ${count(t.team, 'person', 'people')} in the field. `
      + (left > 0 ? `${count(left, 'visit')} still to make. ` : 'Every planned visit is accounted for. ')
      + (t.missed ? `${t.missed} missed. ` : '')
      + (behind > 2 ? `${behind} behind the plan for this hour.` : 'The team is on pace.');
  }

  return (
    <Arrive className="hero" index={1}>
      <p className="hero-line">{big}</p>
      {sub && <p className="hero-sub">{sub}</p>}
    </Arrive>
  );
}

function Month({ m, sales, field }: { m: DashboardModel; sales: boolean; field: boolean }) {
  const mo = m.month;
  const hasThisMonth = mo.sales > 0 || mo.target > 0;
  const anySales = mo.year.some(y => y.sales || y.target);
  const share = mo.target ? mo.sales / mo.target : 0;
  return (
    <Arrive as="section" className="block month" index={5}>
      <div className="block-head">
        <h2 className="section-title">{mo.label} so far</h2>
        <span className="block-meta">{count(mo.workingDaysLeft, 'working day')} left</span>
      </div>
      <div className="month-figures">
        {sales && (
          <div className="mf mf-lead">
            {hasThisMonth ? (
              <>
                <span className="mf-value"><CountUp value={mo.sales} format={rupeesShort} /></span>
                <span className="mf-label">{mo.target ? `sold, of ${rupeesShort(mo.target)} target · ${percent(mo.sales, mo.target)}` : 'sold · no target set for this month'}</span>
                {mo.target > 0 && (
                  <span className="meter" role="img" aria-label={`${percent(mo.sales, mo.target)} of target`}>
                    <motion.span className="meter-fill" initial={{ scaleX: 0 }} animate={{ scaleX: Math.min(share, 1) }} transition={{ duration: 0.6, ease: EASE, delay: 0.3 }} />
                  </span>
                )}
              </>
            ) : mo.previous ? (
              <>
                <span className="mf-value">{rupeesShort(mo.previous.sales)}</span>
                <span className="mf-label">
                  {mo.previous.label} closed{mo.previous.target ? ` at ${percent(mo.previous.sales, mo.previous.target)} of ${rupeesShort(mo.previous.target)}` : ''}.
                  {' '}Nothing booked for {mo.label} yet.
                </span>
              </>
            ) : (
              <>
                <span className="mf-value mf-quiet">No sales yet</span>
                <span className="mf-label">
                  Neither sales nor targets have been recorded. <Link className="link" to="/sales/targets">Assign targets</Link>
                </span>
              </>
            )}
          </div>
        )}
        {field && (
          <>
            <div className="mf">
              <span className="mf-value">{mo.callsDone.toLocaleString('en-IN')}</span>
              <span className="mf-label">calls done</span>
            </div>
            <div className="mf">
              <span className="mf-value">{mo.verifiedShare === null ? '—' : `${Math.round(mo.verifiedShare * 100)}%`}</span>
              <span className="mf-label">checked at the client</span>
            </div>
            <div className="mf">
              <span className="mf-value">{mo.clientsVisited.toLocaleString('en-IN')}</span>
              <span className="mf-label">of {mo.clientsTotal.toLocaleString('en-IN')} clients visited{mo.newClients ? ` · ${mo.newClients} new` : ''}</span>
            </div>
          </>
        )}
      </div>
      {sales && anySales && <YearChart year={mo.year} />}
    </Arrive>
  );
}

function YearChart({ year }: { year: DashboardModel['month']['year'] }) {
  const reduce = useReducedMotion();
  const max = Math.max(...year.map(y => Math.max(y.sales, y.target)), 1) * 1.08;
  const H = 150;
  const targets = year.filter(y => y.target > 0);
  return (
    <figure className="year" aria-labelledby="year-title">
      <figcaption id="year-title" className="chart-title">
        Sales each month{targets.length ? ', with the target marked. Months that met it are darker.' : '.'}
      </figcaption>
      <div className="year-plot">
        <svg viewBox={`0 0 ${year.length * 40} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {year.map((y, i) => {
            const h = (y.sales / max) * H;
            const current = i === year.length - 1;
            return (
              <g key={`${y.month}-${i}`}>
                <motion.rect
                  className={current ? 'bar current' : y.target && y.sales >= y.target ? 'bar met' : 'bar'}
                  x={i * 40 + 9} width={22} rx={3} y={H - h} height={h}
                  style={{ transformOrigin: `0 ${H}px`, transformBox: 'view-box' }}
                  initial={reduce ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.5, ease: EASE, delay: reduce ? 0 : 0.2 + i * 0.03 }}
                />
                {y.target > 0 && (
                  <line className="target-tick" x1={i * 40 + 5} x2={i * 40 + 35} y1={H - (y.target / max) * H} y2={H - (y.target / max) * H} vectorEffect="non-scaling-stroke" />
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <ol className="year-months" aria-hidden="true">
        {year.map((y, i) => <li key={i}>{y.month}</li>)}
      </ol>
      <table className="visually-hidden">
        <caption>Sales by month</caption>
        <tbody>
          {year.map((y, i) => (
            <tr key={i}><th scope="row">{y.month}</th><td>{rupees(y.sales)}</td><td>{y.target ? `${percent(y.sales, y.target)} of target` : 'no target'}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Calls done on each recent working day, with the missed ones on top. */
function Trend({ m }: { m: DashboardModel }) {
  const reduce = useReducedMotion();
  const max = Math.max(...m.trend.map(t => t.done + t.missed), 1);
  const H = 90;
  const total = m.trend.reduce((s, t) => s + t.done, 0);
  const avg = Math.round(total / Math.max(m.trend.length, 1));
  return (
    <Arrive as="section" className="block trend" index={6}>
      <div className="block-head">
        <h2 className="section-title">Calls on the last {m.trend.length} working days</h2>
        <span className="block-meta">{avg} a day on average</span>
      </div>
      <figure className="trend-figure">
        <div className="trend-plot">
          <svg viewBox={`0 0 ${m.trend.length * 20} ${H}`} preserveAspectRatio="none" aria-hidden="true">
            {m.trend.map((t, i) => {
              const hd = (t.done / max) * H;
              const hm = (t.missed / max) * H;
              return (
                <g key={t.date}>
                  <motion.rect className="tbar" x={i * 20 + 4} width={12} rx={2} y={H - hd} height={hd}
                    style={{ transformOrigin: `0 ${H}px`, transformBox: 'view-box' }}
                    initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }}
                    transition={{ duration: 0.45, ease: EASE, delay: reduce ? 0 : 0.15 + i * 0.02 }} />
                  {t.missed > 0 && <rect className="tbar-missed" x={i * 20 + 4} width={12} rx={2} y={H - hd - hm} height={hm} />}
                </g>
              );
            })}
          </svg>
        </div>
        <div className="trend-axis" aria-hidden="true">
          <span>{m.trend[0]?.label}</span>
          <span className="trend-key"><span className="k-done" />Done <span className="k-missed" />Missed</span>
          <span>{m.trend[m.trend.length - 1]?.label}</span>
        </div>
        <table className="visually-hidden">
          <caption>Calls done and missed by day</caption>
          <tbody>{m.trend.map(t => <tr key={t.date}><th scope="row">{t.label}</th><td>{t.done} done</td><td>{t.missed} missed</td></tr>)}</tbody>
        </table>
      </figure>
    </Arrive>
  );
}

function RankList({ title, people }: { title: string; people: { id: string; name: string; hq: string; value: string }[] }) {
  return (
    <div className="rank">
      <h3 className="rank-title">{title}</h3>
      <ol>
        {people.map(p => (
          <li key={p.id}>
            <span className="rank-name">
              {p.name}
              <span className="cell-sub">{p.hq}</span>
            </span>
            <span className="rank-value">{p.value}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
