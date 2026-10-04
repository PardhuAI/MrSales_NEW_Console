import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';
import { invalidate, useResource } from '../../data/resource';
import {
  DOCUMENT_ACCEPT, DOCUMENT_CATEGORIES, changeManager, documentProblem, documentUrl, handOverClients, leaveLabel, loadPersonRecord, loadRoster,
  removeDocument, setPersonStatus, updatePerson, uploadDocument, type Person, type PersonRecord as Rec, type RosterModel,
} from '../../live/team';
import { ORDER_STATUS } from '../sales/Orders';
import { IST_TODAY, ago, dayMonth, dayOf, dayRange, daysBetween, longDay, shiftDay, timeOf } from '../../lib/days';
import { count, percent, rupees, rupeesShort } from '../../lib/format';
import { Confirm, Drawer, Field, Filter, Notice, Pill, useFocusFirstError } from '../../components/kit';
import { MonthBars } from '../../components/charts';
import { Empty, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useMe } from '../../live/session';
import { useCan } from '../../app/access';
import { mayManagePeople } from './People';
import { monthName } from '../../live/sales';
import { typeLabel } from '../../live/clients';
import { VERDICT } from '../../live/field';

/**
 * One person: who they are, how their month is going, and everything on
 * their record, grouped the way an official asks about it. Changing their
 * manager, handing over their clients and marking them as left start here.
 */

type Tab = 'month' | 'field' | 'sales' | 'hr' | 'changes';

export function PersonRecordPage() {
  const { id = '' } = useParams();
  const roster = useResource<RosterModel>('team:roster', loadRoster);
  const rec = useResource<Rec>(`team:person:${id}`, () => loadPersonRecord(id));
  if ((roster.status === 'error' && !roster.data) || (rec.status === 'error' && !rec.data)) {
    return <LoadError what="This person's record" error={roster.error || rec.error} retry={() => { void roster.reload(); void rec.reload(); }} />;
  }
  if (!roster.data || !rec.data) return <Loading label="Reading the record" />;
  const p = roster.data.people.find(x => x.id === id);
  if (!p) return <Empty title="No such person">The link may be out of date, or they report outside the people you can see. <Link className="link" to="/team">Back to people</Link></Empty>;
  return <View p={p} m={roster.data} r={rec.data} />;
}

