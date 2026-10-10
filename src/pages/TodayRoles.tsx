import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check } from '@phosphor-icons/react';
import { useResource, invalidate } from '../data/resource';
import { dismissSetupStep, loadFinance, loadHr, loadIt, loadSetup, type FinanceModel, type HrModel, type ItModel } from '../live/home';
import { useMe } from '../live/session';
import { useCan } from '../app/access';
import { count, percent, rupees, rupeesShort } from '../lib/format';
import { ago, dayMonth, dayOf, daysBetween, longDay, shortDay } from '../lib/days';
import { Arrive, CountUp } from '../components/motion';
import { Empty, Freshness, LoadError, Loading } from '../components/States';

/**
 * Today for the people who do not run the field day to day. Each answers its
 * own question in one sentence first, then lists what needs a decision, then
 * what is worth knowing. No row of metric tiles: a figure sits in a sentence or
 * beside the list it summarises.
 */

const weekdayDate = (d: Date) => longDay(dayOf(d));

function Head({ at, error, reload }: { at: Date | null; error: string; reload: () => void }) {
  return (
    <Arrive className="page-head">
      <p className="eyebrow">
        <span>{weekdayDate(new Date())}</span>
        <Freshness at={at} error={error} reload={reload} label="Refresh today" />
      </p>
    </Arrive>
  );
}

// ── first run ─────────────────────────────────────────────────────────

/**
 * The steps between a new company and a rep signing in, in the order they have
 * to happen. Only the unfinished ones are listed; the next one is lit. It goes
 * away when the list is done.
 */
