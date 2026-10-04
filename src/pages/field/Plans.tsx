import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { invalidate, useResource } from '../../data/resource';
import { decideTour, loadDayPlans, loadTourPlans, workTypeLabel, type DayPlansModel, type TourModel, type TourRow } from '../../live/field';
import { approvalsStore } from '../../data/approvals';
import { IST_TODAY, dayMonth, longDay, shiftDay, shortDay, timeOf, weekdayOf } from '../../lib/days';
import { count } from '../../lib/format';
import { Confirm, DateInput, Drawer, Filter, Pill, SearchBox, Summary, Toolbar, useShowMore } from '../../components/kit';
import { Segmented } from '../../components/Segmented';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useCan } from '../../app/access';

// ── day plans ─────────────────────────────────────────────────────────

/**
 * Day plans: what each person declared in the morning. The worth of this page
 * is the gap: someone with no plan by mid-morning is the one thing a manager
 * can still act on before the day is lost.
 */
export function DayPlans() {
  const [params, setParams] = useSearchParams();
  const today = IST_TODAY();
  const date = params.get('date') ?? today;
  const setDate = (d: string) => setParams(p => { p.set('date', d); return p; }, { replace: true });
  const r = useResource<DayPlansModel>(`field:plans:${date}`, () => loadDayPlans(date));
  return (
    <div className="page-body">
      <Toolbar>
        <div className="day-step" role="group" aria-label="Day">
          <button type="button" className="icon-btn" aria-label="The day before" onClick={() => setDate(shiftDay(date, -1))}><CaretLeft size={16} /></button>
          <DateInput label="Day" value={date} max={today} onChange={setDate} />
          <button type="button" className="icon-btn" aria-label="The day after" disabled={date >= today} onClick={() => setDate(shiftDay(date, 1))}><CaretRight size={16} /></button>
        </div>
        {date !== today && <button type="button" className="link" onClick={() => setDate(today)}>Back to today</button>}
        <span className="toolbar-end"><Freshness at={r.at} error={r.error} reload={() => void r.reload()} label="Read the day plans again" /></span>
      </Toolbar>
      {r.status === 'error' && !r.data ? <LoadError what="The day plans" error={r.error} retry={() => void r.reload()} />
        : !r.data ? <Loading label="Reading the day plans" lines={1} />
        : <DayPlanTable m={r.data} goTo={setDate} />}
    </div>
  );
}

