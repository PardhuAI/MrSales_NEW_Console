import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DownloadSimple, Plus, Trash } from '@phosphor-icons/react';
import { invalidate, useResource } from '../../data/resource';
import { PAYSLIP_ACCEPT, payslipProblem, payslipUrl, releasePayslip } from '../../live/money';
import { loadCompany, loadPayrollMonth, loadPayslipFor, mayPay, releaseGenerated, withOneOff, type Company, type Line, type PayslipRow } from '../../live/pay';
import { monthName } from '../../live/sales';
import { IST_TODAY, dayMonth, dayOf } from '../../lib/days';
import { count, rupees } from '../../lib/format';
import { download, toCsv } from '../../lib/sheet';
import { openFile } from '../../lib/openFile';
import { payslipPdf } from '../../lib/payslipPdf';
import { Confirm, Drawer, Field, Notice, Pill, SearchBox, Summary, Toolbar, useFocusFirstError, useShowMore } from '../../components/kit';
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

type OneOff = { name: string; kind: Line['kind']; amount: number };
type Change = { lopOverride: number | null; lopReason: string; oneOff: OneOff[]; row: PayslipRow };

/**
 * Payroll: the month for everyone, computed by the database from each
 * person's salary and their attendance (loss of pay for days with nothing
 * declared, unpaid leave, days before joining). HR may correct the loss of pay,
 * with a reason, and add one-off lines; then each payslip becomes a PDF with
 * the company's name, address, GSTIN and logo, and reaches the person's phone.
 * A month can be released again; it replaces what was there, after asking.
 */
export function Payroll() {
  const months = monthsBack(12);
  // Pay for a month is released in the first days of the next one.
  const [month, setMonth] = useState(Number(IST_TODAY().slice(8)) <= 10 ? months[1] : months[0]);
  const r = useResource<PayslipRow[]>(`money:payroll:${month}`, () => loadPayrollMonth(month));
  const company = useResource<Company>('settings:company', loadCompany);
  return (
    <div className="page-body">
      <Toolbar>
        <MonthStrip value={month} onChange={setMonth} label="Payroll for" />
        <span className="toolbar-end"><Freshness at={r.at} error={r.error} reload={() => void r.reload()} label="Work out the month again" /></span>
      </Toolbar>
      {r.status === 'error' && !r.data ? <LoadError what="The payroll" error={r.error} retry={() => void r.reload()} />
        : !r.data ? <Loading label="Working out the month" lines={2} />
        : <PayrollView key={month} month={month} rows={r.data} company={company.data ?? null} />}
    </div>
  );
}

