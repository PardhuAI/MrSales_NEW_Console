import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Plus } from '@phosphor-icons/react';
import { invalidate, useResource } from '../../data/resource';
import { LEAVE_TYPES, adjustLeave, assignTask, decideLeave, leaveLabel, loadAttendance, loadLeave, loadLeaveBalances, loadTasks, mayAdjustLeave, type AttendanceModel, type LeaveBalance, type LeaveRow, type TaskClient } from '../../live/team';
import { loadEmployees } from '../../live/people';
import { useMe } from '../../live/session';
import { approvalsStore } from '../../data/approvals';
import { IST_TODAY, ago, dayMonth, dayRange, dayOf, daysBetween, longDay, shiftDay, timeOf, weekdayOf } from '../../lib/days';
import { count } from '../../lib/format';
import { Confirm, Drawer, Field, Filter, Notice, Pill, SearchBox, Summary, Toolbar, useFocusFirstError, useShowMore } from '../../components/kit';
import { MonthStrip } from '../../components/MonthStrip';
import { Segmented } from '../../components/Segmented';
import { DayStrip, StripBlock } from '../../components/DayStrip';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useCan } from '../../app/access';

// ── attendance ────────────────────────────────────────────────────────

const ATT: Record<string, { letter: string; word: string }> = {
  present: { letter: 'P', word: 'Present' }, absent: { letter: 'A', word: 'No day plan' }, leave: { letter: 'L', word: 'On leave' },
  weekOff: { letter: 'W', word: 'Week off' }, holiday: { letter: 'H', word: 'Holiday' },
};

/**
 * Attendance: who was at work, on leave or off, every day of the month. A day
 * counts as present when a day plan was declared, as on the phone; each cell
 * says why it is what it is.
 */
export function Attendance() {
  const today = IST_TODAY();
  const [month, setMonth] = useState(today.slice(0, 7));
  const r = useResource<AttendanceModel>(`team:attendance:${month}`, () => loadAttendance(month));
  return (
    <div className="page-body">
      <Toolbar>
        <MonthStrip value={month} onChange={setMonth} label="Attendance for" />
        <span className="toolbar-end"><Freshness at={r.at} error={r.error} reload={() => void r.reload()} label="Read attendance again" /></span>
      </Toolbar>
      {r.status === 'error' && !r.data ? <LoadError what="Attendance" error={r.error} retry={() => void r.reload()} />
        : !r.data ? <Loading label="Reading attendance" lines={1} />
        : <AttendanceGrid m={r.data} />}
    </div>
  );
}

