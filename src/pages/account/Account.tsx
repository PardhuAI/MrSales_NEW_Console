import { useEffect, useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import { invalidate, useResource } from '../../data/resource';
import { TICKET_PRIORITY, TICKET_TYPE, loadBilling, loadThread, loadTickets, raiseTicket, replyTicket, type Billing, type Ticket } from '../../live/settings';
import { ago, dayMonth, dayOf, timeOf } from '../../lib/days';
import { count, rupees } from '../../lib/format';
import { Drawer, Field, Notice, Pill, Summary, Toolbar, useFocusFirstError } from '../../components/kit';
import { Segmented } from '../../components/Segmented';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ── help from Mr Sales ────────────────────────────────────────────────

const STATUS: Record<string, { word: string; tone: 'good' | 'warning' | 'accent' | 'neutral' }> = {
  open: { word: 'With Mr Sales', tone: 'accent' }, in_progress: { word: 'Being worked on', tone: 'accent' },
  waiting_customer: { word: 'Waiting for you', tone: 'warning' }, resolved: { word: 'Resolved', tone: 'good' }, closed: { word: 'Closed', tone: 'neutral' },
};

/** Help: the requests sent to the Mr Sales team, their answers, and asking for something new. */
export function Help() {
  const r = useResource<Ticket[]>('account:tickets', loadTickets);
  if (r.status === 'error' && !r.data) return <LoadError what="Your requests" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading your requests" lines={1} />;
  return <HelpView list={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function HelpView({ list, at, error, reload }: { list: Ticket[]; at: Date | null; error: string; reload: () => void }) {
  const [show, setShow] = useState<'open' | 'done'>('open');
  const [raising, setRaising] = useState(false);
  const [open, setOpen] = useState<Ticket | null>(null);
  const [notice, setNotice] = useState('');
  const isOpen = (t: Ticket) => !['resolved', 'closed'].includes(t.status);
  const waiting = list.filter(t => t.status === 'waiting_customer');
  const rows = list.filter(t => (show === 'open' ? isOpen(t) : !isOpen(t)));
  const urgent = list.filter(t => isOpen(t) && t.dueAt);
  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read your requests again" />}>
        {list.length === 0 ? 'You have not asked the Mr Sales team for anything yet.' : <>
          {waiting.length ? <><strong className="warn-text">{count(waiting.length, 'request waits', 'requests wait')} for your answer.</strong> </> : ''}
          {count(list.filter(isOpen).length, 'request')} open, {list.length - list.filter(isOpen).length} resolved.
          {urgent.length ? ` The next answer is promised by ${dayMonth(dayOf(urgent.map(t => t.dueAt!).sort()[0]))}, ${timeOf(urgent.map(t => t.dueAt!).sort()[0])}.` : ''}
        </>}
      </Summary>
      <Toolbar>
        <button type="button" className="btn btn-primary btn-small" onClick={() => setRaising(true)}><Plus size={14} weight="bold" aria-hidden="true" /> Ask for help</button>
        <Segmented label="Show" value={show} onChange={setShow} options={[{ value: 'open', label: 'Open', count: list.filter(isOpen).length }, { value: 'done', label: 'Resolved', count: list.length - list.filter(isOpen).length }]} />
      </Toolbar>
      {list.length === 0 ? <Empty title="No requests yet">Something not working, data that looks wrong, a question about billing: write to the Mr Sales team here and follow the answer.</Empty>
        : rows.length === 0 ? <div className="list-empty"><Empty title={show === 'open' ? 'Nothing open' : 'Nothing resolved yet'}>{show === 'open' ? 'Every request has been answered.' : 'Resolved requests appear here.'}</Empty></div> : (
          <Arrive>
            <ul className="rows task-list">
              {rows.map(t => {
                const st = STATUS[t.status] ?? { word: t.status, tone: 'neutral' as const };
                return (
                  <li key={t.id} className="row">
                    <div className="row-main">
                      <p className="row-title"><button type="button" className="cell-link cell-button" aria-haspopup="dialog" onClick={() => setOpen(t)}>{t.subject}</button></p>
                      <p className="row-sub">{[TICKET_TYPE[t.type] ?? t.type, `raised ${dayMonth(dayOf(t.at))}`, t.raisedBy && `by ${t.raisedBy}`, `last word ${ago(t.updatedAt)}`].filter(Boolean).join(' · ')}</p>
                    </div>
                    <span className="row-meta"><Pill tone={st.tone}>{st.word}</Pill></span>
                  </li>
                );
              })}
            </ul>
          </Arrive>
        )}
      <RaiseDrawer open={raising} onClose={() => setRaising(false)} onDone={m => { setRaising(false); setNotice(m); invalidate('account:tickets'); }} />
      <ThreadDrawer t={open} onClose={() => setOpen(null)} onReplied={() => { setNotice('Your reply is sent.'); invalidate('account:tickets'); }} />
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

function RaiseDrawer({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const [type, setType] = useState('app_issue');
  const [priority, setPriority] = useState('medium');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { if (open) { setType('app_issue'); setPriority('medium'); setSubject(''); setBody(''); setProblem(''); setAttempt(0); } }, [open]);
  const errors = { subject: subject.trim().length < 4 ? 'Say in a line what it is about.' : undefined, body: body.trim().length < 10 ? 'Say what happened, so the team can help.' : undefined };
  const formRef = useFocusFirstError(errors, attempt);
  const save = async () => {
    setAttempt(a => a + 1);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setProblem('');
    try {
      await raiseTicket(type, priority, subject.trim(), body.trim());
      onDone('Your request is with the Mr Sales team; their answer appears here.');
    } catch (e) {
      setProblem(msg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} title="Ask the Mr Sales team" sub="Write as you would to a colleague. Names, dates and what you expected help most."
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Sending…' : 'Send the request'}</button></>}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        <Field label="What it is">{x => <select {...x} className="input" value={type} onChange={e => setType(e.target.value)}>{Object.entries(TICKET_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</Field>
        <Field label="How soon">{x => <select {...x} className="input" value={priority} onChange={e => setPriority(e.target.value)}>{Object.entries(TICKET_PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</Field>
        <Field label="In a line" error={attempt ? errors.subject : undefined}>{x => <input {...x} className="input" value={subject} placeholder="Day plans not reaching Warangal phones" onChange={e => setSubject(e.target.value)} />}</Field>
        <Field label="What happened" error={attempt ? errors.body : undefined}>{x => <textarea {...x} className="input textarea" rows={6} value={body} onChange={e => setBody(e.target.value)} />}</Field>
        {problem && <p className="form-error" role="alert">It was not sent. {problem}</p>}
      </form>
    </Drawer>
  );
}

function ThreadDrawer({ t, onClose, onReplied }: { t: Ticket | null; onClose: () => void; onReplied: () => void }) {
  const r = useResource(`account:thread:${t?.id ?? 'none'}`, () => (t ? loadThread(t.id) : Promise.resolve([])));
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  useEffect(() => { setReply(''); setProblem(''); }, [t]);
  const send = async () => {
    if (!t || !reply.trim()) { setProblem('Write a reply first.'); return; }
    setBusy(true);
    setProblem('');
    try {
      await replyTicket(t.id, reply.trim());
      setReply('');
      invalidate(`account:thread:${t.id}`);
      onReplied();
    } catch (e) {
      setProblem(msg(e));
    } finally {
      setBusy(false);
    }
  };
  const st = t ? STATUS[t.status] ?? { word: t.status, tone: 'neutral' as const } : null;
  return (
    <Drawer open={Boolean(t)} onClose={onClose} wide title={t?.subject ?? ''} sub={t ? `${TICKET_TYPE[t.type] ?? t.type} · ${TICKET_PRIORITY[t.priority] ?? t.priority} · ${st?.word}` : ''}
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Close</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void send()}>{busy ? 'Sending…' : 'Send the reply'}</button></>}>
      {r.status === 'error' && !r.data ? <LoadError what="The conversation" error={r.error} retry={() => void r.reload()} />
        : !r.data ? <Loading label="Reading the conversation" lines={1} /> : (
          <ol className="thread">
            {r.data.map(m => (
              <li key={m.id} className={`thread-msg${m.fromUs ? ' them' : ''}`}>
                <p className="thread-who">{m.fromUs ? 'Mr Sales' : m.author} · {dayMonth(dayOf(m.at))}, {timeOf(m.at)}</p>
                <p className="thread-body">{m.body}</p>
              </li>
            ))}
          </ol>
        )}
      <Field label="Your reply">{x => <textarea {...x} className="input textarea" rows={4} value={reply} onChange={e => setReply(e.target.value)} />}</Field>
      {problem && <p className="form-error" role="alert">{problem}</p>}
    </Drawer>
  );
}

// ── plan and billing ──────────────────────────────────────────────────

const INVOICE: Record<string, { word: string; tone: 'good' | 'accent' | 'critical' | 'neutral' }> = {
  paid: { word: 'Paid', tone: 'good' }, issued: { word: 'To pay', tone: 'accent' }, overdue: { word: 'Overdue', tone: 'critical' }, cancelled: { word: 'Cancelled', tone: 'neutral' },
};
const PLAN: Record<string, string> = { starter: 'Starter', growth: 'Growth', scale: 'Scale', enterprise: 'Enterprise', trial: 'Trial' };

/** Plan and billing: the plan, the field seats used, and every invoice. */
export function BillingPage() {
  const r = useResource<Billing>('account:billing', loadBilling);
  if (r.status === 'error' && !r.data) return <LoadError what="Your plan" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading your plan" lines={1} />;
  const b = r.data;
  const due = b.invoices.filter(i => i.status === 'issued' || i.status === 'overdue');
  const owed = due.reduce((s, i) => s + i.total - i.paid, 0);
  const overdue = b.invoices.filter(i => i.status === 'overdue');
  const left = b.seats != null ? b.seats - b.used : null;
  return (
    <div className="page-body">
      <Summary aside={<Freshness at={r.at} error={r.error} reload={() => void r.reload()} label="Read your plan again" />}>
        {b.plan ? <>You are on the <strong>{PLAN[b.plan] ?? b.plan}</strong> plan.</> : 'No plan is recorded yet.'}
        {owed ? <> <strong className={overdue.length ? 'warn-text' : ''}>{rupees(owed)} to pay</strong>{overdue.length ? `, ${count(overdue.length, 'invoice')} overdue` : ''}.</> : ' Nothing to pay.'}
      </Summary>
      <Arrive className="bill-layout">
        <section className="bill-seats">
          <p className="fig-title">Field seats</p>
          <p className="bill-fig"><span className="hero-fig">{b.used}</span>{b.seats != null && <span className="cell-quiet"> of {b.seats} used</span>}</p>
          {b.seats != null && <span className="seat-meter" aria-hidden="true"><span style={{ transform: `scaleX(${Math.min(b.used / Math.max(b.seats, 1), 1)})` }} /></span>}
          <p className="fig-note">{left == null ? 'A seat is a person who can sign in on the phone.' : left > 0 ? `${count(left, 'seat')} free. A seat is a person who can sign in on the phone; switching a login off frees one.` : 'Every seat is taken. Switch off a login that is no longer used, or ask for more seats under Help.'}</p>
        </section>
        <section>
          <div className="block-head"><h2 className="section-title">Invoices</h2><span className="block-meta">{count(b.invoices.length, 'invoice')}</span></div>
          {b.invoices.length === 0 ? <p className="block-empty">No invoices yet. They appear here when issued, with what each one covers.</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th scope="col">Invoice</th><th scope="col" className="hide-narrow">Covers</th><th scope="col" className="num">Total</th><th scope="col">Status</th></tr></thead>
                <tbody>
                  {b.invoices.map(i => {
                    const st = INVOICE[i.status] ?? { word: i.status, tone: 'neutral' as const };
                    return (
                      <tr key={i.id}>
                        <th scope="row">{i.number}<span className="cell-sub">issued {dayMonth(i.issued)}{i.due ? `, due ${dayMonth(i.due)}` : ''}</span></th>
                        <td className="hide-narrow">{i.from && i.to ? `${dayMonth(i.from)} to ${dayMonth(i.to)}` : 'One-off'}<span className="cell-sub">{PLAN[i.plan] ?? i.plan}, {count(i.seats, 'seat')}</span></td>
                        <td className="num">{rupees(i.total)}<span className="cell-sub">incl. {i.gst}% GST</span></td>
                        <td><Pill tone={st.tone}>{st.word}</Pill>{i.paid > 0 && i.paid < i.total && <span className="cell-sub">{rupees(i.paid)} paid</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </Arrive>
    </div>
  );
}