function PayrollView({ month, rows, company }: { month: string; rows: PayslipRow[]; company: Company | null }) {
  const me = useMe();
  const may = mayPay(me.role);
  const [show, setShow] = useState<'all' | 'ready' | 'released' | 'none'>('all');
  const [q, setQ] = useState('');
  const [changes, setChanges] = useState<Record<string, Change>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [uploading, setUploading] = useState<PayslipRow | 'new' | null>(null);
  const [bulk, setBulk] = useState(false);
  const [progress, setProgress] = useState('');
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');

  const effective = (r: PayslipRow) => changes[r.employeeId]?.row ?? r;
  const withSalary = rows.filter(r => r.hasSalary);
  const none = rows.filter(r => !r.hasSalary && !r.releasedAt);
  const released = rows.filter(r => r.releasedAt);
  const ready = withSalary.filter(r => !r.releasedAt);
  // What the month costs: the released figure where one is released, else what it works out to now.
  const toPay = rows.reduce((s, r) => s + (r.releasedAt && r.releasedNet != null ? r.releasedNet : r.hasSalary ? effective(r).net : 0), 0);
  const needle = q.trim().toLowerCase();
  const list = useMemo(() => rows
    .filter(r => show === 'all' || (show === 'ready' ? r.hasSalary && !r.releasedAt : show === 'released' ? r.releasedAt : !r.hasSalary && !r.releasedAt))
    .filter(r => !needle || `${r.name} ${r.code} ${r.hq} ${r.designation}`.toLowerCase().includes(needle)), [rows, show, needle]);
  const { shown, more } = useShowMore(list, 50);

  const release = async (r: PayslipRow) => {
    if (!company) throw new Error('The company details have not been read yet; try again in a moment.');
    const c = changes[r.employeeId];
    const row = c?.row ?? r;
    const pdf = await payslipPdf(company, row, month);
    await releaseGenerated({ orgId: me.orgId, month, employeeId: r.employeeId, pdf, oneOff: c?.oneOff ?? [], lopOverride: c?.lopOverride ?? null, lopReason: c?.lopReason ?? '' });
  };

  const releaseAll = async () => {
    setBulk(false);
    setProblem('');
    const failed: string[] = [];
    for (let i = 0; i < ready.length; i++) {
      setProgress(`Releasing ${i + 1} of ${ready.length}…`);
      try { await release(ready[i]); } catch (e) { failed.push(`${ready[i].name}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    setProgress('');
    invalidate('money:payroll:', 'team:');
    if (failed.length) setProblem(`${count(ready.length - failed.length, 'payslip')} released. Not released: ${failed.join('; ')}`);
    else setNotice(`${count(ready.length, 'payslip')} for ${label(month)} released; each person has theirs on the phone.`);
  };

  const sheet = () => download(`payroll-${month}.csv`, toCsv([
    { key: 'code', header: 'Employee code', get: r => String(r.code ?? '') },
    { key: 'name', header: 'Name', get: r => String(r.name ?? '') },
    { key: 'designation', header: 'Role', get: r => String(r.designation ?? '') },
    { key: 'paid', header: 'Days paid', get: r => String(r.paidDays) },
    { key: 'lop', header: 'Loss-of-pay days', get: r => String(r.lopDays) },
    { key: 'gross', header: 'Gross', get: r => (r.hasSalary ? String(r.gross) : '') },
    { key: 'ded', header: 'Deductions', get: r => (r.hasSalary ? String(r.deductions) : '') },
    { key: 'net', header: 'Net pay', get: r => (r.hasSalary ? String(r.net) : '') },
    { key: 'status', header: 'Status', get: r => (r.releasedAt ? `Released ${dayOf(String(r.releasedAt))}` : r.hasSalary ? 'Ready' : 'No salary') },
  ], rows.map(effective) as unknown as Record<string, unknown>[]));

  const openPdf = (p: string) => { setProblem(''); openFile(() => payslipUrl(p)).catch(e => setProblem(e instanceof Error ? e.message : String(e))); };
  const current = rows.find(r => r.employeeId === open) ?? null;

  return (
    <Arrive>
      <Summary>
        {rows.length === 0 ? 'Nobody is on the roster for this month.' : <>
          <strong>{rupees(toPay)} net</strong> for {count(withSalary.length + released.filter(r => !r.hasSalary).length, 'person', 'people')} in {label(month)}.
          {' '}{released.length ? `${released.length} released` : 'None released yet'}{ready.length ? `, ${ready.length} ready` : ''}.
          {none.length ? <> <span className="warn-text">{count(none.length, 'person has', 'people have')} no salary</span>, so no payslip.</> : ''}
        </>}
      </Summary>
      <Toolbar>
        {may && ready.length > 0 && <button type="button" className="btn btn-primary btn-small" disabled={Boolean(progress)} onClick={() => setBulk(true)}>Generate and release {count(ready.length, 'payslip')}</button>}
        <SearchBox value={q} onChange={setQ} placeholder="Name, code, role or HQ" label="Find a person" />
        <Segmented label="Show" value={show} onChange={setShow} options={[
          { value: 'all', label: 'Everyone', count: rows.length },
          { value: 'ready', label: 'Ready', count: ready.length },
          { value: 'released', label: 'Released', count: released.length },
          { value: 'none', label: 'No salary', count: none.length },
        ]} />
        <button type="button" className="btn btn-secondary btn-small" onClick={sheet}><DownloadSimple size={14} aria-hidden="true" /> Download the month</button>
      </Toolbar>
      {progress && <p className="form-note" role="status">{progress}</p>}
      {problem && <p className="form-error" role="alert">{problem}</p>}
      {rows.length === 0 ? <Empty title="Nobody to pay this month">People appear here from the month they joined.</Empty>
        : list.length === 0 ? <div className="list-empty"><Empty title="Nothing matches">Try another name or filter.</Empty></div> : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr>
                  <th scope="col">Person</th>
                  <th scope="col" className="num">Days paid</th>
                  <th scope="col" className="num hide-narrow">Gross</th>
                  <th scope="col" className="num hide-narrow">Deductions</th>
                  <th scope="col" className="num">Net pay</th>
                  <th scope="col">Status</th>
                </tr></thead>
                <tbody>
                  {shown.map(raw => {
                    const r = effective(raw);
                    const changed = Boolean(changes[raw.employeeId]);
                    return (
                      <tr key={raw.employeeId} className="clickable" onClick={() => raw.hasSalary ? setOpen(raw.employeeId) : undefined}>
                        <th scope="row">
                          {raw.hasSalary ? <button type="button" className="link row-open" onClick={e => { e.stopPropagation(); setOpen(raw.employeeId); }}>{raw.name}</button> : <Link className="cell-link" to={`/team/${raw.employeeId}?tab=pay`}>{raw.name}</Link>}
                          <span className="cell-sub">{[raw.code, raw.designation, raw.hq].filter(Boolean).join(' · ')}</span>
                        </th>
                        <td className="num">{raw.hasSalary ? <>{r.paidDays} of {r.daysInMonth}{r.lopDays > 0 && <span className="cell-sub">{r.lopDays} loss of pay</span>}</> : <span className="cell-quiet">-</span>}</td>
                        <td className="num hide-narrow">{raw.hasSalary ? rupees(r.gross) : ''}</td>
                        <td className="num hide-narrow">{raw.hasSalary ? rupees(r.deductions) : ''}</td>
                        <td className="num">{raw.releasedAt && raw.releasedNet != null ? <><strong>{rupees(raw.releasedNet)}</strong>{raw.hasSalary && raw.releasedNet !== r.net && <span className="cell-sub">now works out {rupees(r.net)}</span>}</> : raw.hasSalary ? <strong>{rupees(r.net)}</strong> : ''}</td>
                        <td onClick={e => e.stopPropagation()}>
                          {raw.releasedAt ? <><Pill tone="good">Released {dayMonth(dayOf(raw.releasedAt))}</Pill>{raw.file && <button type="button" className="link pay-open" onClick={() => openPdf(raw.file!)}>PDF</button>}</>
                            : raw.hasSalary ? <><Pill>Ready</Pill>{changed && <span className="cell-sub">corrected</span>}</>
                            : may ? <span className="pay-none"><Link className="link" to={`/team/${raw.employeeId}?tab=pay`}>Set salary</Link> · <button type="button" className="link" onClick={() => setUploading(raw)}>Upload a payslip</button></span>
                            : <Pill tone="warning">No salary</Pill>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {more}
          </>
        )}
      <p className="block-note">Loss of pay counts days with nothing declared and no leave, holiday or week off, days of unpaid leave, and days before joining. Correct it for a person, with the reason, before releasing.</p>
      {current && (
        <PayslipDrawer key={current.employeeId} open month={month} base={current} change={changes[current.employeeId] ?? null} company={company} may={may}
          onClose={() => setOpen(null)}
          onChange={c => setChanges(x => { const n = { ...x }; if (c) n[current.employeeId] = c; else delete n[current.employeeId]; return n; })}
          onRelease={async () => { await release(current); setOpen(null); setChanges(x => { const n = { ...x }; delete n[current.employeeId]; return n; }); invalidate('money:payroll:', 'team:'); setNotice(`${current.name}'s payslip for ${label(month)} is released; it is on their phone.`); }}
          onOpenPdf={openPdf} />
      )}
      <Confirm open={bulk} title={`Release ${count(ready.length, 'payslip')} for ${label(month)}?`} confirmLabel="Generate and release"
        onCancel={() => setBulk(false)} onConfirm={() => void releaseAll()}>
        <p>{rupees(ready.reduce((s, r) => s + effective(r).net, 0))} net. Each becomes a PDF and reaches the person's phone now, with the corrections you made.</p>
      </Confirm>
      <UploadDrawer open={uploading != null} row={uploading === 'new' ? null : uploading} rows={rows} month={month}
        onClose={() => setUploading(null)} onDone={msg => { setUploading(null); setNotice(msg); invalidate('money:payroll:', 'team:'); }} />
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </Arrive>
  );
}

/** One person's payslip: every line, the days, a corrected loss of pay, one-off lines, the PDF. */
function PayslipDrawer({ open, month, base, change, company, may, onClose, onChange, onRelease, onOpenPdf }: {
  open: boolean; month: string; base: PayslipRow; change: Change | null; company: Company | null; may: boolean;
  onClose: () => void; onChange: (c: Change | null) => void; onRelease: () => Promise<void>; onOpenPdf: (path: string) => void;
}) {
  const [lop, setLop] = useState(change?.lopOverride != null ? String(change.lopOverride) : String(base.lopDays));
  const [reason, setReason] = useState(change?.lopReason ?? '');
  const [oneOff, setOneOff] = useState<OneOff[]>(change?.oneOff ?? []);
  const [computed, setComputed] = useState<PayslipRow>(change?.row ? { ...change.row, lines: change.row.lines.filter(l => !l.oneOff) } : base);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const [again, setAgain] = useState(false);

  const lopN = Number(lop);
  const lopChanged = lop.trim() !== '' && Number.isFinite(lopN) && lopN !== base.lopDays;
  const shownRow = withOneOff(computed, oneOff.filter(o => o.name.trim() && o.amount > 0));

  // A corrected loss of pay is worked out by the database, never here.
  useEffect(() => {
    if (!lopChanged) { setComputed(base); return; }
    if (!(lopN >= 0 && lopN <= base.daysInMonth)) return;
    let live = true;
    const t = window.setTimeout(() => {
      loadPayslipFor(base, month, lopN).then(r => live && setComputed(r), e => live && setProblem(e instanceof Error ? e.message : String(e)));
    }, 300);
    return () => { live = false; window.clearTimeout(t); };
  }, [lop, lopChanged, lopN, base, month]);

  useEffect(() => {
    const clean = oneOff.filter(o => o.name.trim() && o.amount > 0);
    if (!lopChanged && clean.length === 0) { onChange(null); return; }
    onChange({ lopOverride: lopChanged ? lopN : null, lopReason: reason, oneOff: clean, row: shownRow });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computed, oneOff, reason, lopChanged]);

  const errors = {
    lop: lop.trim() === '' || !(lopN >= 0 && lopN <= base.daysInMonth) ? `Between 0 and ${base.daysInMonth}.` : undefined,
    reason: lopChanged && reason.trim().length < 5 ? 'Say why the loss of pay is different; it is kept with the payslip.' : undefined,
    oneOff: oneOff.some(o => (o.name.trim() || o.amount) && (!o.name.trim() || !(o.amount > 0))) ? 'Each one-off line needs a name and an amount above zero.' : undefined,
  };
  const [attempt, setAttempt] = useState(0);
  const formRef = useFocusFirstError(errors, attempt);

  const preview = async () => {
    if (!company) return;
    setBusy('preview'); setProblem('');
    try {
      const blob = await payslipPdf(company, shownRow, month);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { setProblem(e instanceof Error ? e.message : String(e)); } finally { setBusy(''); }
  };
  const doRelease = async () => {
    setAttempt(a => a + 1);
    if (Object.values(errors).some(Boolean)) return;
    if (base.releasedAt && !again) { setAgain(true); return; }
    setBusy('release'); setProblem('');
    try { await onRelease(); } catch (e) { setProblem(e instanceof Error ? e.message : String(e)); setBusy(''); }
  };

  const earnings = shownRow.lines.filter(l => l.kind === 'earning');
  const deductions = shownRow.lines.filter(l => l.kind === 'deduction');
  return (
    <Drawer open={open} onClose={onClose} wide title={`${base.name}, ${label(month)}`}
      sub={[base.code, base.designation, base.hq].filter(Boolean).join(' · ')}
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
        <button type="button" className="btn btn-secondary" disabled={Boolean(busy) || !company} onClick={() => void preview()}>{busy === 'preview' ? 'Making it…' : 'Preview the PDF'}</button>
        {may && <button type="button" className="btn btn-primary" disabled={Boolean(busy)} onClick={() => void doRelease()}>{busy === 'release' ? 'Releasing…' : base.releasedAt ? (again ? 'Yes, replace it' : 'Release again') : 'Generate and release'}</button>}
      </>}>
      <form ref={formRef} className="form" noValidate onSubmit={e => e.preventDefault()}>
        {base.releasedAt && <p className="form-note">Released on {dayMonth(dayOf(base.releasedAt))}{base.releasedNet != null ? `, ${rupees(base.releasedNet)} net` : ''}.{base.file && <> <button type="button" className="link" onClick={() => onOpenPdf(base.file!)}>Open the PDF</button>.</>}{again && ' Releasing again replaces it on their phone.'}</p>}
        <div className="pay-days">
          <p><span>Days in the month</span><strong>{base.daysInMonth}</strong></p>
          <p><span>Days paid</span><strong>{shownRow.paidDays}</strong></p>
          <p><span>Loss of pay</span><strong>{shownRow.lopDays}</strong></p>
        </div>
        {may && (
          <div className="form-row">
            <Field label="Loss-of-pay days" error={attempt || lopChanged ? errors.lop : undefined} help={`Worked out: ${base.lopDays}.`}>{x => <input {...x} className="input" inputMode="decimal" value={lop} onChange={e => setLop(e.target.value)} />}</Field>
            {lopChanged && <Field label="Why it is different" error={attempt ? errors.reason : undefined}>{x => <input {...x} className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="For example: two days at the training, no plan filed" />}</Field>}
          </div>
        )}
        <div className="pay-cols">
          <section>
            <h3 className="fig-title">Earnings</h3>
            <ul className="pay-lines">{earnings.map((l, i) => <li key={i}><span>{l.name}{l.oneOff && <span className="cell-sub">one-off</span>}{!l.oneOff && l.amount !== l.full && <span className="cell-sub">of {rupees(l.full)}</span>}</span><strong>{rupees(l.amount)}</strong></li>)}</ul>
            <p className="pay-sum"><span>Gross</span><strong>{rupees(shownRow.gross)}</strong></p>
          </section>
          <section>
            <h3 className="fig-title">Deductions</h3>
            {deductions.length ? <ul className="pay-lines">{deductions.map((l, i) => <li key={i}><span>{l.name}{l.oneOff && <span className="cell-sub">one-off</span>}</span><strong>{rupees(l.amount)}</strong></li>)}</ul> : <p className="block-empty">None.</p>}
            <p className="pay-sum"><span>Total</span><strong>{rupees(shownRow.deductions)}</strong></p>
          </section>
        </div>
        <p className="pay-net-line"><span>Net pay</span><strong>{rupees(shownRow.net)}</strong></p>
        {may && (
          <fieldset className="pay-fields">
            <legend className="field-label">One-off lines this month</legend>
            {oneOff.map((o, i) => (
              <div key={i} className="pay-oneoff">
                <input className="input" aria-label="What it is" value={o.name} placeholder="Festival bonus, advance recovered" onChange={e => setOneOff(x => x.map((y, j) => j === i ? { ...y, name: e.target.value } : y))} />
                <select className="input" aria-label="Earning or deduction" value={o.kind} onChange={e => setOneOff(x => x.map((y, j) => j === i ? { ...y, kind: e.target.value as Line['kind'] } : y))}>
                  <option value="earning">Earning</option><option value="deduction">Deduction</option>
                </select>
                <input className="input" aria-label="Amount" inputMode="numeric" value={o.amount || ''} placeholder="₹" onChange={e => setOneOff(x => x.map((y, j) => j === i ? { ...y, amount: Number(e.target.value.replace(/[₹,\s]/g, '')) || 0 } : y))} />
                <button type="button" className="icon-btn" aria-label={`Remove ${o.name || 'this line'}`} onClick={() => setOneOff(x => x.filter((_, j) => j !== i))}><Trash size={16} /></button>
              </div>
            ))}
            {attempt > 0 && errors.oneOff && <p className="form-error">{errors.oneOff}</p>}
            <button type="button" className="link" onClick={() => setOneOff(x => [...x, { name: '', kind: 'earning', amount: 0 }])}><Plus size={13} aria-hidden="true" /> Add a one-off line</button>
          </fieldset>
        )}
        {!company && <p className="form-note">Reading the company's details for the PDF…</p>}
        {problem && <p className="form-error" role="alert">{problem}</p>}
      </form>
    </Drawer>
  );
}

/** For someone paid outside Mr Sales: the net pay and the PDF from other payroll software. */
function UploadDrawer({ open, row, rows, month, onClose, onDone }: { open: boolean; row: PayslipRow | null; rows: PayslipRow[]; month: string; onClose: () => void; onDone: (msg: string) => void }) {
  const me = useMe();
  const [who, setWho] = useState('');
  const [amount, setAmount] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    setWho(row?.employeeId ?? '');
    setAmount(row?.releasedNet != null ? String(row.releasedNet) : '');
    setFile(null); setProblem(''); setAttempt(0);
  }, [open, row]);
  const person = rows.find(r => r.employeeId === who);
  const n = Number(amount.replace(/[₹,\s]/g, ''));
  const errors = {
    who: !who ? 'Choose whose payslip this is.' : undefined,
    amount: !amount.trim() || !Number.isFinite(n) || n <= 0 ? 'Write the net pay, in rupees.' : undefined,
    file: !file ? 'Attach the payslip PDF.' : payslipProblem(file) ?? undefined,
  };
  const formRef = useFocusFirstError(errors, attempt);
  const save = async () => {
    setAttempt(a => a + 1);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setProblem('');
    try {
      await releasePayslip(me.orgId, who, month, Math.round(n), file);
      onDone(`${person?.name ?? 'Their'}'s payslip for ${label(month)} is released with the PDF; they see it on the phone.`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} title={`Upload a payslip for ${label(month)}`} sub="For someone paid outside Mr Sales: the net pay and the PDF from your other payroll software."
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Releasing…' : 'Release the payslip'}</button></>}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        <Field label="Person" error={attempt ? errors.who : undefined}>{x => (
          <select {...x} className="input" value={who} onChange={e => setWho(e.target.value)}>
            <option value="">Choose a person</option>
            {rows.map(r => <option key={r.employeeId} value={r.employeeId}>{r.name}{r.code ? ` · ${r.code}` : ''}{r.releasedAt ? ' (released)' : ''}</option>)}
          </select>
        )}</Field>
        <Field label="Net pay" error={attempt ? errors.amount : undefined}>{x => <input {...x} className="input" inputMode="numeric" value={amount} placeholder="₹" onChange={e => setAmount(e.target.value)} />}</Field>
        <Field label="Payslip PDF" error={attempt ? errors.file : undefined}>{x => <input {...x} type="file" className="input file-input" accept={PAYSLIP_ACCEPT} onChange={e => setFile(e.target.files?.[0] ?? null)} />}</Field>
        {problem && <p className="form-error" role="alert">It was not released. {problem}</p>}
      </form>
    </Drawer>
  );
}
