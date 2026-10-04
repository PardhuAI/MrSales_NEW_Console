import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DownloadSimple, Plus } from '@phosphor-icons/react';
import { invalidate, useResource } from '../../data/resource';
import { PAYSLIP_ACCEPT, loadPayroll, payslipProblem, payslipUrl, releasePayslip, type PayRow, type PayrollModel } from '../../live/money';
import { monthName } from '../../live/sales';
import { IST_TODAY, dayMonth, dayOf } from '../../lib/days';
import { count, rupees } from '../../lib/format';
import { download, toCsv } from '../../lib/sheet';
import { openFile } from '../../lib/openFile';
import { Drawer, Field, Notice, SearchBox, Summary, Toolbar, useFocusFirstError, useShowMore } from '../../components/kit';
import { MonthStrip } from '../../components/MonthStrip';
import { Segmented } from '../../components/Segmented';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useMe } from '../../live/session';

const monthsBack = (n: number) => {
  const [y, m] = IST_TODAY().split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
};
const label = (k: string) => `${monthName(k)} ${k.slice(0, 4)}`;

/**
 * Payroll: the payslips released for a month. The database keeps the net pay
 * and the PDF, which the person opens on the phone; the salary itself is
 * worked out in the company's payroll software, so nothing here invents a
 * breakdown it does not have.
 */
export function Payroll() {
  const months = monthsBack(12);
  // Pay for a month is released in the first days of the next one.
  const [month, setMonth] = useState(Number(IST_TODAY().slice(8)) <= 10 ? months[1] : months[0]);
  const r = useResource<PayrollModel>(`money:payroll:${month}`, () => loadPayroll(month));
  return (
    <div className="page-body">
      <Toolbar>
        <MonthStrip value={month} onChange={setMonth} label="Payslips for" />
        <span className="toolbar-end"><Freshness at={r.at} error={r.error} reload={() => void r.reload()} label="Read the payslips again" /></span>
      </Toolbar>
      {r.status === 'error' && !r.data ? <LoadError what="The payslips" error={r.error} retry={() => void r.reload()} />
        : !r.data ? <Loading label="Reading the payslips" lines={1} />
        : <PayrollView m={r.data} />}
    </div>
  );
}