function AttendanceGrid({ m }: { m: AttendanceModel }) {
  const [manager, setManager] = useState('all');
  const [q, setQ] = useState('');
  const today = IST_TODAY();
  const last = m.days[m.days.length - 1];
  const people = m.people.filter(p => (manager === 'all' || p.managerId === manager) && (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())));
  // The live view leaves today out for anyone who has done nothing yet, so a missing cell today means "no day plan yet".
  const on = (k: string, s: string) => m.people.filter(p => (p.cells[k]?.status ?? (k === today ? 'absent' : '')) === s).length;
  const allOff = (k: string) => on(k, 'weekOff') + on(k, 'holiday') === m.people.length;
  // On a week off or holiday, the day to read is the last one people worked.
  const ref = [...m.days].reverse().find(k => !allOff(k));
  const offName = last && allOff(last) ? m.people[0]?.cells[last]?.holiday ?? 'the week off' : '';
  const working = (k: string) => m.people.length - on(k, 'weekOff') - on(k, 'holiday');
  const holidays = new Set(m.days.filter(k => m.people.some(p => p.cells[k]?.status === 'holiday')));
  return (
    <Arrive>
      <Summary>
        {!last || m.people.length === 0 ? 'Nothing recorded for this month yet.' : <>
          {offName && <>{last === today ? 'Today' : longDay(last)} is {offName}. </>}
          {ref && <><strong>{ref === today ? 'Today' : longDay(ref)}</strong>: {on(ref, 'present')} of {count(working(ref), 'person', 'people')} present, {on(ref, 'leave') ? `${on(ref, 'leave')} on approved leave` : 'nobody on leave'}{on(ref, 'absent') ? `, ${count(on(ref, 'absent'), 'person', 'people')} with no day plan${ref === today ? ' yet' : ''}` : ''}.</>}
          {holidays.size ? ` ${count(holidays.size, 'company holiday')} this month.` : ''}
        </>}
      </Summary>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Find a person" label="Find a person" />
        <Filter label="Manager" value={manager} onChange={setManager} options={[{ value: 'all', label: 'Everyone' }, ...m.managers.map(x => ({ value: x.id, label: `${x.name}'s team` }))]} />
      </Toolbar>
      <p className="att-key" aria-hidden="true">{Object.values(ATT).map(a => <span key={a.letter}><b className={`att-cell s-${a.letter}`}>{a.letter}</b>{a.word}</span>)}</p>
      {people.length === 0 ? <Empty title="Nobody matches">Try another name or team.</Empty> : (
        <div className="table-wrap att-wrap">
          <table className="table att-grid">
            <caption className="visually-hidden">Attendance for each person and day; hover or focus a day for the reason</caption>
            <thead>
              <tr>
                <th scope="col">Person</th>
                {m.days.map(k => <th key={k} scope="col" className={`att-day${weekdayOf(k) === 0 ? ' sun' : ''}`}><span>{Number(k.slice(8))}</span><span className="att-wd">{['S', 'M', 'T', 'W', 'T', 'F', 'S'][weekdayOf(k)]}</span></th>)}
                <th scope="col" className="num">Present</th>
              </tr>
            </thead>
            <tbody>
              {people.map(p => {
                const present = m.days.filter(k => p.cells[k]?.status === 'present').length;
                return (
                  <tr key={p.id}>
                    <th scope="row"><Link className="cell-link" to={`/team/${p.id}`}>{p.name}</Link><span className="cell-sub">{p.hq}</span></th>
                    {m.days.map(k => {
                      const c = p.cells[k];
                      const a = c ? ATT[c.status] : null;
                      const why = !c ? (k === today ? 'Nothing yet today' : 'Not on the roster that day') : c.status === 'present' ? `Day plan at ${c.declaredAt ? timeOf(c.declaredAt) : 'an unknown time'}, ${count(c.visits, 'visit')}` : c.status === 'holiday' ? c.holiday ?? 'Holiday' : a?.word ?? c.status;
                      return <td key={k} className="att-td"><span className={`att-cell s-${a?.letter ?? 'x'}`} title={`${dayMonth(k)}: ${why}`}><span aria-hidden="true">{a?.letter ?? ''}</span><span className="visually-hidden">{`${dayMonth(k)}: ${why}`}</span></span></td>;
                    })}
                    <td className="num">{present}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Arrive>
  );
}

// ── leave ─────────────────────────────────────────────────────────────

const LEAVE_STATUS: Record<string, { word: string; tone: 'good'  | 'neutral' }> = { approved: { word: 'Approved', tone: 'good' }, pending: { word: 'Waiting for a decision', tone: 'neutral' }, rejected: { word: 'Rejected', tone: 'neutral' }, cancelled: { word: 'Withdrawn', tone: 'neutral' } };

/** Leave: every request from the phone, with its decision, and who is away soon. */
export function Leave() {
  const r = useResource<LeaveRow[]>('team:leave', loadLeave);
  if (r.status === 'error' && !r.data) return <LoadError what="Leave" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading leave" lines={1} />;
  return <LeaveView list={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function LeaveView({ list, at, error, reload }: { list: LeaveRow[]; at: Date | null; error: string; reload: () => void }) {
  const allowed = useCan();
  const [status, setStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [q, setQ] = useState('');
  const [ask, setAsk] = useState<{ l: LeaveRow; approve: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const today = IST_TODAY();
  const year = Number(today.slice(0, 4));
  const balances = useResource(`team:leave-balances:${year}`, () => loadBalancesWithPeople(year));
  const after = (l: LeaveRow) => {
    if (Number(l.from.slice(0, 4)) !== year) return '';
    const b = balances.data?.balances.find(x => x.personId === l.personId && x.type === l.type);
    if (!b?.tracked) return '';
    return b.left < 0 ? ` This takes them over their ${leaveLabel(l.type).toLowerCase()} for ${year} by ${count(-b.left, 'day')}.` : ` With this, ${count(b.left, 'day')} are left for ${year}.`;
  };
  const by = (s: string) => list.filter(l => l.status === s).length;
  const away = list.filter(l => l.status === 'approved' && l.from <= shiftDay(today, 7) && l.to >= today);
  const rows = useMemo(() => list
    .filter(l => status === 'all' || l.status === status)
    .filter(l => !q.trim() || l.person.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || b.from.localeCompare(a.from)), [list, status, q]);
  const { shown, more } = useShowMore(rows, 50);
  const decide = async (reason: string) => {
    if (!ask) return;
    setBusy(true);
    setProblem('');
    try {
      await decideLeave(ask.l.id, ask.approve, reason);
      setNotice(`${ask.l.person}'s leave is ${ask.approve ? 'approved' : 'rejected'}; they get a message.`);
      setAsk(null);
      invalidate('team:', 'home:');
      void approvalsStore.load();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read leave again" />}>
        {list.length === 0 ? 'No leave has been applied for.' : <>
          {by('pending') ? <><strong>{count(by('pending'), 'request')} waiting for a decision</strong>. </> : 'Nothing is waiting. '}
          {away.length ? `${count(away.length, 'person is', 'people are')} away in the next seven days.` : 'Nobody is away in the next seven days.'}
        </>}
      </Summary>
      <WhoIsAway list={list} />
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Find a person" label="Find a person" />
        <Segmented label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All', count: list.length }, { value: 'pending', label: 'Waiting', count: by('pending') }, { value: 'approved', label: 'Approved', count: by('approved') }, { value: 'rejected', label: 'Rejected', count: by('rejected') }]} />
      </Toolbar>
      {list.length === 0 ? <Empty title="No leave applied for">People apply for leave on the phone; their requests appear here with the decision.</Empty> : rows.length === 0 ? <div className="list-empty"><Empty title="Nothing matches">Try another status or name.</Empty></div> : (
        <Arrive>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Person</th><th scope="col" className="fold-phone">Leave</th><th scope="col" className="fold-phone">Dates</th><th scope="col" className="num hide-narrow">Days</th><th scope="col">Status</th>{allowed('approvals') && <th scope="col"><span className="visually-hidden">Decide</span></th>}</tr></thead>
              <tbody>
                {shown.map(l => (
                  <tr key={l.id}>
                    <th scope="row"><Link className="cell-link" to={`/team/${l.personId}`}>{l.person}</Link><span className="cell-sub show-phone">{leaveLabel(l.type)}, {dayRange(l.from, l.to)}</span><span className="cell-sub">{l.reason}</span></th>
                    <td className="leave-type fold-phone">{leaveLabel(l.type)}</td>
                    <td className="fold-phone">{dayRange(l.from, l.to)}<span className="cell-sub">applied {ago(l.appliedAt)}</span></td>
                    <td className="num hide-narrow">{l.days}</td>
                    <td><Pill tone={(LEAVE_STATUS[l.status] ?? { tone: 'neutral' }).tone}>{(LEAVE_STATUS[l.status] ?? { word: l.status }).word}</Pill>{l.decidedBy && <span className="cell-sub">by {l.decidedBy}{l.decisionReason ? `: “${l.decisionReason}”` : ''}</span>}</td>
                    {allowed('approvals') && <td className="row-action">{l.status === 'pending' && <span className="row-actions"><button type="button" className="link" onClick={() => setAsk({ l, approve: false })}>Reject</button><button type="button" className="link strong-link" onClick={() => setAsk({ l, approve: true })}>Approve</button></span>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {more}
        </Arrive>
      )}
      <LeaveBalances year={year} r={balances} />
      <Confirm open={Boolean(ask)} title={ask ? `${ask.approve ? 'Approve' : 'Reject'} ${ask.l.person}'s leave?` : ''} confirmLabel={ask?.approve ? 'Approve the leave' : 'Reject the leave'} busy={busy} error={problem}
        reason={ask && !ask.approve ? { label: 'Why it is rejected', required: true, placeholder: 'For example: please pick other dates; the team is short that week.' } : undefined}
        onCancel={() => setAsk(null)} onConfirm={reason => void decide(reason)}>
        {ask && `${leaveLabel(ask.l.type)}, ${count(ask.l.days, 'day')}: ${dayRange(ask.l.from, ask.l.to)}.${ask.approve ? after(ask.l) : ''} ${ask.l.person} gets a message${ask.approve ? '.' : ' with your reason.'}`}
      </Confirm>
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

type BalancesModel = { balances: LeaveBalance[]; people: { id: string; name: string; code: string; designation: string }[] };
const loadBalancesWithPeople = async (year: number): Promise<BalancesModel> => {
  const [balances, employees] = await Promise.all([loadLeaveBalances(year), loadEmployees()]);
  const ids = new Set(balances.map(b => b.personId));
  return { balances, people: [...employees.values()].filter(e => ids.has(e.id)).map(e => ({ id: e.id, name: e.name, code: e.code, designation: e.designation })).sort((a, b) => a.name.localeCompare(b.name)) };
};

/**
 * What each person has left this year, by leave type: the policy's days plus
 * any adjustment, less what was taken and what is waiting. Only types with a
 * yearly allowance (or an adjustment) are counted; the rest are not limited.
 */
function LeaveBalances({ year, r }: { year: number; r: ReturnType<typeof useResource<BalancesModel>> }) {
  const me = useMe();
  const may = mayAdjustLeave(me.role);
  const [q, setQ] = useState('');
  const [adjust, setAdjust] = useState<{ id: string; name: string } | null>(null);
  const [notice, setNotice] = useState('');
  const m = r.data;
  const types = m ? LEAVE_TYPES.filter(t => m.balances.some(b => b.type === t && b.tracked)) : [];
  const of = (id: string, t: string) => m?.balances.find(b => b.personId === id && b.type === t);
  const needle = q.trim().toLowerCase();
  const people = (m?.people ?? []).filter(p => !needle || `${p.name} ${p.code}`.toLowerCase().includes(needle));
  const over = m ? new Set(m.balances.filter(b => b.tracked && b.left < 0).map(b => b.personId)).size : 0;
  const { shown, more } = useShowMore(people, 50);
  return (
    <section className="block leave-balances" aria-labelledby="leave-left">
      <div className="block-head">
        <h2 id="leave-left" className="section-title">Left in {year}</h2>
        <span className="block-meta">{over ? <span className="warn-text">{count(over, 'person is', 'people are')} over a balance</span> : 'allowance, adjustments, taken and waiting'}</span>
      </div>
      {r.status === 'error' && !m ? <LoadError what="Leave balances" error={r.error} retry={() => void r.reload()} />
        : !m ? <Loading label="Working out the balances" lines={1} />
        : types.length === 0 ? <p className="block-empty">No leave type has a yearly allowance yet, so nothing is counted. Set the days for each type in <Link className="link" to="/settings/hr">HR rules</Link>; balances then appear here and on each phone.</p>
        : (
          <>
            <Toolbar><SearchBox value={q} onChange={setQ} placeholder="Find a person" label="Find a person's balance" /></Toolbar>
            {people.length === 0 ? <div className="list-empty"><Empty title="Nobody matches">Try another name.</Empty></div> : (
              <div className="table-wrap">
                <table className="table leave-balance-table">
                  <thead><tr><th scope="col">Person</th>{types.map(t => <th key={t} scope="col" className="num">{leaveLabel(t).replace(/ leave$/, '')}</th>)}{may && <th scope="col"><span className="visually-hidden">Adjust</span></th>}</tr></thead>
                  <tbody>
                    {shown.map(p => (
                      <tr key={p.id}>
                        <th scope="row"><Link className="cell-link" to={`/team/${p.id}?tab=hr`}>{p.name}</Link><span className="cell-sub">{[p.code, p.designation].filter(Boolean).join(' · ')}</span></th>
                        {types.map(t => {
                          const b = of(p.id, t);
                          if (!b) return <td key={t} className="num" />;
                          return (
                            <td key={t} className="num">
                              {b.left < 0 ? <span className="warn-text">over by {fmtDays(-b.left)}</span> : <strong>{fmtDays(b.left)}</strong>}
                              <span className="cell-sub">{balanceNote(b)}</span>
                            </td>
                          );
                        })}
                        {may && <td className="row-action"><button type="button" className="link" onClick={() => setAdjust({ id: p.id, name: p.name })}>Adjust</button></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {more}
            <p className="block-note">Yearly allowances and carry forward are set in <Link className="link" to="/settings/hr">HR rules</Link>. The phone shows each person their own balance and refuses a request that would cross it.</p>
          </>
        )}
      {m && <AdjustLeaveDrawer open={Boolean(adjust)} person={adjust} year={year} types={LEAVE_TYPES.filter(t => t !== 'unpaid')} balances={m.balances}
        onClose={() => setAdjust(null)} onDone={msg => { setAdjust(null); setNotice(msg); invalidate('team:leave-balances:', 'team:person:'); }} />}
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </section>
  );
}

const fmtDays = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
/** "of 15, 6 taken off, 2 waiting": the allowance, then what changed it. */
const balanceNote = (b: LeaveBalance) => [
  `of ${fmtDays(b.allowed)}`,
  b.adjusted > 0 && `${fmtDays(b.adjusted)} added`,
  b.adjusted < 0 && `${fmtDays(-b.adjusted)} taken off`,
  b.waiting > 0 && `${fmtDays(b.waiting)} waiting`,
].filter(Boolean).join(', ');

function AdjustLeaveDrawer({ open, person, year, types, balances, onClose, onDone }: {
  open: boolean; person: { id: string; name: string } | null; year: number; types: readonly string[]; balances: LeaveBalance[];
  onClose: () => void; onDone: (m: string) => void;
}) {
  const [type, setType] = useState('casual');
  const [way, setWay] = useState<'add' | 'take'>('add');
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { if (open) { setType('casual'); setWay('add'); setDays(''); setReason(''); setProblem(''); setAttempt(0); } }, [open]);
  const n = Number(days.replace(',', '.'));
  const b = balances.find(x => x.personId === person?.id && x.type === type);
  const errors = {
    days: !(n > 0) || n > 366 || Math.round(n * 2) !== n * 2 ? 'Write the days, in whole or half days.' : undefined,
    reason: reason.trim().length < 5 ? 'Say why; it is kept with the balance and in the audit log.' : undefined,
  };
  const formRef = useFocusFirstError(errors, attempt);
  const signed = way === 'add' ? n : -n;
  const save = async () => {
    setAttempt(a => a + 1);
    if (!person || Object.values(errors).some(Boolean)) return;
    setBusy(true); setProblem('');
    try {
      await adjustLeave({ personId: person.id, type, year, days: signed, reason });
      onDone(`${person.name}'s ${leaveLabel(type).toLowerCase()} for ${year} is ${way === 'add' ? 'up' : 'down'} by ${count(n, 'day')}.`);
    } catch (e) { setProblem(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <Drawer open={open} onClose={onClose} title={`Adjust ${person?.name ?? ''}'s leave`} sub={`For ${year}. An opening balance when they joined mid-year, or a correction; the reason is kept.`}
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save the adjustment'}</button></>}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        <Field label="Leave type">{x => <select {...x} className="input" value={type} onChange={e => setType(e.target.value)}>{types.map(t => <option key={t} value={t}>{leaveLabel(t)}</option>)}</select>}</Field>
        {b && <p className="form-note">Now {b.tracked ? `${fmtDays(b.left)} left, ${balanceNote(b)}` : 'not counted: this type has no yearly allowance'}{b.taken ? `, ${fmtDays(b.taken)} taken` : ''}.</p>}
        <Segmented label="Add or take away" value={way} onChange={setWay} options={[{ value: 'add', label: 'Add days' }, { value: 'take', label: 'Take away days' }]} />
        <Field label="Days" error={attempt ? errors.days : undefined}>{x => <input {...x} className="input" inputMode="decimal" value={days} placeholder="2" onChange={e => setDays(e.target.value)} />}</Field>
        <Field label="Why" error={attempt ? errors.reason : undefined}>{x => <input {...x} className="input" value={reason} placeholder="For example: 6 casual days used before Mr Sales" onChange={e => setReason(e.target.value)} />}</Field>
        {b && n > 0 && <p className="form-note">After this: {fmtDays(b.left + signed)} left, {balanceNote({ ...b, adjusted: b.adjusted + signed })}.</p>}
        {problem && <p className="form-error" role="alert">It was not saved. {problem}</p>}
      </form>
    </Drawer>
  );
}

/**
 * Who is away on a day: the week as a strip, with how many are on leave each
 * day, and the people for the day chosen. Approved leave counts as away;
 * leave still waiting is named as waiting.
 */
function WhoIsAway({ list }: { list: LeaveRow[] }) {
  const today = IST_TODAY();
  const [day, setDay] = useState(today);
  const live = list.filter(l => l.status === 'approved' || l.status === 'pending');
  const on = (k: string) => live.filter(l => l.from <= k && l.to >= k);
  const note = (k: string) => {
    const a = on(k).filter(l => l.status === 'approved').length;
    const w = on(k).length - a;
    return a ? `${a} away` : w ? `${w} asked` : null;
  };
  const here = on(day).sort((a, b) => a.status.localeCompare(b.status) || a.person.localeCompare(b.person));
  return (
    <StripBlock title="Who is away" meta="approved leave, and requests still waiting">
      <DayStrip value={day} onChange={setDay} max={shiftDay(today, 120)} min={shiftDay(today, -365)} note={note} label="Who is away on" />
      {here.length === 0 ? <p className="block-empty away-empty">Nobody is on leave or has asked for {day === today ? 'today' : longDay(day)}.</p> : (
        <ul className="rows away-list">
          {here.map(l => (
            <li key={l.id} className="row">
              <div className="row-main">
                <p className="row-title"><Link className="cell-link" to={`/team/${l.personId}`}>{l.person}</Link></p>
                <p className="row-sub">{leaveLabel(l.type)}, {dayRange(l.from, l.to)}</p>
              </div>
              <span className="row-meta">{l.status === 'approved' ? 'Away' : <Pill>Waiting for a decision</Pill>}</span>
            </li>
          ))}
        </ul>
      )}
    </StripBlock>
  );
}

// ── tasks ─────────────────────────────────────────────────────────────

/** Tasks: work handed to people, with the date it is wanted by. The person ticks it off on the phone. */
export function Tasks() {
  const r = useResource('team:tasks', loadTasks);
  if (r.status === 'error' && !r.data) return <LoadError what="Tasks" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading tasks" lines={1} />;
  return <TasksView data={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function TasksView({ data, at, error, reload }: { data: Awaited<ReturnType<typeof loadTasks>>; at: Date | null; error: string; reload: () => void }) {
  const loc = useLocation();
  const nav = useNavigate();
  const [status, setStatus] = useState<'open' | 'late' | 'done' | 'all'>('open');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(loc.pathname.endsWith('/new'));
  const [notice, setNotice] = useState('');
  const today = IST_TODAY();
  const open = data.tasks.filter(t => t.status === 'open');
  const late = open.filter(t => t.due && t.due < today);
  const done = data.tasks.filter(t => t.status === 'done');
  const rows = data.tasks
    .filter(t => status === 'all' || (status === 'open' ? t.status === 'open' : status === 'late' ? t.status === 'open' && t.due && t.due < today : t.status === 'done'))
    .filter(t => !q.trim() || `${t.title} ${t.person} ${t.client ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
  const close = () => { setAdding(false); if (loc.pathname.endsWith('/new')) nav('/team/tasks', { replace: true }); };
  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read tasks again" />}>
        {data.tasks.length === 0 ? 'No tasks yet.' : <><strong>{count(open.length, 'task')} open</strong>{late.length ? <>, <span className="warn-text">{late.length} past their date</span></> : ''}. {count(done.length, 'task')} done.</>}
      </Summary>
      <Toolbar>
        <button type="button" className="btn btn-primary btn-small" onClick={() => setAdding(true)}><Plus size={14} weight="bold" aria-hidden="true" /> Assign a task</button>
        <SearchBox value={q} onChange={setQ} placeholder="Task, person or client" label="Find a task" />
        <Segmented label="Show" value={status} onChange={setStatus} options={[{ value: 'open', label: 'Open', count: open.length }, { value: 'late', label: 'Past their date', count: late.length }, { value: 'done', label: 'Done', count: done.length }, { value: 'all', label: 'All' }]} />
      </Toolbar>
      {data.tasks.length === 0 ? <Empty title="No tasks yet">Hand someone a piece of work with a date; it reaches their phone and they tick it off there.</Empty> : rows.length === 0 ? <div className="list-empty"><Empty title={q ? 'No task matches' : ({ open: 'No open tasks', late: 'Nothing is past its date', done: 'No task is done yet', all: 'No tasks' } as const)[status]}>{q ? 'Try another word, or another list.' : status === 'open' ? `All ${count(done.length, 'task')} given out ${done.length === 1 ? 'is' : 'are'} done.` : 'The other lists hold the rest.'}</Empty></div> : (
        <Arrive>
          <ul className="rows task-list">
            {rows.map(t => {
              const lateBy = t.due && t.status === 'open' ? daysBetween(t.due, today) : 0;
              return (
                <li key={t.id} className="row">
                  <div className="row-main">
                    <p className="row-title">{t.title}</p>
                    <p className="row-sub"><Link className="cell-link" to={`/team/${t.personId}`}>{t.person}</Link>{t.clientId && t.client ? <> at <Link className="cell-link" to={`/clients/${t.clientId}`}>{t.client}</Link></> : ''} · from {t.by}{t.description ? ` · ${t.description}` : ''}</p>
                  </div>
                  <span className="row-meta">
                    {t.status === 'done' ? <Pill tone="good">Done {t.completedAt ? dayMonth(dayOf(t.completedAt)) : ''}</Pill>
                      : lateBy > 0 ? <Pill tone="warning">{count(lateBy, 'day')} late</Pill>
                      : t.due ? `by ${dayMonth(t.due)}` : 'no date'}
                  </span>
                </li>
              );
            })}
          </ul>
        </Arrive>
      )}
      <TaskDrawer open={adding} people={data.people} clients={data.clients} onClose={close} onDone={m => { close(); setNotice(m); invalidate('team:tasks'); }} />
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

function TaskDrawer({ open, people, clients, onClose, onDone }: { open: boolean; people: { id: string; name: string; hq: string }[]; clients: TaskClient[]; onClose: () => void; onDone: (m: string) => void }) {
  const today = IST_TODAY();
  const [who, setWho] = useState('');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [due, setDue] = useState(shiftDay(today, 3));
  const [client, setClient] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { if (open) { setWho(''); setTitle(''); setDetails(''); setDue(shiftDay(today, 3)); setClient(''); setProblem(''); setAttempt(0); } }, [open, today]);
  // The clients this person calls on: the work a task sends them to.
  const theirs = clients.filter(c => c.ownerId === who);
  const errors = { who: !who ? 'Choose who does it.' : undefined, title: title.trim().length < 3 ? 'Say what has to be done.' : undefined, due: due && due < today ? 'The date cannot be in the past.' : undefined };
  const formRef = useFocusFirstError(errors, attempt);
  const save = async () => {
    setAttempt(a => a + 1);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setProblem('');
    try {
      await assignTask(who, title.trim(), details.trim(), due || null, client || null);
      onDone(`The task is on ${people.find(p => p.id === who)?.name ?? 'their'}'s phone.`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} title="Assign a task" sub="One piece of work, one person, a date. It reaches their phone at once."
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Assigning…' : 'Assign the task'}</button></>}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        <Field label="Who" error={attempt ? errors.who : undefined}>{x => <select {...x} className="input" value={who} onChange={e => { setWho(e.target.value); setClient(''); }}><option value="">Choose a person</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}{p.hq ? ` · ${p.hq}` : ''}</option>)}</select>}</Field>
        <Field label="What" error={attempt ? errors.title : undefined}>{x => <input {...x} className="input" value={title} placeholder="Collect the CME attendance list from Care Hospital" onChange={e => setTitle(e.target.value)} />}</Field>
        <Field label="At a client" optional help={!who ? 'Choose who does it first; their clients appear here.' : theirs.length ? 'They see the client on the task and open its record from it.' : 'Nobody is on their client list yet.'}>{x => (
          <select {...x} className="input" value={client} disabled={!who || !theirs.length} onChange={e => setClient(e.target.value)}>
            <option value="">No client</option>
            {theirs.map(c => <option key={c.id} value={c.id}>{c.name}{c.place ? ` · ${c.place}` : ''}</option>)}
          </select>
        )}</Field>
        <Field label="Details" optional>{x => <textarea {...x} className="input textarea" rows={3} value={details} onChange={e => setDetails(e.target.value)} />}</Field>
        <Field label="Wanted by" optional error={attempt ? errors.due : undefined}>{x => <input {...x} type="date" className="input" min={today} value={due} onChange={e => setDue(e.target.value)} />}</Field>
        {problem && <p className="form-error" role="alert">That was not assigned. {problem}</p>}
      </form>
    </Drawer>
  );
}
