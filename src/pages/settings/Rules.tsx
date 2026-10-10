import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Plus } from '@phosphor-icons/react';
import { invalidate, useResource } from '../../data/resource';
import {
  loadAudit, loadHolidays, loadRules, mayManageHolidays, saveHoliday, saveLeavePolicy, saveRules,
  type AuditRow, type Holiday, type LeavePolicy, type Rules,
} from '../../live/settings';
import { leaveLabel } from '../../live/team';
import { IST_TODAY, ago, dayMonth, dayOf, timeOf, weekdayOf } from '../../lib/days';
import { count, rupees } from '../../lib/format';
import { Confirm, Drawer, Field, Filter, Notice, SearchBox, Summary, Toolbar, useFocusFirstError, useShowMore } from '../../components/kit';
import { Segmented } from '../../components/Segmented';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useMe } from '../../live/session';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LEAVE_TYPES = ['casual', 'sick', 'earned', 'compensatory', 'unpaid'];
const POLICY: Record<Rules['policy'], { word: string; about: string }> = {
  off: { word: 'Off', about: 'Visits are not checked against the client\'s location.' },
  warn: { word: 'Warn', about: 'A visit outside the radius is saved, and marked for the manager to look at.' },
  block: { word: 'Block', about: 'A visit cannot be saved outside the radius; the phone says so.' },
};

// ── company rules ─────────────────────────────────────────────────────

