import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Paperclip } from '@phosphor-icons/react';
import { invalidate, useResource } from '../../data/resource';
import { approvalsStore } from '../../data/approvals';
import { billUrl, decideClaim, loadClaims, type Claim, type ClaimDay, type ClaimStatus, type ClaimsModel } from '../../live/money';
import { monthName } from '../../live/sales';
import { IST_TODAY, ago, weekdayOf } from '../../lib/days';
import { count, rupees } from '../../lib/format';
import { openFile } from '../../lib/openFile';
import { Confirm, Drawer, Notice, Pill, SearchBox, Summary, Toolbar, useShowMore } from '../../components/kit';
import { MonthStrip } from '../../components/MonthStrip';
import { Segmented } from '../../components/Segmented';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useCan } from '../../app/access';

export const CLAIM_STATUS: Record<ClaimStatus, { word: string; tone: 'good' | 'accent' | 'neutral' | 'critical' }> = {
  pending: { word: 'Waiting for a decision', tone: 'accent' },
  approved: { word: 'Approved', tone: 'good' },
  rejected: { word: 'Rejected', tone: 'critical' },
  draft: { word: 'Not sent yet', tone: 'neutral' },
  none: { word: 'No claim', tone: 'neutral' },
};

const monthsBack = (n: number) => {
  const [y, m] = IST_TODAY().split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
};

/**
 * Expense claims: each person's month, the days they claimed against the days
 * they worked, with the bills. Claims are sent at the start of the next month,
 * so in the first ten days the month shown is the one just closed.
 */
export function Claims() {
  const months = monthsBack(6);
  const [month, setMonth] = useState(Number(IST_TODAY().slice(8)) <= 10 ? months[1] : months[0]);
  const r = useResource<ClaimsModel>(`money:claims:${month}`, () => loadClaims(month));
  return (
    <div className="page-body">
      <Toolbar>
        <MonthStrip value={month} onChange={setMonth} label="Claims for" />
        <span className="toolbar-end"><Freshness at={r.at} error={r.error} reload={() => void r.reload()} label="Read the claims again" /></span>
      </Toolbar>
      {r.status === 'error' && !r.data ? <LoadError what="The claims" error={r.error} retry={() => void r.reload()} />
        : !r.data ? <Loading label="Reading the claims" lines={1} />
        : <ClaimsView m={r.data} />}
    </div>
  );
}

