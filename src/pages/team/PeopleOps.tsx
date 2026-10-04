import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Plus } from '@phosphor-icons/react';
import { invalidate, useResource } from '../../data/resource';
import { assignTask, decideLeave, leaveLabel, loadAttendance, loadLeave, loadTasks, type AttendanceModel, type LeaveRow } from '../../live/team';
import { approvalsStore } from '../../data/approvals';
import { IST_TODAY, ago, dayMonth, dayRange, dayOf, daysBetween, longDay, shiftDay, timeOf, weekdayOf } from '../../lib/days';
import { count } from '../../lib/format';
import { Confirm, Drawer, Field, Filter, Notice, Pill, SearchBox, Summary, Toolbar, useFocusFirstError, useShowMore } from '../../components/kit';
import { Segmented } from '../../components/Segmented';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useCan } from '../../app/access';
import { monthName } from '../../live/sales';

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
  const months = Array.from({ length: 6 }, (_, i) => { const [y, m] = today.split('-').map(Number); const d = new Date(y, m - 1 - i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  return (
    <div className="page-body">
      <Toolbar>
        <Filter label="Month" value={month} onChange={setMonth} options={months.map(k => ({ value: k, label: `${monthName(k)} ${k.slice(0, 4)}` }))} />
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
                      return <td key={k} className="att-td"><span className={`att-cell s-${a?.letter ?? 'x'}`} title={`${dayMonth(k)}: ${why}`} aria-label={`${dayMonth(k)}: ${why}`}>{a?.letter ?? ''}</span></td>;
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

const LEAVE_STATUS: Record<string, { word: string; tone: 'good' | 'accent' | 'neutral' }> = { approved: { word: 'Approved', tone: 'good' }, pending: { word: 'Waiting for a decision', tone: 'accent' }, rejected: { word: 'Not approved', tone: 'neutral' }, cancelled: { word: 'Withdrawn', tone: 'neutral' } };

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
  const by = (s: string) => list.filter(l => l.status === s).length;
  const away = list.filter(l => l.status === 'approved' && l.from <= shiftDay(today, 7) && l.to >= today);
  const types = [...new Set(list.map(l => l.type))];
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
      setNotice(`${ask.l.person}'s leave is ${ask.approve ? 'approved' : 'not approved'}; they get a message.`);
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
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Find a person" label="Find a person" />
        <Segmented label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All', count: list.length }, { value: 'pending', label: 'Waiting', count: by('pending') }, { value: 'approved', label: 'Approved', count: by('approved') }, { value: 'rejected', label: 'Not approved', count: by('rejected') }]} />
      </Toolbar>
      {list.length === 0 ? <Empty title="No leave applied for">People apply for leave on the phone; their requests appear here with the decision.</Empty> : rows.length === 0 ? <div className="list-empty"><Empty title="Nothing matches">Try another status or name.</Empty></div> : (
        <Arrive>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Person</th><th scope="col">Leave</th><th scope="col">Dates</th><th scope="col" className="num hide-narrow">Days</th><th scope="col">Status</th>{allowed('approvals') && <th scope="col"><span className="visually-hidden">Decide</span></th>}</tr></thead>
              <tbody>
                {shown.map(l => (
                  <tr key={l.id}>
                    <th scope="row"><Link className="cell-link" to={`/team/${l.personId}`}>{l.person}</Link><span className="cell-sub">{l.reason}</span></th>
                    <td className="leave-type">{leaveLabel(l.type)}</td>
                    <td>{dayRange(l.from, l.to)}<span className="cell-sub">applied {ago(l.appliedAt)}</span></td>
                    <td className="num hide-narrow">{l.days}</td>
                    <td><Pill tone={(LEAVE_STATUS[l.status] ?? { tone: 'neutral' }).tone}>{(LEAVE_STATUS[l.status] ?? { word: l.status }).word}</Pill>{l.decidedBy && <span className="cell-sub">by {l.decidedBy}{l.decisionReason ? `: “${l.decisionReason}”` : ''}</span>}</td>
                    {allowed('approvals') && <td className="row-action">{l.status === 'pending' && <><button type="button" className="link" onClick={() => setAsk({ l, approve: false })}>Decline</button>{' '}<button type="button" className="link strong-link" onClick={() => setAsk({ l, approve: true })}>Approve</button></>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {more}
        </Arrive>
      )}
      <section className="block leave-rules">
        <div className="block-head"><h2 className="section-title">Leave types in use</h2><span className="block-meta">from the requests on record</span></div>
        {types.length === 0 ? <p className="block-empty">No leave type has been used yet.</p> : <ul className="tag-list">{types.map(t => <li key={t}><span>{leaveLabel(t)}</span></li>)}</ul>}
        <p className="block-note">Leave balances and yearly allowances are not stored in the database yet, so none are shown or enforced here. The phone offers the types and a manager decides each request.</p>
      </section>
      <Confirm open={Boolean(ask)} title={ask ? `${ask.approve ? 'Approve' : 'Decline'} ${ask.l.person}'s leave?` : ''} confirmLabel={ask?.approve ? 'Approve the leave' : 'Decline the leave'} busy={busy} error={problem}
        reason={ask && !ask.approve ? { label: 'Why it is declined', required: true, placeholder: 'For example: please pick other dates; the team is short that week.' } : undefined}
        onCancel={() => setAsk(null)} onConfirm={reason => void decide(reason)}>
        {ask && `${leaveLabel(ask.l.type)}, ${count(ask.l.days, 'day')}: ${dayRange(ask.l.from, ask.l.to)}. ${ask.l.person} gets a message${ask.approve ? '.' : ' with your reason.'}`}
      </Confirm>
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
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
    .filter(t => !q.trim() || `${t.title} ${t.person}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
  const close = () => { setAdding(false); if (loc.pathname.endsWith('/new')) nav('/team/tasks', { replace: true }); };
  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read tasks again" />}>
        {data.tasks.length === 0 ? 'No tasks yet.' : <><strong>{count(open.length, 'task')} open</strong>{late.length ? <>, <span className="warn-text">{late.length} past their date</span></> : ''}. {count(done.length, 'task')} done.</>}
      </Summary>
      <Toolbar>
        <button type="button" className="btn btn-primary btn-small" onClick={() => setAdding(true)}><Plus size={14} weight="bold" aria-hidden="true" /> Assign a task</button>
        <SearchBox value={q} onChange={setQ} placeholder="Task or person" label="Find a task" />
        <Segmented label="Show" value={status} onChange={setStatus} options={[{ value: 'open', label: 'Open', count: open.length }, { value: 'late', label: 'Past their date', count: late.length }, { value: 'done', label: 'Done', count: done.length }, { value: 'all', label: 'All' }]} />
      </Toolbar>
      {data.tasks.length === 0 ? <Empty title="No tasks yet">Hand someone a piece of work with a date; it reaches their phone and they tick it off there.</Empty> : rows.length === 0 ? <div className="list-empty"><Empty title="Nothing here">No task matches.</Empty></div> : (
        <Arrive>
          <ul className="rows task-list">
            {rows.map(t => {
              const lateBy = t.due && t.status === 'open' ? daysBetween(t.due, today) : 0;
              return (
                <li key={t.id} className="row">
                  <div className="row-main">
                    <p className="row-title">{t.title}</p>
                    <p className="row-sub"><Link className="cell-link" to={`/team/${t.personId}`}>{t.person}</Link> · from {t.by}{t.description ? ` · ${t.description}` : ''}</p>
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
      <TaskDrawer open={adding} people={data.people} onClose={close} onDone={m => { close(); setNotice(m); invalidate('team:tasks'); }} />
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

function TaskDrawer({ open, people, onClose, onDone }: { open: boolean; people: { id: string; name: string; hq: string }[]; onClose: () => void; onDone: (m: string) => void }) {
  const today = IST_TODAY();
  const [who, setWho] = useState('');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [due, setDue] = useState(shiftDay(today, 3));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { if (open) { setWho(''); setTitle(''); setDetails(''); setDue(shiftDay(today, 3)); setProblem(''); setAttempt(0); } }, [open, today]);
  const errors = { who: !who ? 'Choose who does it.' : undefined, title: title.trim().length < 3 ? 'Say what has to be done.' : undefined, due: due && due < today ? 'The date cannot be in the past.' : undefined };
  const formRef = useFocusFirstError(errors, attempt);
  const save = async () => {
    setAttempt(a => a + 1);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setProblem('');
    try {
      await assignTask(who, title.trim(), details.trim(), due || null);
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
        <Field label="Who" error={attempt ? errors.who : undefined}>{x => <select {...x} className="input" value={who} onChange={e => setWho(e.target.value)}><option value="">Choose a person</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}{p.hq ? ` · ${p.hq}` : ''}</option>)}</select>}</Field>
        <Field label="What" error={attempt ? errors.title : undefined}>{x => <input {...x} className="input" value={title} placeholder="Collect the CME attendance list from Care Hospital" onChange={e => setTitle(e.target.value)} />}</Field>
        <Field label="Details" optional>{x => <textarea {...x} className="input textarea" rows={3} value={details} onChange={e => setDetails(e.target.value)} />}</Field>
        <Field label="Wanted by" optional error={attempt ? errors.due : undefined}>{x => <input {...x} type="date" className="input" min={today} value={due} onChange={e => setDue(e.target.value)} />}</Field>
        {problem && <p className="form-error" role="alert">That was not assigned. {problem}</p>}
      </form>
    </Drawer>
  );
}