function DayPlanTable({ m, goTo }: { m: DayPlansModel; goTo: (d: string) => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [manager, setManager] = useState('all');
  const [state, setState] = useState<'all' | 'missing' | 'filed'>('all');
  // On a week off or a holiday nobody owes a day plan.
  const expected = m.off ? m.rows.filter(r => r.plan) : m.rows.filter(r => !r.onLeave);
  const filed = m.rows.filter(r => r.plan);
  const missing = m.off ? [] : expected.filter(r => !r.plan);
  const isToday = m.date === IST_TODAY();
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return m.rows
      .filter(r => !needle || `${r.name} ${r.code} ${r.hq}`.toLowerCase().includes(needle))
      .filter(r => manager === 'all' || r.managerId === manager)
      .filter(r => state === 'all' || (state === 'missing' ? !r.plan && !r.onLeave && !m.off : Boolean(r.plan)))
      .sort((a, b) => Number(Boolean(a.plan) || a.onLeave) - Number(Boolean(b.plan) || b.onLeave) || (a.plan?.at ?? '').localeCompare(b.plan?.at ?? '') || a.name.localeCompare(b.name));
  }, [m, q, manager, state]);
  const { shown, more } = useShowMore(rows, 60);

  return (
    <Arrive>
      <Summary>
        {m.off && !filed.length
          ? <><strong>{longDay(m.date)}</strong> {m.off === 'holiday' ? `was ${m.holidayName ?? 'a company holiday'}` : 'was the week off'}. Nobody needed a day plan. <button type="button" className="link" onClick={() => goTo(m.prevWorking)}>See {longDay(m.prevWorking)}</button></>
          : <><strong>{longDay(m.date)}</strong>: {filed.length} of {count(expected.length, 'person', 'people')} declared their day.
            {missing.length ? <> <span className="warn-text">{count(missing.length, 'person', 'people')}</span> {isToday ? 'have not yet' : 'did not'}.</> : ' Everyone expected did.'}
            {m.rows.length - expected.length ? ` ${m.rows.length - expected.length} on approved leave.` : ''}</>}
      </Summary>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Name, employee code or HQ" label="Find a person" />
        <Filter label="Manager" value={manager} onChange={setManager} options={[{ value: 'all', label: 'Everyone' }, ...m.managers.map(x => ({ value: x.id, label: x.name }))]} />
        <Segmented label="Day plan" value={state} onChange={setState} options={[
          { value: 'all', label: 'Everyone', count: m.rows.length },
          { value: 'missing', label: 'Not filed', count: missing.length },
          { value: 'filed', label: 'Filed', count: filed.length },
        ]} />
      </Toolbar>
      {rows.length === 0 ? (
        <div className="list-empty"><Empty title={m.rows.length ? 'Nobody matches these filters' : 'Nobody is in the field yet'}>{m.rows.length ? 'Try another name or clear the filters.' : 'People appear here once they are added with a field role.'}</Empty></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Declared</th>
                <th scope="col">Work</th>
                <th scope="col" className="hide-narrow">Declared from</th>
                <th scope="col" className="num">Calls planned</th>
                <th scope="col" className="num">Done</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(r => {
                const to = `/field/${r.id}/${m.date}`;
                return (
                  <tr key={r.id} className="clickable" onClick={() => nav(to)}>
                    <th scope="row">
                      <Link className="cell-link" to={to} onClick={e => e.stopPropagation()}>{r.name}</Link>
                      <span className="cell-sub">{[r.code, r.hq, r.manager && `reports to ${r.manager}`].filter(Boolean).join(' · ')}</span>
                    </th>
                    <td>{r.plan ? timeOf(r.plan.at) : r.onLeave ? <span className="cell-quiet">On leave</span> : m.off ? <span className="cell-quiet">Day off</span> : <Pill tone="warning">Not filed</Pill>}</td>
                    <td>
                      {r.plan ? <>{workTypeLabel(r.plan.workType)}{r.plan.tourType && r.plan.tourType !== 'local' ? `, ${r.plan.tourType === 'outstation' ? 'outstation' : 'ex-station'}` : ''}<span className="cell-sub">{[r.plan.area, r.plan.cluster].filter(Boolean).join(' · ')}</span>{r.plan.remarks && <span className="cell-sub">“{r.plan.remarks}”</span>}</> : <span className="cell-quiet">None</span>}
                    </td>
                    <td className="hide-narrow">{r.plan?.address ?? <span className="cell-quiet">Not captured</span>}</td>
                    <td className="num">{r.planned}</td>
                    <td className="num">{r.done}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {more}
    </Arrive>
  );
}

// ── tour plans ────────────────────────────────────────────────────────

const TOUR_STATUS: Record<TourRow['status'], { word: string; tone: 'good' | 'warning' | 'critical' | 'neutral' | 'accent'; rank: number }> = {
  pending: { word: 'Waiting for a decision', tone: 'accent', rank: 0 },
  draft: { word: 'Being planned', tone: 'neutral', rank: 1 },
  none: { word: 'Not started', tone: 'warning', rank: 2 },
  rejected: { word: 'Sent back', tone: 'warning', rank: 3 },
  approved: { word: 'Approved', tone: 'good', rank: 4 },
};

/**
 * Tour plans: each person's month as planned. Next month is the one that
 * matters most of the time, so it opens on it from the 20th; before that, on
 * this month.
 */
export function TourPlans() {
  const today = IST_TODAY();
  const [y, mo, d] = today.split('-').map(Number);
  const months = [-1, 0, 1].map(k => {
    const x = new Date(y, mo - 1 + k, 1);
    return { year: x.getFullYear(), month: x.getMonth() + 1, label: x.toLocaleDateString('en-IN', { month: 'long' }), key: `${x.getFullYear()}-${x.getMonth() + 1}` };
  });
  const [pick, setPick] = useState(d >= 20 ? months[2].key : months[1].key);
  const chosen = months.find(x => x.key === pick)!;
  const r = useResource<TourModel>(`field:tours:${pick}`, () => loadTourPlans(chosen.year, chosen.month));
  return (
    <div className="page-body">
      <Toolbar>
        <Segmented label="Month" value={pick} onChange={setPick} options={months.map(x => ({ value: x.key, label: x.label }))} />
        <span className="toolbar-end"><Freshness at={r.at} error={r.error} reload={() => void r.reload()} label="Read the tour plans again" /></span>
      </Toolbar>
      {r.status === 'error' && !r.data ? <LoadError what="The tour plans" error={r.error} retry={() => void r.reload()} />
        : !r.data ? <Loading label="Reading the tour plans" lines={1} />
        : <TourTable m={r.data} reload={() => { invalidate(`field:tours:${pick}`); void approvalsStore.load(); }} />}
    </div>
  );
}

function TourTable({ m, reload }: { m: TourModel; reload: () => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<TourRow | null>(null);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return m.rows
      .filter(r => !needle || `${r.name} ${r.code} ${r.hq}`.toLowerCase().includes(needle))
      .sort((a, b) => TOUR_STATUS[a.status].rank - TOUR_STATUS[b.status].rank || a.name.localeCompare(b.name));
  }, [m, q]);
  const by = (s: TourRow['status']) => m.rows.filter(r => r.status === s).length;
  const stuck = m.rows.filter(r => (r.status === 'draft' || r.status === 'none' || r.status === 'rejected') && r.unplanned.length > 0);

  return (
    <Arrive>
      <Summary>
        <strong>{m.label}</strong>, {count(m.workingDays.length, 'working day')}:{' '}
        {[by('pending') && `${by('pending')} waiting for a decision`, by('approved') && `${by('approved')} approved`, by('draft') && `${by('draft')} being planned`, by('none') && `${by('none')} not started`, by('rejected') && `${by('rejected')} sent back`].filter(Boolean).join(', ') || 'nobody has started'}.
        {stuck.length > 0 && <> <span className="warn-text">{count(stuck.length, 'month')}</span> cannot be sent yet: the phone refuses a month until every working day is planned.</>}
      </Summary>
      <Toolbar><SearchBox value={q} onChange={setQ} placeholder="Name, employee code or HQ" label="Find a person" /></Toolbar>
      {rows.length === 0 ? (
        <div className="list-empty"><Empty title={m.rows.length ? 'Nobody matches this search' : 'Nobody plans tours yet'}>{m.rows.length ? 'Try another name.' : 'Field people appear here once they are added.'}</Empty></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">Days planned</th>
                <th scope="col" className="num">Client visits</th>
                <th scope="col" className="num hide-narrow">Outstation days</th>
                <th scope="col" className="hide-narrow">Sent</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const st = TOUR_STATUS[r.status];
                return (
                  <tr key={r.personId} className="clickable" onClick={() => setOpen(r)}>
                    <th scope="row">
                      <button type="button" className="cell-link cell-button" onClick={e => { e.stopPropagation(); setOpen(r); }} aria-haspopup="dialog">{r.name}</button>
                      <span className="cell-sub">{[r.code, r.hq, r.manager && `reports to ${r.manager}`].filter(Boolean).join(' · ')}</span>
                    </th>
                    <td><Pill tone={st.tone}>{st.word}</Pill></td>
                    <td className="num">
                      <span className="inline-meter" aria-hidden="true"><span style={{ transform: `scaleX(${r.working ? r.plannedDays / r.working : 0})` }} /></span>
                      {r.plannedDays}<span className="cell-sub-inline"> of {r.working}</span>
                    </td>
                    <td className="num">{r.calls || <span className="cell-quiet">0</span>}</td>
                    <td className="num hide-narrow">{r.outstation || <span className="cell-quiet">0</span>}</td>
                    <td className="hide-narrow">{r.submittedAt ? shortDay(r.submittedAt.slice(0, 10)) : <span className="cell-quiet">Not sent</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <TourDrawer row={open} m={m} onClose={() => setOpen(null)} onDecided={() => { setOpen(null); reload(); }} />
    </Arrive>
  );
}

function TourDrawer({ row, m, onClose, onDecided }: { row: TourRow | null; m: TourModel; onClose: () => void; onDecided: () => void }) {
  const allowed = useCan();
  const [ask, setAsk] = useState<'approve' | 'reject' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canDecide = row?.status === 'pending' && row.monthId && allowed('approvals');
  const decide = async (approve: boolean, reason: string) => {
    if (!row?.monthId) return;
    setBusy(true);
    setError('');
    try {
      await decideTour(row.monthId, approve, reason);
      setAsk(null);
      onDecided();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const first = `${m.year}-${String(m.month).padStart(2, '0')}-01`;
  const lead = (weekdayOf(first) + 6) % 7;
  const daysIn = new Date(m.year, m.month, 0).getDate();
  const byDate = new Map(row?.days.map(d => [d.date, d]) ?? []);
  const working = new Set(m.workingDays);

  return (
    <Drawer
      open={Boolean(row)}
      onClose={onClose}
      title={row ? `${row.name}, ${m.label}` : ''}
      sub={row ? `${row.plannedDays} of ${count(row.working, 'working day')} planned · ${count(row.calls, 'client visit')}${row.outstation ? ` · ${row.outstation} outstation` : ''}` : ''}
      wide
      footer={canDecide ? (
        <>
          <button type="button" className="btn btn-secondary" onClick={() => setAsk('reject')}>Send back</button>
          <button type="button" className="btn btn-primary" onClick={() => setAsk('approve')}>Approve the month</button>
        </>
      ) : undefined}
    >
      {row && (
        <>
          <div className="pill-row"><Pill tone={TOUR_STATUS[row.status].tone}>{TOUR_STATUS[row.status].word}</Pill>{row.submittedAt && <span className="row-meta">sent {dayMonth(row.submittedAt.slice(0, 10))}</span>}</div>
          {row.unplanned.length > 0 && row.status !== 'approved' && (
            <p className="drawer-note">
              <span className="warn-text">{count(row.unplanned.length, 'working day')} still unplanned</span>: {row.unplanned.slice(0, 8).map(k => shortDay(k)).join(', ')}{row.unplanned.length > 8 ? ` and ${row.unplanned.length - 8} more` : ''}.
              {row.status !== 'pending' && ' The phone will not send the month until each one is answered.'}
            </p>
          )}
          <div className="mcal" role="grid" aria-label={`${m.label}, day by day`}>
            <div className="mcal-row mcal-head" role="row">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(w => <span key={w} role="columnheader">{w}</span>)}
            </div>
            <div className="mcal-grid">
              {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} aria-hidden="true" />)}
              {Array.from({ length: daysIn }, (_, i) => {
                const k = `${first.slice(0, 8)}${String(i + 1).padStart(2, '0')}`;
                const day = byDate.get(k);
                const off = !working.has(k);
                const state = off ? 'off' : !day ? 'missing' : ['leave', 'holiday'].includes(day.workType) ? 'away' : 'planned';
                const word = off ? 'not a working day' : !day ? 'not planned' : `${workTypeLabel(day.workType)}${day.area ? `, ${day.area}` : ''}${day.planned || day.clients.length ? `, ${count(day.planned || day.clients.length, 'visit')}` : ''}`;
                return (
                  <span key={k} role="gridcell" className={`mcal-day ${state}`} title={`${dayMonth(k)}: ${word}`} aria-label={`${dayMonth(k)}: ${word}`}>
                    <span className="mcal-n">{i + 1}</span>
                    {state === 'planned' && <span className="mcal-v">{day!.planned || day!.clients.length}</span>}
                  </span>
                );
              })}
            </div>
            <p className="mcal-key"><span><i className="planned" />Planned, with visits</span><span><i className="missing" />Working day not planned</span><span><i className="off" />Week off or holiday</span></p>
          </div>

          <section className="drawer-section">
            <h3>Day by day</h3>
            {row.days.filter(d => working.has(d.date)).length === 0 ? (
              <p className="drawer-note">No working day has been planned yet.</p>
            ) : (
              <ul className="rows">
                {row.days.filter(d => working.has(d.date)).map(d => (
                  <li key={d.date} className="row">
                    <div className="row-main">
                      <p className="row-title">{shortDay(d.date)} <span className="row-title-sub">· {workTypeLabel(d.workType)}{d.area ? `, ${d.area}` : ''}{d.tourType && d.tourType !== 'local' ? `, ${d.tourType === 'outstation' ? 'outstation' : 'ex-station'}` : ''}</span></p>
                      {d.clients.length > 0 && <p className="row-sub">{d.clients.slice(0, 4).join(', ')}{d.clients.length > 4 ? ` and ${d.clients.length - 4} more` : ''}</p>}
                    </div>
                    <span className="row-meta">{d.planned || d.clients.length ? count(d.planned || d.clients.length, 'visit') : ''}{d.km ? ` · ${Math.round(d.km)} km` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      <Confirm
        open={ask === 'approve'}
        title={row ? `Approve ${row.name}'s ${m.label.split(' ')[0]}?` : ''}
        confirmLabel="Approve the month"
        busy={busy}
        error={error}
        onCancel={() => setAsk(null)}
        onConfirm={() => void decide(true, '')}
      >
        An approved month is locked on the phone. {row && row.unplanned.length ? `${count(row.unplanned.length, 'working day')} in it are still unplanned.` : 'Every working day is planned.'}
      </Confirm>
      <Confirm
        open={ask === 'reject'}
        title={row ? `Send ${row.name}'s ${m.label.split(' ')[0]} back?` : ''}
        confirmLabel="Send back"
        busy={busy}
        error={error}
        reason={{ label: 'What should change', required: true, placeholder: 'For example: plan more calls on the listed doctors in the second week.' }}
        onCancel={() => setAsk(null)}
        onConfirm={reason => void decide(false, reason)}
      >
        {row?.name} gets a message with your reason, and can change the month and send it again.
      </Confirm>
    </Drawer>
  );
}