function ClaimsView({ m }: { m: ClaimsModel }) {
  const [status, setStatus] = useState<'all' | ClaimStatus>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Claim | null>(null);
  const [notice, setNotice] = useState('');
  const withClaim = m.claims.filter(c => c.status !== 'none');
  const by = (s: ClaimStatus) => m.claims.filter(c => c.status === s);
  const claimed = withClaim.reduce((s, c) => s + c.claimed, 0);
  const waiting = by('pending');
  const noPlan = m.claims.reduce((s, c) => s + c.noPlan, 0);
  const noBill = m.claims.reduce((s, c) => s + c.noBill, 0);
  const rows = useMemo(() => m.claims
    .filter(c => status === 'all' ? c.status !== 'none' : c.status === status)
    .filter(c => !q.trim() || `${c.name} ${c.hq}`.toLowerCase().includes(q.trim().toLowerCase())), [m, status, q]);
  const { shown, more } = useShowMore(rows, 50);
  const label = `${monthName(m.month)} ${m.month.slice(0, 4)}`;
  const current = open ? m.claims.find(c => c.personId === open.personId) ?? open : null;

  return (
    <Arrive>
      <Summary>
        {withClaim.length === 0 ? `No claims for ${label} yet.` : <>
          <strong>{rupees(claimed)} claimed</strong> by {count(withClaim.filter(c => c.claimed).length, 'person', 'people')} for {label}.
          {waiting.length ? <> {count(waiting.length, 'claim waits', 'claims wait')} for a decision, {rupees(waiting.reduce((s, c) => s + c.waiting, 0))}.</> : ' Nothing waits for a decision.'}
          {noPlan ? <> <span className="warn-text">{count(noPlan, 'day was', 'days were')} claimed with no day plan.</span></> : ''}
          {noBill ? <> <span className="warn-text">{count(noBill, 'day', 'days')} above {rupees(m.billAbove)} {noBill === 1 ? 'has' : 'have'} no bill.</span></> : ''}
        </>}
      </Summary>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Find a person" label="Find a person" />
        <Segmented label="Status" value={status} onChange={setStatus} options={[
          { value: 'all', label: 'All', count: withClaim.length }, { value: 'pending', label: 'Waiting', count: waiting.length },
          { value: 'approved', label: 'Approved', count: by('approved').length }, { value: 'draft', label: 'Not sent', count: by('draft').length },
          { value: 'rejected', label: 'Rejected', count: by('rejected').length }, { value: 'none', label: 'No claim', count: by('none').length },
        ]} />
      </Toolbar>
      {withClaim.length === 0 && status === 'all' ? (
        <Empty title={`No claims for ${label}`}>People file each day's expenses on the phone and send the month when it ends; the claims appear here, day by day.</Empty>
      ) : rows.length === 0 ? <div className="list-empty"><Empty title="Nothing matches">Try another status or name.</Empty></div> : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr>
                <th scope="col">Person</th><th scope="col" className="num">Days claimed</th><th scope="col" className="num">Claimed</th>
                <th scope="col" className="hide-narrow">To look at</th><th scope="col">Status</th>
              </tr></thead>
              <tbody>
                {shown.map(c => {
                  const st = CLAIM_STATUS[c.status];
                  const flags = [c.noPlan && count(c.noPlan, 'day', 'days') + ' with no day plan', c.noBill && count(c.noBill, 'day', 'days') + ' with no bill'].filter(Boolean);
                  return (
                    <tr key={c.personId} className="clickable" onClick={() => setOpen(c)}>
                      <th scope="row">
                        <button type="button" className="cell-link cell-button" aria-haspopup="dialog" onClick={e => { e.stopPropagation(); setOpen(c); }}>{c.name}</button>
                        <span className="cell-sub">{[c.hq, c.manager !== 'nobody' && `reports to ${c.manager}`].filter(Boolean).join(' · ')}</span>
                      </th>
                      <td className="num">{c.daysClaimed}<span className="cell-sub-inline"> of {c.daysWorked} worked</span></td>
                      <td className="num">{c.claimed ? rupees(c.claimed) : c.daysClaimed ? <span className="cell-quiet">{rupees(c.days.reduce((s, d) => s + (d.expense?.amount ?? 0), 0))} on the phone</span> : <span className="cell-quiet">None</span>}</td>
                      <td className="hide-narrow">{flags.length ? <span className="warn-text">{flags.join(', ')}</span> : null}</td>
                      <td><Pill tone={st.tone}>{st.word}</Pill>{c.sentAt && c.status !== 'draft' && <span className="cell-sub">sent {ago(c.sentAt)}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {more}
        </>
      )}
      <p className="block-note">The daily allowance is {rupees(m.allowance)}{m.billAbove ? `, and a bill is expected for any day above ${rupees(m.billAbove)}` : ''}. Both are set in <Link className="link" to="/settings/rules">company rules</Link>.</p>
      <ClaimDrawer c={current} m={m} onClose={() => setOpen(null)} onDecided={msg => { setNotice(msg); invalidate('money:', 'home:'); void approvalsStore.load(); }} />
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </Arrive>
  );
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayWords(d: ClaimDay) {
  if (d.kind === 'worked') return d.place ? `Worked, ${d.place}` : 'Worked';
  if (d.kind === 'leave') return 'On leave';
  if (d.kind === 'holiday') return d.holiday ?? 'Holiday';
  if (d.kind === 'weekOff') return 'Week off';
  return 'No day plan';
}

function ClaimDrawer({ c, m, onClose, onDecided }: { c: Claim | null; m: ClaimsModel; onClose: () => void; onDecided: (msg: string) => void }) {
  const allowed = useCan();
  const [ask, setAsk] = useState<null | boolean>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [billProblem, setBillProblem] = useState('');
  const [showAll, setShowAll] = useState(false);
  if (!c) return <Drawer open={false} onClose={onClose} title="">{null}</Drawer>;
  const label = `${monthName(m.month)} ${m.month.slice(0, 4)}`;
  const pending = c.days.flatMap(d => d.expense?.status === 'pending' ? [d.expense] : []);
  const days = showAll ? c.days : c.days.filter(d => d.expense || d.kind === 'worked');
  const decide = async (approve: boolean, reason: string) => {
    setBusy(true);
    setProblem('');
    try {
      await decideClaim(pending.map(p => p.id), approve, reason);
      setAsk(null);
      onClose();
      onDecided(`${c.name}'s ${count(pending.length, 'day')} for ${label} ${approve ? 'approved' : 'rejected'}; they get one message.`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const bill = (p: string) => { setBillProblem(''); openFile(() => billUrl(p)).catch(e => setBillProblem(e instanceof Error ? e.message : String(e))); };

  return (
    <Drawer open onClose={onClose} wide title={`${c.name}, ${label}`}
      sub={`${rupees(c.days.reduce((s, d) => s + (d.expense?.amount ?? 0), 0))} over ${count(c.daysClaimed, 'day')}; ${count(c.daysWorked, 'day')} worked. ${CLAIM_STATUS[c.status].word}.`}
      footer={pending.length && allowed('approvals') ? <>
        <button type="button" className="btn btn-secondary" onClick={() => setAsk(false)}>Reject</button>
        <button type="button" className="btn btn-primary" onClick={() => setAsk(true)}>Approve {count(pending.length, 'day')}, {rupees(pending.reduce((s, p) => s + p.amount, 0))}</button>
      </> : undefined}>
      {(c.noPlan > 0 || c.noBill > 0) && (
        <ul className="consequences claim-flags">
          {c.noPlan > 0 && <li className="warn-text">{count(c.noPlan, 'day is', 'days are')} claimed with no day plan behind {c.noPlan === 1 ? 'it' : 'them'}.</li>}
          {c.noBill > 0 && <li className="warn-text">{count(c.noBill, 'day is', 'days are')} above {rupees(m.billAbove)} with no bill.</li>}
        </ul>
      )}
      <div className="table-wrap">
        <table className="table claim-days">
          <caption className="visually-hidden">Each day of {label}: what the day was and what was claimed</caption>
          <thead><tr><th scope="col">Day</th><th scope="col">The day</th><th scope="col" className="num">Claimed</th><th scope="col">For</th><th scope="col"><span className="visually-hidden">Bill and status</span></th></tr></thead>
          <tbody>
            {days.map(d => {
              const x = d.expense;
              const odd = x && d.kind !== 'worked';
              const missing = x && m.billAbove && x.amount > m.billAbove && !x.bills.length;
              return (
                <tr key={d.date}>
                  <th scope="row" className="claim-date"><span>{Number(d.date.slice(8))}</span> <span className="cell-quiet">{WEEKDAY[weekdayOf(d.date)]}</span></th>
                  <td>{odd ? <span className="warn-text">{dayWords(d)}</span> : <span className={d.kind === 'worked' ? '' : 'cell-quiet'}>{dayWords(d)}</span>}</td>
                  <td className="num">{x ? rupees(x.amount) : <span className="cell-quiet">{d.kind === 'worked' ? 'Nothing' : ''}</span>}</td>
                  <td>{x ? <>{x.categories.join(', ')}{(x.travel || x.note) && <span className="cell-sub">{[x.travel, x.note].filter(Boolean).join(' · ')}</span>}</> : null}</td>
                  <td><span className="claim-end">
                    {x && x.bills.map((p, i) => <button key={p} type="button" className="link" onClick={() => bill(p)}><Paperclip size={13} aria-hidden="true" /> {x.bills.length === 1 ? 'Bill' : `Bill ${i + 1}`}</button>)}
                    {missing ? <span className="warn-text">No bill</span> : null}
                    {x && x.status !== c.status && <span className="cell-quiet">{CLAIM_STATUS[x.status as ClaimStatus]?.word ?? x.status}</span>}
                  </span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" className="link show-days" onClick={() => setShowAll(s => !s)}>{showAll ? 'Show only days worked or claimed' : 'Show every day of the month'}</button>
      {billProblem && <p className="form-error" role="alert">{billProblem}</p>}
      {c.trail.length > 0 && (
        <section className="drawer-section">
          <h3 className="section-title">Decisions</h3>
          <ul className="rows">
            {groupTrail(c.trail).map((t, i) => (
              <li key={i} className="row"><div className="row-main"><p className="row-title">{t.by} {t.action} {count(t.n, 'day')}</p>{t.reason && <p className="row-sub">“{t.reason}”</p>}</div><span className="row-meta">{ago(t.at)}</span></li>
            ))}
          </ul>
        </section>
      )}
      <Confirm open={ask != null} title={ask ? `Approve ${c.name}'s claim?` : `Reject ${c.name}'s claim?`} confirmLabel={ask ? 'Approve the claim' : 'Reject the claim'} danger={ask === false} busy={busy} error={problem}
        reason={ask ? undefined : { label: 'Why it is rejected', required: true, placeholder: 'For example: the 14th was a holiday with no day plan; send it again without that day.' }}
        onCancel={() => setAsk(null)} onConfirm={reason => void decide(Boolean(ask), reason)}>
        {`${count(pending.length, 'day')} waiting, ${rupees(pending.reduce((s, p) => s + p.amount, 0))}. ${c.name} gets one message${ask ? '.' : ' with your reason, and can send the days again.'}`}
      </Confirm>
    </Drawer>
  );
}

/** One decision on many days is one line: "Ravi approved 22 days". */
function groupTrail(trail: Claim['trail']) {
  const out: { by: string; action: string; reason: string | null; at: string; n: number }[] = [];
  for (const t of trail) {
    const last = out[out.length - 1];
    if (last && last.by === t.by && last.action === t.action && last.reason === t.reason && Math.abs(Date.parse(last.at) - Date.parse(t.at)) < 60_000) last.n++;
    else out.push({ ...t, n: 1 });
  }
  return out.reverse();
}