export function SetupGuide() {
  const me = useMe();
  const r = useResource('home:setup', loadSetup);
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState('');
  const [failed, setFailed] = useState('');
  if (r.status !== 'ready' || !r.data) return null;
  const steps = r.data;
  const done = steps.filter(s => s.done).length;
  if (done === steps.length) return null;
  const next = steps.find(s => !s.done)!;
  const mayDecline = me.role === 'owner' || me.role === 'admin';
  const shown = steps.filter(s => showDone || !s.done);

  const decline = async (key: string) => {
    setBusy(key);
    setFailed('');
    try {
      await dismissSetupStep(key);
      invalidate('home:setup');
    } catch (e) {
      setFailed(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <Arrive as="section" className="setup" index={1}>
      <div className="setup-head">
        <div>
          <h2 className="section-title">Finish setting up</h2>
          <p className="setup-sub">
            {done} of {steps.length} done, in the order they have to happen. Your team can sign in on the phone once they are finished.
          </p>
        </div>
        <div className="setup-meter" role="progressbar" aria-label="Setup" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}>
          <span style={{ transform: `scaleX(${done / steps.length})` }} />
        </div>
      </div>
      <ol className="setup-steps">
        {shown.map(s => {
          const n = steps.indexOf(s) + 1;
          return (
            <li key={s.key} className={s.done ? 'done' : s === next ? 'next' : ''}>
              <span className="setup-n" aria-hidden="true">{s.done ? <Check size={13} weight="bold" /> : n}</span>
              <div className="setup-text">
                <p className="setup-title">
                  {s.title}
                  {s.optional && <span className="setup-optional">Optional</span>}
                  {s.done && <span className="visually-hidden"> (done)</span>}
                </p>
                <p className="setup-body">{s.body}</p>
              </div>
              {!s.done && (
                <span className="setup-actions">
                  {s.optional && mayDecline && (
                    <button type="button" className="btn btn-quiet" disabled={busy === s.key} onClick={() => void decline(s.key)}>
                      {busy === s.key ? 'Saving…' : 'Not now'}
                    </button>
                  )}
                  <Link className={`btn ${s === next ? 'btn-primary' : 'btn-secondary'}`} to={s.to}>{s.action}</Link>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {failed && <p className="form-error" role="alert">That step could not be set aside: {failed}</p>}
      {done > 0 && (
        <button type="button" className="link setup-toggle" onClick={() => setShowDone(v => !v)} aria-expanded={showDone}>
          {showDone ? 'Hide the finished steps' : `Show the ${count(done, 'finished step')}`}
        </button>
      )}
    </Arrive>
  );
}

// ── HR ────────────────────────────────────────────────────────────────

export function HrToday() {
  const r = useResource<HrModel>('home:hr', loadHr);
  const allowed = useCan();
  if (r.status === 'error' && !r.data) return <LoadError what="Today" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading today" />;
  const m = r.data;
  const d = m.day;
  const atWork = d.present;
  // Today has no attendance row for someone who has not declared yet: the
  // database leaves it out, because today is never a missed day. So today is
  // measured against the roster, and the gap is "not declared yet", not "nobody".
  const expected = d.isToday && !m.todayOff ? Math.max(d.present + d.absent + d.leave, m.headcount) : d.present + d.absent + d.leave;
  const notYet = d.isToday && !m.todayOff ? expected - d.present - d.leave : d.absent;
  const dayLine = `${d.isToday ? 'Today' : longDay(d.date)}: ${atWork} of ${count(expected, 'person', 'people')} at work`
    + (d.leave ? `, ${d.leave} on leave` : '') + (d.absent ? `, ${d.absent} not in` : '') + '.';

  return (
    <div className="dash">
      <Head at={r.at} error={r.error} reload={() => void r.reload()} />
      <Arrive className="hero" index={1}>
        <p className="hero-line">
          {m.todayOff === 'weekOff' ? <>{new Date().toLocaleDateString('en-IN', { weekday: 'long' })}, the week off</>
            : m.todayOff === 'holiday' ? <>{m.todayHolidayName ?? 'A company holiday'}</>
            : expected === 0 ? <>Nobody is on the roster yet</>
            : <><span className="hero-figure"><CountUp value={atWork} format={n => String(Math.round(n))} /></span> of {count(expected, 'person', 'people')} at work today</>}
        </p>
        <p className="hero-sub">
          {m.todayOff || !d.isToday ? dayLine : [
            d.leave ? `${d.leave} on approved leave.` : '',
            notYet ? `${count(notYet, 'person has', 'people have')} not declared a day plan yet.` : 'Everyone expected has declared their day.',
          ].filter(Boolean).join(' ')}
          {' '}{count(m.headcount, 'person', 'people')} on the roster{m.joinedThisMonth.length ? `, ${m.joinedThisMonth.length} joined this month` : ''}.
        </p>
      </Arrive>
      <SetupGuide />

      <div className="pair">
        <Arrive as="section" className="block" index={2}>
          <div className="block-head">
            <h2 className="section-title">Leave waiting for a decision</h2>
            {m.leaveWaiting.length > 0 && allowed('approvals') && (
              <Link className="link" to="/approvals?kind=leave">Decide <ArrowRight size={13} aria-hidden="true" /></Link>
            )}
          </div>
          {m.leaveWaiting.length === 0 ? (
            <p className="block-empty">Nothing is waiting. Leave applied for on the phone appears here as soon as it is sent.</p>
          ) : (
            <ul className="rows">
              {m.leaveWaiting.map(l => (
                <li key={l.id} className="row">
                  <div className="row-main">
                    <p className="row-title">{l.name}</p>
                    <p className="row-sub">{l.type}, {count(l.days, 'day')} · {l.from === l.to ? dayMonth(l.from) : `${shortDay(l.from)} to ${shortDay(l.to)}`} · {l.reason}</p>
                  </div>
                  <span className="row-meta">sent {ago(l.appliedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Arrive>

        <Arrive as="section" className="block" index={3}>
          <div className="block-head">
            <h2 className="section-title">Away in the next week</h2>
            <span className="block-meta">{m.awayThisWeek.length ? count(m.awayThisWeek.length, 'person', 'people') : ''}</span>
          </div>
          {m.awayThisWeek.length === 0 ? (
            <p className="block-empty">Nobody has approved leave in the next seven days.</p>
          ) : (
            <ul className="rows">
              {m.awayThisWeek.map(a => (
                <li key={`${a.personId}-${a.from}`} className="row">
                  <div className="row-main">
                    <p className="row-title">{a.name}</p>
                    <p className="row-sub">{a.type}</p>
                  </div>
                  <span className="row-meta">{a.from === a.to ? shortDay(a.from) : `${shortDay(a.from)} to ${shortDay(a.to)}`}</span>
                </li>
              ))}
            </ul>
          )}
          {m.joinedThisMonth.length > 0 && (
            <>
              <h3 className="sub-title">Joined this month</h3>
              <ul className="rows">
                {m.joinedThisMonth.map(j => (
                  <li key={j.id} className="row">
                    <div className="row-main"><p className="row-title">{j.name}</p></div>
                    <span className="row-meta">{dayMonth(j.joinedAt)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Arrive>
      </div>

      <Arrive as="section" className="block" index={4}>
        <div className="block-head">
          <h2 className="section-title">Documents that lapse within 30 days</h2>
          <span className="block-meta">{m.documents.length ? count(m.documents.length, 'document') : ''}</span>
        </div>
        {m.documents.length === 0 ? (
          <p className="block-empty">No document on anyone's record expires in the next 30 days. Documents with an expiry date appear here a month before it.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th scope="col">Person</th><th scope="col">Document</th><th scope="col" className="num">Expires</th></tr>
              </thead>
              <tbody>
                {m.documents.map(doc => {
                  const left = daysBetween(m.today, doc.expiresAt);
                  return (
                    <tr key={doc.id}>
                      <th scope="row"><Link className="cell-link" to={`/team/${doc.personId}`}>{doc.name}</Link></th>
                      <td>{doc.category}</td>
                      <td className="num">
                        {left < 0 ? <span className="pill critical">Expired</span> : left <= 7 ? <span className="pill warning">In {count(left, 'day')}</span> : null}
                        {' '}{dayMonth(doc.expiresAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Arrive>
    </div>
  );
}

// ── Finance ───────────────────────────────────────────────────────────

export function FinanceToday() {
  const r = useResource<FinanceModel>('home:finance', loadFinance);
  const allowed = useCan();
  if (r.status === 'error' && !r.data) return <LoadError what="Today" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading the claims" />;
  const m = r.data;
  const w = m.waiting;
  const mo = m.month;
  const split = mo.claimed ? mo.allowancePart / mo.claimed : 0;

  return (
    <div className="dash">
      <Head at={r.at} error={r.error} reload={() => void r.reload()} />
      <Arrive className="hero" index={1}>
        <p className="hero-line">
          {w.amount > 0
            ? <><span className="hero-figure"><CountUp value={w.amount} format={rupees} /></span> in claims waiting</>
            : <>No claims are waiting</>}
        </p>
        <p className="hero-sub">
          {w.amount > 0
            ? <>{count(w.claims, 'claim')} over {count(w.days, 'day')}{w.oldestSent ? `, the oldest sent ${ago(w.oldestSent)}` : ''}.{allowed('approvals') && <> <Link className="link" to="/approvals?kind=expense">Decide them</Link>.</>}</>
            : 'Claims appear here as soon as someone sends their month from the phone.'}
          {m.orders.count > 0 && <> Orders worth {rupeesShort(m.orders.value)} are also waiting for approval.</>}
        </p>
      </Arrive>

      <Arrive as="section" className="block month" index={2}>
        <div className="block-head">
          <h2 className="section-title">{m.closing ? `${m.monthLabel} claims, being closed` : `${m.monthLabel} claims so far`}</h2>
          <span className="block-meta">{m.varies ? `company allowance ${rupees(m.allowance)}, some roles or people have their own` : `daily allowance ${rupees(m.allowance)}`} · a bill is needed above {rupees(m.billAbove)}</span>
        </div>
        <div className="month-figures">
          <div className="mf mf-lead">
            <span className="mf-value"><CountUp value={mo.claimed} format={rupeesShort} /></span>
            <span className="mf-label">claimed by {count(mo.people, 'person', 'people')}</span>
            {mo.claimed > 0 && (
              <>
                <span className="split" role="img" aria-label={`${percent(mo.allowancePart, mo.claimed)} is daily allowance`}>
                  <span className="split-a" style={{ flexGrow: split }} />
                  <span className="split-b" style={{ flexGrow: 1 - split }} />
                </span>
                <span className="split-key">
                  <span><span className="k-a" />Allowance {rupeesShort(mo.allowancePart)}</span>
                  <span><span className="k-b" />Above it {rupeesShort(mo.abovePart)}</span>
                </span>
              </>
            )}
          </div>
          <div className="mf"><span className="mf-value">{rupeesShort(mo.approved)}</span><span className="mf-label">approved</span></div>
          <div className="mf"><span className="mf-value">{rupeesShort(mo.pending)}</span><span className="mf-label">waiting</span></div>
          {mo.rejected > 0 && <div className="mf"><span className="mf-value">{rupeesShort(mo.rejected)}</span><span className="mf-label">rejected</span></div>}
          <div className="mf"><span className="mf-value">{rupeesShort(mo.draft)}</span><span className="mf-label">in drafts, not sent</span></div>
        </div>
        <p className="block-note">
          {m.closing
            ? `${m.nextLabel} has ${rupees(m.draftsNow)} in drafts so far, not yet sent.`
            : `${m.lastMonth.label} closed with ${rupees(m.lastMonth.approved)} approved for ${count(m.lastMonth.people, 'person', 'people')}.`}
          {m.payroll ? ` ${count(m.payroll.released, 'payslip')} released for ${m.payroll.label}, ${rupees(m.payroll.netPaid)} net.` : ''}
        </p>
      </Arrive>

      <div className="pair">
        <Arrive as="section" className="block" index={3}>
          <div className="block-head">
            <h2 className="section-title">Days above the allowance</h2>
            <span className="block-meta">{m.monthLabel}, furthest over first</span>
          </div>
          {m.aboveAllowance.length === 0 ? (
            <p className="block-empty">No day in {m.monthLabel} was claimed above {m.varies ? "anyone's daily allowance" : `the daily allowance of ${rupees(m.allowance)}`}.</p>
          ) : (
            <ul className="rows">
              {m.aboveAllowance.map(e => (
                <li key={e.id} className="row">
                  <div className="row-main">
                    <p className="row-title">{e.name} <span className="row-title-sub">· {shortDay(e.date)}</span></p>
                    <p className="row-sub">
                      {e.categories.join(', ')}{e.note ? ` · ${e.note}` : ''}
                      {' · '}{e.bills ? count(e.bills, 'bill') : <span className="warn-text">no bill</span>}
                      {e.status === 'pending' ? ' · waiting' : e.status === 'rejected' ? ' · rejected' : ' · approved'}
                    </p>
                  </div>
                  <span className="row-figure">{rupees(e.amount)}<span className="cell-sub">{rupees(e.amount - e.allowance)} over {rupees(e.allowance)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Arrive>

        <Arrive as="section" className="block" index={4}>
          <div className="block-head">
            <h2 className="section-title">Claimed per working day</h2>
            <span className="block-meta">sent for {m.monthLabel}</span>
          </div>
          {m.byPerson.length === 0 ? (
            <p className="block-empty">Nobody has sent a claim for {m.monthLabel} yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th scope="col">Person</th><th scope="col" className="num">Days</th><th scope="col" className="num">Per day</th></tr></thead>
                <tbody>
                  {m.byPerson.slice(0, 8).map(p => (
                    <tr key={p.personId}>
                      <th scope="row"><span className="cell-main">{p.name}</span></th>
                      <td className="num">{p.days}</td>
                      <td className="num">{rupees(p.perDay)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Arrive>
      </div>
    </div>
  );
}

// ── IT ────────────────────────────────────────────────────────────────

export function ItToday() {
  const r = useResource<ItModel>('home:it', loadIt);
  const allowed = useCan();
  if (r.status === 'error' && !r.data) return <LoadError what="Today" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading logins and phones" />;
  const m = r.data;
  const issues = m.noLogin.length + m.phones.quiet.length + m.logins.firstPassword.length;

  return (
    <div className="dash">
      <Head at={r.at} error={r.error} reload={() => void r.reload()} />
      <Arrive className="hero" index={1}>
        <p className="hero-line">
          {issues === 0 ? <>Every login and phone is in order</>
            : m.noLogin.length ? <>{count(m.noLogin.length, 'field person has', 'field people have')} no phone login</>
            : m.phones.quiet.length ? <>{count(m.phones.quiet.length, 'phone has', 'phones have')} gone quiet</>
            : <>{count(m.logins.firstPassword.length, 'login is', 'logins are')} still on a first password</>}
        </p>
        <p className="hero-sub">
          {count(m.logins.office, 'office login')} and {count(m.logins.phone, 'phone login')}{m.logins.suspended ? `, ${m.logins.suspended} suspended` : ''}.
          {' '}{m.phones.registered} of {count(m.phones.field, 'field person', 'field people')} have a phone registered.
          {' '}The last visit reached the server {ago(m.lastFromPhone)}.
        </p>
      </Arrive>
      <SetupGuide />

      <div className="pair">
        <Arrive as="section" className="block" index={2}>
          <div className="block-head">
            <h2 className="section-title">Field people without a phone login</h2>
            {m.noLogin.length > 0 && allowed('users') && <Link className="link" to="/settings/logins">Give logins <ArrowRight size={13} aria-hidden="true" /></Link>}
          </div>
          {m.noLogin.length === 0 ? (
            <p className="block-empty">Everyone in the field can sign in to the app.</p>
          ) : (
            <ul className="rows">
              {m.noLogin.map(p => (
                <li key={p.id} className="row">
                  <div className="row-main"><p className="row-title">{p.name}</p><p className="row-sub">{p.hq || 'No headquarters set'}</p></div>
                </li>
              ))}
            </ul>
          )}
        </Arrive>

        <Arrive as="section" className="block" index={3}>
          <div className="block-head">
            <h2 className="section-title">Phones not heard from in three days</h2>
            <span className="block-meta">{m.phones.quiet.length ? count(m.phones.quiet.length, 'phone') : ''}</span>
          </div>
          {m.phones.quiet.length === 0 ? (
            <p className="block-empty">Every phone with a login has reached the server in the last three days.</p>
          ) : (
            <ul className="rows">
              {m.phones.quiet.map(p => (
                <li key={p.id} className="row">
                  <div className="row-main"><p className="row-title">{p.name}</p></div>
                  <span className="row-meta">last seen {ago(p.lastSeen)}</span>
                </li>
              ))}
            </ul>
          )}
        </Arrive>
      </div>

      <div className="pair">
        <Arrive as="section" className="block" index={4}>
          <div className="block-head">
            <h2 className="section-title">Still on their first password</h2>
          </div>
          {m.logins.firstPassword.length === 0 ? (
            <p className="block-empty">Everyone has chosen their own password.</p>
          ) : (
            <ul className="rows">
              {m.logins.firstPassword.map(l => (
                <li key={l.email} className="row">
                  <div className="row-main"><p className="row-title">{l.email}</p><p className="row-sub">{l.role === 'field' ? 'Phone login' : `${l.role[0].toUpperCase()}${l.role.slice(1)} login`}</p></div>
                </li>
              ))}
            </ul>
          )}
        </Arrive>

        <Arrive as="section" className="block" index={5}>
          <div className="block-head">
            <h2 className="section-title">Recent changes</h2>
            {allowed('audit') && <Link className="link" to="/settings/audit">Audit log <ArrowRight size={13} aria-hidden="true" /></Link>}
          </div>
          {m.changes.length === 0 ? (
            <Empty title="No changes recorded yet">Changes to people, roles, logins and rules are kept here for ever.</Empty>
          ) : (
            <ul className="rows">
              {m.changes.map(c => (
                <li key={c.id} className="row">
                  <div className="row-main"><p className="row-title">{c.who} {c.action}</p><p className="row-sub">{c.label}</p></div>
                  <span className="row-meta">{ago(c.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Arrive>
      </div>
    </div>
  );
}