function PayrollView({ m }: { m: PayrollModel }) {
  const me = useMe();
  const mayRelease = ['owner', 'admin', 'hr'].includes(me.role);
  const [show, setShow] = useState<'all' | 'released' | 'waiting'>('all');
  const [q, setQ] = useState('');
  const [releasing, setReleasing] = useState<PayRow | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');
  const released = m.rows.filter(r => r.net != null);
  const waiting = m.rows.filter(r => r.net == null);
  const net = released.reduce((s, r) => s + (r.net ?? 0), 0);
  const rows = useMemo(() => m.rows
    .filter(r => show === 'all' || (show === 'released' ? r.net != null : r.net == null))
    .filter(r => !q.trim() || `${r.name} ${r.code} ${r.hq}`.toLowerCase().includes(q.trim().toLowerCase())), [m, show, q]);
  const { shown, more } = useShowMore(rows, 50);
  const sheet = () => download(`payslips-${m.month}.csv`, toCsv([
    { key: 'code', header: 'Employee code', get: r => String(r.code ?? '') },
    { key: 'name', header: 'Name', get: r => String(r.name ?? '') },
    { key: 'hq', header: 'Headquarters', get: r => String(r.hq ?? '') },
    { key: 'net', header: 'Net pay', get: r => (r.net == null ? '' : String(r.net)) },
    { key: 'released', header: 'Released on', get: r => (r.releasedAt ? dayOf(String(r.releasedAt)) : 'Not released') },
  ], m.rows as unknown as Record<string, unknown>[]));
  const open = (p: string) => { setProblem(''); openFile(() => payslipUrl(p)).catch(e => setProblem(e instanceof Error ? e.message : String(e))); };

  return (
    <Arrive>
      <Summary>
        {m.rows.length === 0 ? 'Nobody is on the roster yet.' : <>
          <strong>{released.length} of {count(m.rows.length, 'person', 'people')}</strong> {released.length === 1 ? 'has a' : 'have a'} payslip for {label(m.month)}{released.length ? `, ${rupees(net)} net` : ''}.
          {waiting.length ? ` ${count(waiting.length, 'person has', 'people have')} none yet.` : ' Everyone has theirs.'}
        </>}
      </Summary>
      <Toolbar>
        {mayRelease && <button type="button" className="btn btn-primary btn-small" onClick={() => setReleasing('new')}><Plus size={14} weight="bold" aria-hidden="true" /> Release a payslip</button>}
        <SearchBox value={q} onChange={setQ} placeholder="Name, code or HQ" label="Find a person" />
        <Segmented label="Show" value={show} onChange={setShow} options={[{ value: 'all', label: 'Everyone', count: m.rows.length }, { value: 'released', label: 'Released', count: released.length }, { value: 'waiting', label: 'Not released', count: waiting.length }]} />
        <button type="button" className="btn btn-secondary btn-small" onClick={sheet}><DownloadSimple size={14} aria-hidden="true" /> Download the month</button>
      </Toolbar>
      {problem && <p className="form-error" role="alert">{problem}</p>}
      {m.rows.length === 0 ? <Empty title="Nobody to pay yet">Add people to the roster; their payslips are released here each month.</Empty>
        : rows.length === 0 ? <div className="list-empty"><Empty title="Nothing matches">Try another name or filter.</Empty></div> : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr>
                  <th scope="col">Person</th><th scope="col" className="num">Net pay</th><th scope="col" className="hide-narrow">Against last month</th>
                  <th scope="col">Released</th>{mayRelease && <th scope="col"><span className="visually-hidden">Release</span></th>}
                </tr></thead>
                <tbody>
                  {shown.map(r => {
                    const diff = r.net != null && r.before != null ? r.net - r.before : null;
                    return (
                      <tr key={r.personId}>
                        <th scope="row"><Link className="cell-link" to={`/team/${r.personId}`}>{r.name}</Link><span className="cell-sub">{[r.code, r.designation, r.hq].filter(Boolean).join(' · ')}</span></th>
                        <td className="num">{r.net != null ? rupees(r.net) : <span className="cell-quiet">Not released</span>}</td>
                        <td className="hide-narrow">{diff == null ? <span className="cell-quiet">{r.net != null ? 'No payslip last month' : ''}</span> : diff === 0 ? <span className="cell-quiet">The same</span> : `${rupees(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'}`}</td>
                        <td>{r.releasedAt ? <>{dayMonth(dayOf(r.releasedAt))}{r.file && <> · <button type="button" className="link" onClick={() => open(r.file!)}>Open the PDF</button></>}</> : <span className="cell-quiet">Not yet</span>}</td>
                        {mayRelease && <td className="row-action"><button type="button" className="link" onClick={() => setReleasing(r)}>{r.net != null ? 'Release again' : 'Release'}</button></td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {more}
          </>
        )}
      <p className="block-note">A payslip holds the net pay and, when attached, the PDF from your payroll software. The person opens it on the phone once it is released.</p>
      <ReleaseDrawer open={releasing != null} row={releasing === 'new' ? null : releasing} m={m}
        onClose={() => setReleasing(null)} onDone={msg => { setReleasing(null); setNotice(msg); invalidate('money:payroll:', 'team:'); }} />
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </Arrive>
  );
}

function ReleaseDrawer({ open, row, m, onClose, onDone }: { open: boolean; row: PayRow | null; m: PayrollModel; onClose: () => void; onDone: (msg: string) => void }) {
  const me = useMe();
  const [who, setWho] = useState('');
  const [amount, setAmount] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    setWho(row?.personId ?? '');
    setAmount(row?.net != null ? String(row.net) : '');
    setFile(null); setProblem(''); setAttempt(0);
  }, [open, row]);
  const person = m.rows.find(r => r.personId === who);
  const n = Number(amount.replace(/[₹,\s]/g, ''));
  const errors = {
    who: !who ? 'Choose whose payslip this is.' : undefined,
    amount: !amount.trim() || !Number.isFinite(n) || n <= 0 ? 'Write the net pay, in rupees.' : undefined,
    file: file ? payslipProblem(file) ?? undefined : undefined,
  };
  const formRef = useFocusFirstError(errors, attempt);
  const save = async () => {
    setAttempt(a => a + 1);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setProblem('');
    try {
      await releasePayslip(me.orgId, who, m.month, Math.round(n), file);
      onDone(`${person?.name ?? 'Their'}'s payslip for ${label(m.month)} is released${file ? ' with the PDF' : ''}; they see it on the phone.`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} title={`Release a payslip for ${label(m.month)}`} sub="The net pay, and the PDF from your payroll software if you have it."
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Releasing…' : 'Release the payslip'}</button></>}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        <Field label="Person" error={attempt ? errors.who : undefined}>{x => (
          <select {...x} className="input" value={who} onChange={e => { setWho(e.target.value); const r = m.rows.find(y => y.personId === e.target.value); setAmount(r?.net != null ? String(r.net) : ''); }}>
            <option value="">Choose a person</option>
            {m.rows.map(r => <option key={r.personId} value={r.personId}>{r.name}{r.code ? ` · ${r.code}` : ''}{r.net != null ? ' (released)' : ''}</option>)}
          </select>
        )}</Field>
        <Field label="Net pay" error={attempt ? errors.amount : undefined} help={person?.before != null ? `Last month: ${rupees(person.before)}.` : undefined}>{x => <input {...x} className="input" inputMode="numeric" value={amount} placeholder="₹" onChange={e => setAmount(e.target.value)} />}</Field>
        <Field label="Payslip PDF" optional error={attempt ? errors.file : undefined}>{x => <input {...x} type="file" className="input file-input" accept={PAYSLIP_ACCEPT} onChange={e => setFile(e.target.files?.[0] ?? null)} />}</Field>
        {person?.releasedAt && <p className="form-note">{person.name}'s payslip for {label(m.month)} was released on {dayMonth(dayOf(person.releasedAt))}{person.net != null ? `, ${rupees(person.net)} net` : ''}. Releasing again replaces it.</p>}
        {problem && <p className="form-error" role="alert">It was not released. {problem}</p>}
      </form>
    </Drawer>
  );
}