/** Company rules: what the phone applies to everyone, said as sentences and changed in one place. */
export function CompanyRules() {
  const r = useResource<Rules>('settings:rules', loadRules);
  if (r.status === 'error' && !r.data) return <LoadError what="The company rules" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading the company rules" lines={1} />;
  return <RulesForm rules={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function RulesForm({ rules, at, error, reload }: { rules: Rules; at: Date | null; error: string; reload: () => void }) {
  const me = useMe();
  const may = ['owner', 'admin'].includes(me.role);
  const [f, setF] = useState({ allowance: String(rules.allowance), billAbove: String(rules.billAbove), weekOff: String(rules.weekOff), policy: rules.policy, radius: String(rules.radius), offline: rules.offlineVisits ? 'allowed' : 'online' });
  const [attempt, setAttempt] = useState(0);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { setF({ allowance: String(rules.allowance), billAbove: String(rules.billAbove), weekOff: String(rules.weekOff), policy: rules.policy, radius: String(rules.radius), offline: rules.offlineVisits ? 'allowed' : 'online' }); }, [rules]);
  const num = (v: string) => Number(v.replace(/[₹,\s]/g, ''));
  const errors = {
    allowance: !(num(f.allowance) >= 0) || f.allowance.trim() === '' ? 'Write the allowance in rupees; 0 if there is none.' : undefined,
    billAbove: !(num(f.billAbove) >= 0) || f.billAbove.trim() === '' ? 'Write an amount in rupees.' : undefined,
    radius: !(num(f.radius) >= 10 && num(f.radius) <= 5000) ? 'Between 10 and 5000 metres.' : undefined,
  };
  const formRef = useFocusFirstError(errors, attempt);
  const next: Rules = { allowance: num(f.allowance), billAbove: num(f.billAbove), weekOff: Number(f.weekOff), policy: f.policy, radius: num(f.radius), offlineVisits: f.offline === 'allowed', updatedAt: rules.updatedAt };
  const changes = [
    next.allowance !== rules.allowance && `Daily allowance: ${rupees(rules.allowance)} to ${rupees(next.allowance)}.`,
    next.billAbove !== rules.billAbove && `A bill is needed above ${rupees(next.billAbove)}, not ${rupees(rules.billAbove)}.`,
    next.weekOff !== rules.weekOff && `The week off moves from ${WEEKDAYS[rules.weekOff]} to ${WEEKDAYS[next.weekOff]}.`,
    next.policy !== rules.policy && `Visit check: ${POLICY[rules.policy].word.toLowerCase()} to ${POLICY[next.policy].word.toLowerCase()}.`,
    next.radius !== rules.radius && `The visit radius: ${rules.radius} m to ${next.radius} m.`,
    next.offlineVisits !== rules.offlineVisits && (next.offlineVisits ? 'Visits may be completed with no connection and sent later.' : 'A visit needs a connection to be completed.'),
  ].filter(Boolean) as string[];
  const save = async () => {
    setBusy(true);
    setProblem('');
    try {
      await saveRules(next);
      setReview(false);
      setNotice('The rules are saved. Phones pick them up the next time they sync.');
      invalidate('settings:rules', 'money:', 'field:', 'home:', 'team:attendance');
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const set = (k: keyof typeof f, v: string) => setF(x => ({ ...x, [k]: v }));
  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read the rules again" />}>
        The daily allowance is <strong>{rupees(rules.allowance)}</strong>, a bill is needed above <strong>{rupees(rules.billAbove)}</strong>, the week off is <strong>{WEEKDAYS[rules.weekOff]}</strong>, and visits are {rules.policy === 'off' ? 'not checked' : <>checked within <strong>{rules.radius} m</strong> of the client{rules.policy === 'block' ? ', strictly' : ''}</>}.
      </Summary>
      {!may && <p className="form-note rules-readonly">Only an owner or admin changes these rules. They are shown here so everyone reads the same ones.</p>}
      <Arrive>
        <form ref={formRef} className="form rules-form" noValidate onSubmit={e => { e.preventDefault(); setAttempt(a => a + 1); if (!Object.values(errors).some(Boolean) && changes.length) setReview(true); }}>
          <fieldset className="add-group" disabled={!may}>
            <legend className="section-title">Money</legend>
            <div className="form-row">
              <Field label="Daily allowance" help="Paid for each day worked; the claim starts from it." error={attempt ? errors.allowance : undefined}>{x => <input {...x} className="input" inputMode="numeric" value={f.allowance} onChange={e => set('allowance', e.target.value)} />}</Field>
              <Field label="A bill is needed above" help="A day claimed above this without a bill is flagged." error={attempt ? errors.billAbove : undefined}>{x => <input {...x} className="input" inputMode="numeric" value={f.billAbove} onChange={e => set('billAbove', e.target.value)} />}</Field>
            </div>
          </fieldset>
          <fieldset className="add-group" disabled={!may}>
            <legend className="section-title">The working week</legend>
            <Field label="Week off" help="Attendance, claims and coverage leave this day out.">{x => (
              <select {...x} className="input" value={f.weekOff} onChange={e => set('weekOff', e.target.value)}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
            )}</Field>
          </fieldset>
          <fieldset className="add-group" disabled={!may}>
            <legend className="section-title">Visit checks</legend>
            <div className="field-block">
              <p className="form-label" id="policy-label">When a visit is logged away from the client</p>
              <Segmented label="When a visit is logged away from the client" value={f.policy} onChange={v => set('policy', v)} options={(['off', 'warn', 'block'] as const).map(p => ({ value: p, label: POLICY[p].word, disabled: !may }))} />
              <p className="form-help">{POLICY[f.policy].about}</p>
            </div>
            {f.policy !== 'off' && <Field label="Radius around the client, in metres" help="Between 10 and 5000. 50 suits a city; a village spread out may need 200." error={attempt ? errors.radius : undefined}>{x => <input {...x} className="input" inputMode="numeric" value={f.radius} onChange={e => set('radius', e.target.value)} />}</Field>}
            <div className="field-block">
              <p className="form-label">With no connection at the client</p>
              <Segmented label="With no connection at the client" value={f.offline} onChange={v => set('offline', v)} options={[{ value: 'allowed', label: 'Save and send later', disabled: !may }, { value: 'online', label: 'Needs a connection', disabled: !may }]} />
              <p className="form-help">{f.offline === 'allowed'
                ? 'The phone keeps the visit and sends it when the signal returns. It keeps the time it happened, and the visit shows how late it arrived.'
                : 'A visit can only be completed where the phone has a connection. One that reaches the server more than 15 minutes after its location was taken is refused.'}</p>
            </div>
          </fieldset>
          {may && (
            <div className="add-actions">
              <span className="form-help">{changes.length ? count(changes.length, 'change') + ' not saved yet.' : 'Nothing changed.'}</span>
              <button type="submit" className="btn btn-primary" disabled={!changes.length}>Review and save</button>
            </div>
          )}
        </form>
      </Arrive>
      <Confirm open={review} title="Save these rules?" confirmLabel="Save the rules" busy={busy} error={problem} onCancel={() => setReview(false)} onConfirm={() => void save()}>
        <span className="consequences-text">{changes.join(' ')} They apply from now on to every phone; claims already sent keep the rules they were sent under.</span>
      </Confirm>
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

// ── HR rules ──────────────────────────────────────────────────────────

/** HR rules: the company's holidays, and the leave types in use. */
export function HrRules() {
  const r = useResource('settings:holidays', loadHolidays);
  if (r.status === 'error' && !r.data) return <LoadError what="The HR rules" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading the HR rules" lines={1} />;
  return <HrView data={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function HrView({ data, at, error, reload }: { data: Awaited<ReturnType<typeof loadHolidays>>; at: Date | null; error: string; reload: () => void }) {
  const me = useMe();
  const loc = useLocation();
  const nav = useNavigate();
  const mayHoliday = mayManageHolidays(me.role);
  const mayLeave = ['owner', 'admin', 'hr'].includes(me.role);
  const today = IST_TODAY();
  const years = [...new Set([today.slice(0, 4), String(Number(today.slice(0, 4)) + 1), ...data.holidays.map(h => h.date.slice(0, 4))])].sort().reverse();
  const [year, setYear] = useState(today.slice(0, 4));
  const [edit, setEdit] = useState<Holiday | 'new' | null>(loc.pathname.endsWith('/holiday') ? 'new' : null);
  const [leave, setLeave] = useState<LeavePolicy | null>(null);
  const [notice, setNotice] = useState('');
  const list = data.holidays.filter(h => h.date.startsWith(year));
  const nextOne = data.holidays.find(h => h.date >= today);
  const leavePolicies = LEAVE_TYPES.map(t => data.leavePolicies.find(p => p.type === t) ?? { type: t, annual: 0, carry: 0, approval: true, paid: t !== 'unpaid', updatedAt: null });
  const close = () => { setEdit(null); if (loc.pathname.endsWith('/holiday')) nav('/settings/hr', { replace: true }); };
  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read the HR rules again" />}>
        <strong>{count(list.length, 'holiday')} in {year}.</strong> {nextOne ? `The next is ${nextOne.name}, ${WEEKDAYS[weekdayOf(nextOne.date)]} ${dayMonth(nextOne.date)}.` : 'None are left this year.'}
      </Summary>
      <Toolbar>
        {mayHoliday && <button type="button" className="btn btn-primary btn-small" onClick={() => setEdit('new')}><Plus size={14} weight="bold" aria-hidden="true" /> Declare a holiday</button>}
        <Filter label="Year" value={year} onChange={setYear} options={years.map(y => ({ value: y, label: y }))} />
      </Toolbar>
      <Arrive className="hr-layout">
        <section>
          <h2 className="fig-title">Company holidays</h2>
          {list.length === 0 ? <p className="block-empty">No holidays declared for {year}. A holiday counts like the week off: nobody is expected in the field, and attendance says why.</p> : (
            <ul className="rows hr-list">
              {list.map(h => (
                <li key={h.id} className={`row${h.date < today ? ' past' : ''}`}>
                  <div className="row-main"><p className="row-title">{h.name}</p><p className="row-sub">{WEEKDAYS[weekdayOf(h.date)]}, {dayMonth(h.date)}{h.date < today ? ', gone by' : ''}</p></div>
                  {mayHoliday && <span className="row-actions"><button type="button" className="link" onClick={() => setEdit(h)}>Rename</button></span>}
                </li>
              ))}
            </ul>
          )}
          {!mayHoliday && <p className="block-note">Only an owner, admin or HR declares holidays, as the database allows.</p>}
        </section>
        <section>
          <h2 className="fig-title">Leave policy</h2>
          <div className="table-wrap">
            <table className="table compact-table">
              <thead><tr><th scope="col">Type</th><th scope="col" className="num">Year</th><th scope="col" className="num">Carry</th><th scope="col">Rule</th>{mayLeave && <th scope="col"><span className="visually-hidden">Edit</span></th>}</tr></thead>
              <tbody>{leavePolicies.map(p => <tr key={p.type}><th scope="row">{leaveLabel(p.type)}<span className="cell-sub">{data.leaveTypes.find(t => t.type === p.type)?.requests ? count(data.leaveTypes.find(t => t.type === p.type)!.requests, 'request') : 'not used yet'}</span></th><td className="num">{p.annual}</td><td className="num">{p.carry}</td><td>{p.paid ? 'Paid' : 'Unpaid'}{p.approval ? <span className="cell-sub">approval needed</span> : <span className="cell-sub">auto-approved</span>}</td>{mayLeave && <td className="row-action"><button type="button" className="link" onClick={() => setLeave(p)}>Edit</button></td>}</tr>)}</tbody>
            </table>
          </div>
        </section>
        <p className="block-note hr-pay-note">Salary components, role structures and each role's expense allowance are in <Link className="link" to="/settings/pay">Pay and expenses</Link>.</p>
      </Arrive>
      <HolidayDrawer open={edit != null} holiday={edit === 'new' ? null : edit} taken={data.holidays} onClose={close} onDone={m => { close(); setNotice(m); invalidate('settings:holidays', 'team:attendance', 'money:', 'field:'); }} />
      <LeavePolicyDrawer open={Boolean(leave)} policy={leave} onClose={() => setLeave(null)} onDone={m => { setLeave(null); setNotice(m); invalidate('settings:holidays', 'team:leave', 'team:attendance'); }} />
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

function HolidayDrawer({ open, holiday, taken, onClose, onDone }: { open: boolean; holiday: Holiday | null; taken: Holiday[]; onClose: () => void; onDone: (m: string) => void }) {
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { if (open) { setDate(holiday?.date ?? ''); setName(holiday?.name ?? ''); setProblem(''); setAttempt(0); } }, [open, holiday]);
  const clash = !holiday && taken.find(h => h.date === date);
  const errors = { date: !date ? 'Choose the date.' : undefined, name: name.trim().length < 2 ? 'Name the holiday.' : undefined };
  const formRef = useFocusFirstError(errors, attempt);
  const save = async () => {
    setAttempt(a => a + 1);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setProblem('');
    try {
      await saveHoliday(date, name);
      onDone(holiday ? `Renamed to ${name.trim()}.` : `${name.trim()} on ${dayMonth(date)} is a company holiday; every phone and attendance count it.`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} title={holiday ? `Rename ${holiday.name}` : 'Declare a holiday'} sub={holiday ? `${WEEKDAYS[weekdayOf(holiday.date)]}, ${dayMonth(holiday.date)}` : 'Nobody is expected in the field that day.'}
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : holiday ? 'Rename it' : 'Declare the holiday'}</button></>}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        {!holiday && <Field label="Date" error={attempt ? errors.date : undefined}>{x => <input {...x} type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />}</Field>}
        <Field label="Name" error={attempt ? errors.name : undefined}>{x => <input {...x} className="input" value={name} placeholder="Diwali" onChange={e => setName(e.target.value)} />}</Field>
        {clash && <p className="form-note">{dayMonth(date)} is already {clash.name}; saving renames it.</p>}
        {problem && <p className="form-error" role="alert">It was not saved. {problem}</p>}
      </form>
    </Drawer>
  );
}

function LeavePolicyDrawer({ open, policy, onClose, onDone }: { open: boolean; policy: LeavePolicy | null; onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState({ annual: '', carry: '', approval: true, paid: true });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { if (open && policy) { setF({ annual: String(policy.annual), carry: String(policy.carry), approval: policy.approval, paid: policy.paid }); setProblem(''); setAttempt(0); } }, [open, policy]);
  const num = (v: string) => Number(v.replace(/[,\s]/g, ''));
  const errors = { annual: !(num(f.annual) >= 0) || f.annual.trim() === '' ? 'Write days for a year; 0 if this type has no fixed balance.' : undefined, carry: !(num(f.carry) >= 0) || f.carry.trim() === '' ? 'Write carry-forward days; 0 if none carry.' : undefined };
  const formRef = useFocusFirstError(errors, attempt);
  const save = async () => {
    if (!policy) return;
    setAttempt(a => a + 1);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setProblem('');
    try {
      await saveLeavePolicy({ ...policy, annual: num(f.annual), carry: num(f.carry), approval: f.approval, paid: f.paid });
      onDone(`${leaveLabel(policy.type)} leave policy is saved.`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} title={policy ? `${leaveLabel(policy.type)} leave` : 'Leave policy'} sub="The phone applies this before a request is sent."
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save policy'}</button></>}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        <div className="form-row">
          <Field label="Days in a year" error={attempt ? errors.annual : undefined}>{x => <input {...x} className="input" inputMode="decimal" value={f.annual} onChange={e => setF(v => ({ ...v, annual: e.target.value }))} />}</Field>
          <Field label="Carry-forward days" error={attempt ? errors.carry : undefined}>{x => <input {...x} className="input" inputMode="decimal" value={f.carry} onChange={e => setF(v => ({ ...v, carry: e.target.value }))} />}</Field>
        </div>
        <label className="check-line"><input type="checkbox" checked={f.approval} onChange={e => setF(v => ({ ...v, approval: e.target.checked }))} /> Approval is needed</label>
        <label className="check-line"><input type="checkbox" checked={f.paid} onChange={e => setF(v => ({ ...v, paid: e.target.checked }))} /> Counts as paid leave</label>
        {problem && <p className="form-error" role="alert">It was not saved. {problem}</p>}
      </form>
    </Drawer>
  );
}

// ── field ownership ───────────────────────────────────────────────────

const OWNERSHIP: { group: string; about: string; rows: [string, string][] }[] = [
  { group: 'Theirs to keep current, on the phone', about: 'Edited by the person, with no approval.', rows: [
    ['Mobile number', 'The number the app signs in with and the one a manager rings. Out of date, it is worse than blank.'],
    ['Alternate number', 'Reached when the first is out of coverage, which in this job it will be.'],
    ['Address', 'Theirs, and nothing downstream reads it.'],
    ['Photo', 'Appears on their own ID card and nowhere that matters.'],
    ['Emergency contact', 'The one field where a stale value has a real cost and only they can keep it current.'],
    ['Blood group', 'Printed on the ID card. Field staff travel alone.'],
  ] },
  { group: 'Theirs to propose, signed off here', about: 'Proposed by the person, approved by HR.', rows: [
    ['Legal name', 'Appears on the payslip and the appointment letter, so a change needs the same signature those did.'],
    ['Bank account', 'Money moves to it. A self-service change to a payment destination is how payroll fraud starts.'],
  ] },
  { group: 'Set here, and nowhere else', about: 'Changed only by the office.', rows: [
    ['Employee ID', 'The key every exported sheet and every report joins on.'],
    ['Role', 'Decides the daily allowance and what the phone offers.'],
    ['Territory, HQ and areas', 'Decides which clients exist for them and where the allowance is measured from.'],
    ['Reporting manager', 'Decides who approves their leave, their month and their money.'],
    ['Joining date', 'Leave and every length-of-service figure hang off it.'],
    ['Salary', 'What they are paid.'],
    ['Active status', 'Whether the login works at all.'],
  ] },
];

/** Field ownership: who may change each detail on a person's record, and why. A reference, not a switchboard. */
export function Ownership() {
  return (
    <div className="page-body">
      <Summary>One rule, field by field: if changing it changes what someone can see, what they are paid, or who signs off on them, the office owns it.</Summary>
      <p className="form-note own-note"><strong>When this was last checked, the phone had no profile screen</strong>, so nobody could change their own details there and the first six below go stale. Until it has one, the office changes them on the person's record.</p>
      <Arrive className="own-groups">
        {OWNERSHIP.map(g => (
          <section key={g.group}>
            <div className="block-head"><h2 className="section-title">{g.group}</h2><span className="block-meta">{g.about}</span></div>
            <dl className="own-list">{g.rows.map(([f, why]) => <div key={f}><dt>{f}</dt><dd>{why}</dd></div>)}</dl>
          </section>
        ))}
      </Arrive>
    </div>
  );
}

// ── audit log ─────────────────────────────────────────────────────────

/** The audit log: every change made in the console, newest first. Nobody can edit or delete it, the owner included. */
export function AuditLog() {
  const [days, setDays] = useState('30');
  const r = useResource<AuditRow[]>(`settings:audit:${days}`, () => loadAudit(Number(days)));
  return (
    <div className="page-body">
      <Toolbar>
        <Filter label="Period" value={days} onChange={setDays} options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }, { value: '365', label: 'Last year' }]} />
        <span className="toolbar-end"><Freshness at={r.at} error={r.error} reload={() => void r.reload()} label="Read the audit log again" /></span>
      </Toolbar>
      {r.status === 'error' && !r.data ? <LoadError what="The audit log" error={r.error} retry={() => void r.reload()} />
        : !r.data ? <Loading label="Reading the audit log" lines={1} />
        : <AuditView list={r.data} days={Number(days)} />}
    </div>
  );
}

function AuditView({ list, days }: { list: AuditRow[]; days: number }) {
  const [who, setWho] = useState('all');
  const [q, setQ] = useState('');
  const people = [...new Set(list.map(a => a.who))].sort();
  const rows = useMemo(() => list.filter(a => who === 'all' || a.who === who).filter(a => !q.trim() || `${a.action} ${a.label} ${a.entity} ${a.reason ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())), [list, who, q]);
  const { shown, more } = useShowMore(rows, 50);
  return (
    <Arrive>
      <Summary>{list.length ? <><strong>{count(list.length, 'change')}</strong> by {count(people.length, 'person', 'people')} in the last {days} days. The log is kept for ever; nobody can edit or delete it.</> : `No changes in the last ${days} days.`}</Summary>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="What changed, or on what" label="Find a change" />
        <Filter label="Who" value={who} onChange={setWho} options={[{ value: 'all', label: 'Anyone' }, ...people.map(p => ({ value: p, label: p }))]} />
      </Toolbar>
      {list.length === 0 ? <Empty title="Nothing changed in this period">Every change made in the console is written here: who, what, from what to what, and why.</Empty>
        : rows.length === 0 ? <div className="list-empty"><Empty title="Nothing matches">Try another person or words.</Empty></div> : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">What</th><th scope="col" className="hide-narrow">Change</th></tr></thead>
                <tbody>
                  {shown.map(a => (
                    <tr key={a.id}>
                      <td className="nowrap">{dayMonth(dayOf(a.at))}<span className="cell-sub">{timeOf(a.at)}, {ago(a.at)}</span></td>
                      <td>{a.who}</td>
                      <th scope="row">{a.action.replace(/^./, x => x.toUpperCase())}{a.label && <>: <strong>{a.label}</strong></>}{a.reason && <span className="cell-sub">“{a.reason}”</span>}</th>
                      <td className="hide-narrow">{a.before || a.after ? <span className="audit-change">{a.before ?? 'nothing'} to {a.after ?? 'nothing'}</span> : <span className="cell-quiet">{a.entity}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {more}
          </>
        )}
    </Arrive>
  );
}