function View({ p, m, r }: { p: Person; m: RosterModel; r: Rec }) {
  const me = useMe();
  const allowed = useCan();
  const [tab, setTab] = useState<Tab>('month');
  const [act, setAct] = useState<null | 'edit' | 'manager' | 'handover' | 'left' | 'reopen'>(null);
  const [notice, setNotice] = useState('');
  const may = mayManagePeople(me.role);
  const today = IST_TODAY();
  const tabs: { id: Tab; label: string }[] = [
    { id: 'month', label: 'The month' },
    { id: 'field', label: 'Field work' },
    ...(allowed('sales') || allowed('orders') ? [{ id: 'sales' as Tab, label: 'Sales and orders' }] : []),
    { id: 'hr', label: 'HR and pay' },
    { id: 'changes', label: 'Changes' },
  ];
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const n = (i + step + tabs.length) % tabs.length;
    setTab(tabs[n].id);
    refs.current[n]?.focus();
  };
  const done = (msg: string) => {
    setAct(null);
    setNotice(msg);
    invalidate('team:', 'search:index', 'home:', 'field:', 'clients:');
  };

  return (
    <div className="pday">
      <Arrive className="pday-head">
        <Link className="link back-link" to="/team"><ArrowLeft size={13} aria-hidden="true" /> People</Link>
        <div className="pday-title-row">
          <div>
            <h2 className="page-title-lg">{p.name}</h2>
            <p className="pday-who">{[p.code, p.designation, p.hq, p.territory, p.managerId ? `reports to ${p.manager}` : 'reports to nobody'].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="record-actions">
            {allowed('field') && p.role && <Link className="btn btn-secondary" to={`/field/${p.id}/${today}`}>Today in the field</Link>}
            {may && p.status === 'active' && <button type="button" className="btn btn-secondary" onClick={() => setAct('edit')}>Edit</button>}
          </div>
        </div>
        <div className="pill-row">
          {p.status !== 'active' ? <Pill>Left</Pill> : <Pill tone="good">Working here</Pill>}
          {p.role && p.status === 'active' && (p.login === 'phone' ? <Pill tone="good">Phone login</Pill> : <Pill tone="warning">No phone login</Pill>)}
          {p.role === 'MR' && !p.managerId && p.status === 'active' && <Pill tone="warning">Reports to nobody</Pill>}
        </div>
        <dl className="facts ident">
          <dt>Joined</dt><dd>{p.joinedAt ? `${dayMonth(p.joinedAt)} ${p.joinedAt.slice(0, 4)}` : 'Not recorded'}</dd>
          <dt>Mobile</dt><dd>{p.mobile ?? 'Not given'}</dd>
          <dt>Email</dt><dd>{p.email ?? 'Not given'}</dd>
          <dt>Last seen on the phone</dt><dd>{p.lastSeenAt ? `${ago(p.lastSeenAt)}, ${timeOf(p.lastSeenAt)}${p.lastPlace ? `, near ${p.lastPlace}` : ''}` : 'Never'}</dd>
          <dt>Clients</dt><dd>{count(p.clients, 'client')}{p.reports ? ` · ${count(p.reports, 'person reports', 'people report')} to them` : ''}</dd>
          {p.bloodGroup && <><dt>Blood group</dt><dd>{p.bloodGroup}</dd></>}
        </dl>
        {may && (
          <div className="record-moves">
            {p.status === 'active' && p.role && <button type="button" className="link" onClick={() => setAct('manager')}>Change manager</button>}
            {p.clients > 0 && <button type="button" className="link" onClick={() => setAct('handover')}>Hand over their clients</button>}
            {p.status === 'active' ? <button type="button" className="link danger-link" onClick={() => setAct('left')}>Mark as left</button> : <button type="button" className="link" onClick={() => setAct('reopen')}>Reopen their record</button>}
          </div>
        )}
      </Arrive>

      <div className="rec-tabs" role="tablist" aria-label={`${p.name}'s record`}>
        {tabs.map((t, i) => (
          <button key={t.id} ref={el => { refs.current[i] = el; }} type="button" role="tab" id={`rt-${t.id}`} aria-controls="rt-panel" aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1} className={`rec-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)} onKeyDown={e => onKey(e, i)}>{t.label}</button>
        ))}
      </div>
      <div role="tabpanel" id="rt-panel" aria-labelledby={`rt-${tab}`}>
        {tab === 'month' && <MonthTab p={p} r={r} />}
        {tab === 'field' && <FieldTab p={p} r={r} />}
        {tab === 'sales' && <SalesTab r={r} />}
        {tab === 'hr' && <HrTab p={p} r={r} onDone={done} />}
        {tab === 'changes' && <ChangesTab r={r} />}
      </div>

      <EditDrawer open={act === 'edit'} p={p} m={m} onClose={() => setAct(null)} onDone={done} />
      <ManagerDrawer open={act === 'manager'} p={p} m={m} onClose={() => setAct(null)} onDone={done} />
      <HandOverDrawer open={act === 'handover' || act === 'left'} leaving={act === 'left'} p={p} m={m} onClose={() => setAct(null)} onDone={done} />
      <Confirm open={act === 'reopen'} title={`Reopen ${p.name}'s record?`} confirmLabel="Reopen the record" reason={{ label: 'Why', required: true, placeholder: 'For example: rejoined on 1 November.' }} onCancel={() => setAct(null)}
        onConfirm={reason => void setPersonStatus(p.id, 'active', reason).then(done).catch(e => setNotice(e instanceof Error ? e.message : String(e)))}>
        Their login works again and they take a seat on your plan.
      </Confirm>
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

// ── the month ─────────────────────────────────────────────────────────

function MonthTab({ p, r }: { p: Person; r: Rec }) {
  const [month, setMonth] = useState(r.months[r.months.length - 1]);
  const o = r.month[month];
  const empty = !o.planned && !o.sold && !o.target && !o.claimed && !o.orderCount;
  const gap = Math.max(o.target - o.sold, 0);
  const types = Object.entries(o.byType).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rec-body">
      <div className="toolbar"><Filter label="Month" value={month} onChange={setMonth} options={[...r.months].reverse().map(k => ({ value: k, label: `${monthName(k)} ${k.slice(0, 4)}` }))} /></div>
      {empty ? (
        <Empty title={`Nothing recorded in ${monthName(month)}`}>No calls, sales, targets, orders or claims were filed against this month.</Empty>
      ) : (
        <>
          <p className="rec-line">
            {o.target ? <><strong>{rupeesShort(o.sold)}</strong> sold of a {rupeesShort(o.target)} target ({percent(o.sold, o.target)}){gap ? `, ${rupeesShort(gap)} still to sell` : ', target met'}.</> : o.sold ? <><strong>{rupeesShort(o.sold)}</strong> sold, with no target set.</> : <>No sales recorded.</>}
            {' '}{o.planned ? `${o.done} of ${count(o.planned, 'call')} done (${percent(o.done, o.planned)}).` : ''}
            {' '}{o.claimed ? `${rupees(o.claimed)} claimed, ${o.claimStatus}.` : ''}
          </p>
          <div className="fig-groups">
            <section className="fig-group">
              <h3 className="fig-title">Days</h3>
              <dl className="figs">
                <div><dt>Working</dt><dd>{o.workingDays}</dd></div>
                <div><dt>In the field</dt><dd>{o.fieldDays}</dd></div>
                <div><dt>On leave</dt><dd>{o.leaveDays}</dd></div>
                <div><dt>No call made</dt><dd>{Math.max(o.workingDays - o.fieldDays - o.leaveDays, 0)}</dd></div>
              </dl>
              <p className="fig-note">Working days leave out the week off and holidays. A call on a holiday still counts as a day in the field.</p>
            </section>
            <section className="fig-group">
              <h3 className="fig-title">Calls</h3>
              <dl className="figs">
                <div><dt>Planned</dt><dd>{o.planned}</dd></div>
                <div><dt>Done</dt><dd>{o.done}</dd></div>
                <div><dt>Missed</dt><dd>{o.missed}</dd></div>
                <div><dt>Unplanned</dt><dd>{o.unplanned}</dd></div>
              </dl>
              <p className="fig-note">{o.checked ? `${percent(o.verified, o.checked)} of checked visits were at the client.` : 'No visit could be checked against a location.'}{o.fake ? ` ${count(o.fake, 'visit')} with a fake location.` : ''}</p>
            </section>
            <section className="fig-group">
              <h3 className="fig-title">Who was seen</h3>
              <dl className="figs">
                <div><dt>Clients</dt><dd>{o.clientsSeen}</dd></div>
                {types.slice(0, 3).map(([t, n]) => <div key={t}><dt>{typeLabel(t)} calls</dt><dd>{n}</dd></div>)}
              </dl>
              <p className="fig-note">of {count(p.clients, 'client')} assigned to them.</p>
            </section>
            <section className="fig-group">
              <h3 className="fig-title">Orders and sales</h3>
              <dl className="figs">
                <div><dt>Orders</dt><dd>{o.orderCount}</dd></div>
                <div><dt>Order value, with GST</dt><dd>{rupeesShort(o.orderValue)}</dd></div>
                <div><dt>Primary sales</dt><dd>{rupeesShort(o.primary)}</dd></div>
                <div><dt>Field orders, before GST</dt><dd>{rupeesShort(o.orders)}</dd></div>
              </dl>
              {o.noStockist > 0 && <p className="fig-note warn-text">{count(o.noStockist, 'order names', 'orders name')} no stockist, so there is nobody to send {o.noStockist === 1 ? 'it' : 'them'} to.</p>}
            </section>
          </div>
          <section className="block">
            <MonthBars caption="Sales each month against the target" format={rupees} partA="Primary sales" partB="Field orders" highlight={month} onPick={setMonth}
              data={r.months.map(k => ({ key: k, label: monthName(k, false), a: r.month[k].primary, b: r.month[k].orders, target: r.month[k].target }))} />
          </section>
        </>
      )}
    </div>
  );
}

// ── field ─────────────────────────────────────────────────────────────

function FieldTab({ p, r }: { p: Person; r: Rec }) {
  return (
    <div className="rec-body record-grid">
      <section className="block">
        <div className="block-head"><h3 className="section-title">The last 30 days</h3></div>
        {r.days.length === 0 ? <p className="block-empty">No day plan or call in the last 30 days.</p> : (
          <ul className="rows">
            {r.days.map(d => (
              <li key={d.date} className="row">
                <div className="row-main"><p className="row-title"><Link className="cell-link" to={`/field/${p.id}/${d.date}`}>{longDay(d.date)}</Link></p><p className="row-sub">{d.plan ? 'Day plan filed' : 'No day plan'}{d.planned ? ` · ${d.done} of ${count(d.planned, 'call')} done${d.missed ? `, ${d.missed} missed` : ''}` : ''}</p></div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="block">
        <div className="block-head"><h3 className="section-title">Recent calls</h3></div>
        {r.recent.length === 0 ? <p className="block-empty">No calls recorded.</p> : (
          <ul className="rows">
            {r.recent.map(v => {
              const ver = v.mocked ? VERDICT.suspect : v.verdict ? VERDICT[v.verdict] : null;
              return (
                <li key={v.id} className="row">
                  <div className="row-main"><p className="row-title">{v.client}</p><p className="row-sub">{dayMonth(dayOf(v.at))}, {timeOf(v.at)}{v.status === 'missed' ? ' · missed' : ''}</p></div>
                  {ver && v.status === 'completed' && <Pill tone={ver.tone}>{ver.word}</Pill>}
                </li>
              );
            })}
          </ul>
        )}
        <div className="block-head sub-block"><h3 className="section-title">Clients, {r.clients.length}</h3></div>
        {r.clients.length === 0 ? <p className="block-empty">No clients are assigned to them.</p> : (
          <ul className="rows">
            {r.clients.slice(0, 12).map(c => (
              <li key={c.id} className="row"><div className="row-main"><p className="row-title"><Link className="cell-link" to={`/clients/${c.id}`}>{c.name}</Link></p><p className="row-sub">{typeLabel(c.type)} · {count(c.visits, 'visit')}</p></div><span className="row-meta">{c.lastVisit ? `last ${dayMonth(c.lastVisit)}` : 'never visited'}</span></li>
            ))}
          </ul>
        )}
        {r.clients.length > 12 && <p className="block-note"><Link className="link" to="/clients">See all {r.clients.length} in Clients</Link></p>}
      </section>
    </div>
  );
}

// ── sales and orders ──────────────────────────────────────────────────

function SalesTab({ r }: { r: Rec }) {
  return (
    <div className="rec-body record-grid">
      <section className="block">
        <div className="block-head"><h3 className="section-title">Targets and sales by month</h3></div>
        <div className="table-wrap">
          <table className="table table-compact">
            <thead><tr><th scope="col">Month</th><th scope="col" className="num">Target</th><th scope="col" className="num">Sold</th><th scope="col" className="num">Of target</th></tr></thead>
            <tbody>{[...r.months].reverse().map(k => { const o = r.month[k]; return <tr key={k}><th scope="row">{monthName(k)} {k.slice(0, 4)}</th><td className="num">{o.target ? rupees(o.target) : <span className="cell-quiet">None</span>}</td><td className="num">{rupees(o.sold)}</td><td className="num">{o.target ? percent(o.sold, o.target) : ''}</td></tr>; })}</tbody>
          </table>
        </div>
      </section>
      <section className="block">
        <div className="block-head"><h3 className="section-title">Orders</h3></div>
        {r.orders.length === 0 ? <p className="block-empty">No orders booked.</p> : (
          <ul className="rows">
            {r.orders.slice(0, 15).map(o => (
              <li key={o.id} className="row">
                <div className="row-main"><p className="row-title"><Link className="cell-link" to={`/sales/orders?open=${o.id}`}>Order {o.number}</Link></p><p className="row-sub">{dayMonth(dayOf(o.at))} · {o.client}</p></div>
                <span className="row-figure">{rupees(o.total)} <Pill tone={(ORDER_STATUS[o.status] ?? { tone: 'neutral' }).tone}>{(ORDER_STATUS[o.status] ?? { word: o.status }).word}</Pill></span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── HR and pay ────────────────────────────────────────────────────────

const LEAVE_STATUS: Record<string, { word: string; tone: 'good' | 'accent' | 'neutral' }> = { approved: { word: 'Approved', tone: 'good' }, pending: { word: 'Waiting', tone: 'accent' }, rejected: { word: 'Not approved', tone: 'neutral' } };

function HrTab({ p, r, onDone }: { p: Person; r: Rec; onDone: (m: string) => void }) {
  const me = useMe();
  const mayDocs = ['owner', 'admin', 'hr'].includes(me.role);
  const seesSalary = ['owner', 'hr', 'finance'].includes(me.role);
  const [upload, setUpload] = useState(false);
  const [removing, setRemoving] = useState<Rec['documents'][number] | null>(null);
  const [opening, setOpening] = useState('');
  const [problem, setProblem] = useState('');
  const today = IST_TODAY();
  const open = async (path: string, id: string) => {
    setOpening(id);
    setProblem('');
    try {
      window.open(await documentUrl(path), '_blank', 'noopener');
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setOpening('');
    }
  };
  return (
    <div className="rec-body record-grid">
      <div>
        <section className="block">
          <div className="block-head"><h3 className="section-title">Leave</h3></div>
          {r.leave.length === 0 ? <p className="block-empty">No leave applied for.</p> : (
            <ul className="rows">
              {r.leave.slice(0, 10).map(l => (
                <li key={l.id} className="row">
                  <div className="row-main"><p className="row-title">{leaveLabel(l.type)}, {count(l.days, 'day')}</p><p className="row-sub">{dayRange(l.from, l.to)} · {l.reason}</p></div>
                  <Pill tone={(LEAVE_STATUS[l.status] ?? { tone: 'neutral' }).tone}>{(LEAVE_STATUS[l.status] ?? { word: l.status }).word}</Pill>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="block sub-block">
          <div className="block-head"><h3 className="section-title">Expense claims</h3></div>
          {r.expenses.length === 0 ? <p className="block-empty">No claims in the last year.</p> : (
            <ul className="rows">
              {r.expenses.map(e => (
                <li key={e.month} className="row"><div className="row-main"><p className="row-title">{monthName(e.month)} {e.month.slice(0, 4)}</p><p className="row-sub">{count(e.days, 'day')} · {e.status}</p></div><span className="row-figure">{rupees(e.amount)}</span></li>
              ))}
            </ul>
          )}
        </section>
        {seesSalary && (
          <section className="block sub-block">
            <div className="block-head"><h3 className="section-title">Payslips</h3><span className="block-meta">seen by owner, HR and finance only</span></div>
            {r.payslips.length === 0 ? <p className="block-empty">No payslip has been released for them.</p> : (
              <ul className="rows">
                {r.payslips.map(s => <li key={`${s.year}-${s.month}`} className="row"><div className="row-main"><p className="row-title">{new Date(s.year, s.month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p><p className="row-sub">released {dayMonth(dayOf(s.at))}</p></div><span className="row-figure">{rupees(s.net)} net</span></li>)}
              </ul>
            )}
          </section>
        )}
      </div>
      <section className="block">
        <div className="block-head">
          <h3 className="section-title">Documents</h3>
          {mayDocs && p.status === 'active' && <button type="button" className="link" onClick={() => setUpload(true)}>Add a document</button>}
        </div>
        {r.documents.length === 0 ? <p className="block-empty">No documents on file. ID proof, offer letters and licences go here, with their expiry dates.</p> : (
          <ul className="rows">
            {r.documents.map(d => {
              const left = d.expires ? daysBetween(today, d.expires) : null;
              return (
                <li key={d.id} className="row">
                  <div className="row-main">
                    <p className="row-title">{d.title}</p>
                    <p className="row-sub">{d.category} · added {dayMonth(dayOf(d.at))}{d.expires ? ` · expires ${dayMonth(d.expires)} ${d.expires.slice(0, 4)}` : ''}</p>
                  </div>
                  <span className="row-actions">
                    {left != null && left < 0 ? <Pill tone="critical">Expired</Pill> : left != null && left <= 30 ? <Pill tone="warning">{`In ${count(left, 'day')}`}</Pill> : null}
                    <button type="button" className="link" disabled={opening === d.id} onClick={() => void open(d.path, d.id)}>{opening === d.id ? 'Opening…' : 'Open'}</button>
                    {mayDocs && <button type="button" className="link danger-link" onClick={() => setRemoving(d)}>Remove</button>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {problem && <p className="form-error" role="alert">{problem}</p>}
      </section>
      <UploadDrawer open={upload} p={p} onClose={() => setUpload(false)} onDone={m => { setUpload(false); onDone(m); }} />
      <Confirm open={Boolean(removing)} title={`Remove ${removing?.title ?? ''}?`} confirmLabel="Remove the document" danger onCancel={() => setRemoving(null)}
        onConfirm={() => { const d = removing!; void removeDocument(d.id).then(() => { setRemoving(null); onDone(`${d.title} was removed.`); }).catch(e => { setRemoving(null); setProblem(e instanceof Error ? e.message : String(e)); }); }}>
        The file is deleted for good. {p.name} no longer sees it on the phone.
      </Confirm>
    </div>
  );
}

function UploadDrawer({ open, p, onClose, onDone }: { open: boolean; p: Person; onClose: () => void; onDone: (m: string) => void }) {
  const me = useMe();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>(DOCUMENT_CATEGORIES[0]);
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { if (open) { setFile(null); setTitle(''); setExpires(''); setProblem(''); setAttempt(0); } }, [open]);
  const errors = { file: !file ? 'Choose the file.' : documentProblem(file) ?? undefined, title: !title.trim() ? 'Give it a title, as people will look for it.' : undefined };
  const formRef = useFocusFirstError(errors, attempt);
  const save = async () => {
    setAttempt(a => a + 1);
    if (errors.file || errors.title) return;
    setBusy(true);
    setProblem('');
    try {
      await uploadDocument(me.orgId, p.id, file!, title.trim(), category, expires || null);
      onDone(`${title.trim()} is on ${p.name}'s record, and they can see it on the phone.`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} title="Add a document" sub={`To ${p.name}'s record. They see it on their phone.`}
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Uploading…' : 'Add the document'}</button></>}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        <Field label="File" error={attempt ? errors.file : undefined} help="A PDF, JPG or PNG, up to 20 MB.">{x => <input {...x} type="file" className="input file-input" accept={DOCUMENT_ACCEPT} onChange={e => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '')); }} />}</Field>
        <Field label="Title" error={attempt ? errors.title : undefined}>{x => <input {...x} className="input" value={title} onChange={e => setTitle(e.target.value)} />}</Field>
        <div className="form-row">
          <Field label="Kind of document">{x => <select {...x} className="input" value={category} onChange={e => setCategory(e.target.value)}>{DOCUMENT_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>}</Field>
          <Field label="Expires" optional help="HR is reminded a month before.">{x => <input {...x} type="date" className="input" value={expires} onChange={e => setExpires(e.target.value)} />}</Field>
        </div>
        {problem && <p className="form-error" role="alert">That was not added. {problem}</p>}
      </form>
    </Drawer>
  );
}

// ── changes ───────────────────────────────────────────────────────────

function ChangesTab({ r }: { r: Rec }) {
  return (
    <div className="rec-body">
      {r.audit.length === 0 ? <Empty title="No changes recorded">Changes to this person's record, manager, clients and login are kept here for ever.</Empty> : (
        <ul className="rows">
          {r.audit.map(a => (
            <li key={a.id} className="row">
              <div className="row-main"><p className="row-title">{a.who} {a.action}</p><p className="row-sub">{[a.before && a.after ? `${a.before} to ${a.after}` : a.after, a.reason && `“${a.reason}”`].filter(Boolean).join(' · ')}</p></div>
              <span className="row-meta">{dayMonth(dayOf(a.at))} {a.at.slice(0, 4)}, {timeOf(a.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── the moves ─────────────────────────────────────────────────────────

function EditDrawer({ open, p, m, onClose, onDone }: { open: boolean; p: Person; m: RosterModel; onClose: () => void; onDone: (msg: string) => void }) {
  const [f, setF] = useState({ name: p.name, designationId: p.designationId ?? '', department: p.department, territoryId: p.territoryId ?? '', hq: p.hq, mobile: p.mobile ?? '', email: p.email ?? '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  useEffect(() => { if (open) { setF({ name: p.name, designationId: p.designationId ?? '', department: p.department, territoryId: p.territoryId ?? '', hq: p.hq, mobile: p.mobile ?? '', email: p.email ?? '' }); setProblem(''); } }, [open, p]);
  const save = async () => {
    setBusy(true);
    setProblem('');
    try {
      await updatePerson(p.id, f);
      onDone(`${f.name} was saved.`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} title={`Edit ${p.name}`} sub={`${p.code}: the code they sign in with never changes.`}
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy || f.name.trim().length < 2} onClick={() => void save()}>{busy ? 'Saving…' : 'Save changes'}</button></>}>
      <form className="form" onSubmit={e => { e.preventDefault(); void save(); }}>
        <Field label="Full name">{x => <input {...x} className="input" value={f.name} onChange={e => setF(v => ({ ...v, name: e.target.value }))} />}</Field>
        <div className="form-row">
          <Field label="Role">{x => <select {...x} className="input" value={f.designationId} onChange={e => setF(v => ({ ...v, designationId: e.target.value }))}>{m.roles.filter(r => r.active || r.id === f.designationId).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}</Field>
          <Field label="Department">{x => <input {...x} className="input" value={f.department} onChange={e => setF(v => ({ ...v, department: e.target.value }))} />}</Field>
        </div>
        <div className="form-row">
          <Field label="Territory">{x => <select {...x} className="input" value={f.territoryId} onChange={e => setF(v => ({ ...v, territoryId: e.target.value }))}>{m.territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}</Field>
          <Field label="Headquarters">{x => <input {...x} className="input" value={f.hq} onChange={e => setF(v => ({ ...v, hq: e.target.value }))} />}</Field>
        </div>
        <div className="form-row">
          <Field label="Mobile" optional>{x => <input {...x} className="input" inputMode="tel" value={f.mobile} onChange={e => setF(v => ({ ...v, mobile: e.target.value }))} />}</Field>
          <Field label="Email">{x => <input {...x} className="input" type="email" value={f.email} onChange={e => setF(v => ({ ...v, email: e.target.value }))} />}</Field>
        </div>
        <p className="form-help">The manager changes on its own, with a date and a reason, so the reporting line keeps its history.</p>
        {problem && <p className="form-error" role="alert">That was not saved. {problem}</p>}
      </form>
    </Drawer>
  );
}

export function ManagerDrawer({ open, p, m, onClose, onDone }: { open: boolean; p: Person; m: RosterModel; onClose: () => void; onDone: (msg: string) => void }) {
  const today = IST_TODAY();
  const [to, setTo] = useState('');
  const [from, setFrom] = useState(today);
  const [cover, setCover] = useState(false);
  const [until, setUntil] = useState(shiftDay(today, 14));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { if (open) { setTo(''); setFrom(today); setCover(false); setReason(''); setProblem(''); setAttempt(0); } }, [open, today]);
  const managers = m.people.filter(x => x.status === 'active' && x.role === 'ASM' && x.id !== p.id).sort((a, b) => a.name.localeCompare(b.name));
  const errors = { to: !to ? 'Choose the new manager, or nobody.' : undefined, reason: reason.trim().length < 3 ? 'Write why; it changes who approves their money.' : undefined };
  const formRef = useFocusFirstError(errors, attempt);
  const save = async () => {
    setAttempt(a => a + 1);
    if (errors.to || errors.reason) return;
    setBusy(true);
    setProblem('');
    try {
      await changeManager(p.id, to === 'none' ? null : to, from, cover ? until : null, reason.trim());
      const name = to === 'none' ? 'nobody' : managers.find(x => x.id === to)?.name;
      onDone(from === today ? `${p.name} now reports to ${name}.` : `${p.name} reports to ${name} from ${dayMonth(from)}.`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} title={`Change ${p.name}'s manager`} sub={`Reports to ${p.managerId ? p.manager : 'nobody'} now. The change is dated, so the old line stays on record.`}
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Change manager'}</button></>}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        <Field label="New manager" error={attempt ? errors.to : undefined} help="Only people whose role opens the manager app can approve someone's work.">{x => (
          <select {...x} className="input" value={to} onChange={e => setTo(e.target.value)}>
            <option value="">Choose</option>
            {managers.map(x2 => <option key={x2.id} value={x2.id} disabled={x2.id === p.managerId}>{x2.name}{x2.hq ? ` · ${x2.hq}` : ''}{x2.id === p.managerId ? ' (now)' : ''}</option>)}
            <option value="none">Nobody</option>
          </select>
        )}</Field>
        <div className="form-row">
          <Field label="From">{x => <input {...x} type="date" className="input" min={today} value={from} onChange={e => setFrom(e.target.value)} />}</Field>
          {cover && <Field label="Until">{x => <input {...x} type="date" className="input" min={shiftDay(from, 1)} value={until} onChange={e => setUntil(e.target.value)} />}</Field>}
        </div>
        <label className="choice"><input type="checkbox" checked={cover} onChange={e => setCover(e.target.checked)} /> Only for a while, as cover</label>
        <Field label="Why" error={attempt ? errors.reason : undefined}>{x => <textarea {...x} className="input textarea" rows={3} value={reason} placeholder="For example: moved to the Warangal team." onChange={e => setReason(e.target.value)} />}</Field>
        {problem && <p className="form-error" role="alert">That was not changed. {problem}</p>}
      </form>
    </Drawer>
  );
}

function HandOverDrawer({ open, leaving, p, m, onClose, onDone }: { open: boolean; leaving: boolean; p: Person; m: RosterModel; onClose: () => void; onDone: (msg: string) => void }) {
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { if (open) { setTo(''); setReason(''); setProblem(''); setAttempt(0); } }, [open]);
  const others = m.people.filter(x => x.status === 'active' && x.id !== p.id && x.role).sort((a, b) => a.name.localeCompare(b.name));
  const blocked = leaving && p.reports > 0;
  const errors = {
    to: !leaving && !to ? 'Choose who takes the clients.' : undefined,
    reason: reason.trim().length < 5 ? 'Write a reason of a few words; it is what the next person reads.' : undefined,
  };
  const formRef = useFocusFirstError(errors, attempt);
  const save = async () => {
    setAttempt(a => a + 1);
    if (blocked || errors.to || errors.reason) return;
    setBusy(true);
    setProblem('');
    try {
      const said: string[] = [];
      if (to && p.clients) said.push(await handOverClients(p.id, to, reason.trim()));
      if (leaving) said.push(await setPersonStatus(p.id, 'inactive', reason.trim()));
      onDone(said.join(' '));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} title={leaving ? `Mark ${p.name} as left` : `Hand over ${p.name}'s clients`} sub={leaving ? 'Their record is kept and closed, never deleted.' : `${count(p.clients, 'client')} move to one colleague. Visits and orders already filed stay under ${p.name.split(' ')[0]}.`}
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className={`btn ${leaving ? 'btn-danger' : 'btn-primary'}`} disabled={busy || blocked} onClick={() => void save()}>{busy ? 'Saving…' : leaving ? 'Mark as left' : 'Hand over'}</button></>}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        {leaving && (
          <ul className="consequences">
            <li>Their login is suspended and their seat on your plan is free.</li>
            <li>{p.clients ? `They hold ${count(p.clients, 'client')}. Hand them to someone below, or they are left with nobody.` : 'They hold no clients.'}</li>
            <li>{p.reports ? <span className="warn-text">{count(p.reports, 'person reports', 'people report')} to them. Move the team to another manager first; until then this cannot be done.</span> : 'Nobody reports to them.'}</li>
          </ul>
        )}
        {(p.clients > 0) && (
          <Field label={leaving ? 'Hand their clients to' : 'Hand over to'} optional={leaving} error={attempt ? errors.to : undefined}>{x => (
            <select {...x} className="input" value={to} onChange={e => setTo(e.target.value)}>
              <option value="">{leaving ? 'Nobody, leave them unassigned' : 'Choose someone'}</option>
              {others.map(o => <option key={o.id} value={o.id}>{o.name}{o.hq ? ` · ${o.hq}` : ''}</option>)}
            </select>
          )}</Field>
        )}
        <Field label="Why" error={attempt ? errors.reason : undefined}>{x => <textarea {...x} className="input textarea" rows={3} value={reason} placeholder={leaving ? 'For example: resigned, last day 30 September.' : 'For example: moved to the Vijayawada territory.'} onChange={e => setReason(e.target.value)} />}</Field>
        {problem && <p className="form-error" role="alert">{problem}</p>}
      </form>
    </Drawer>
  );
}
