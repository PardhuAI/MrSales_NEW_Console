import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { invalidate, useResource } from '../../data/resource';
import {
  TRAVEL_MODES, loadPersonPay, mayPay, monthOf, savePersonExpense, saveTravelRates,
  type PersonExpense, type PersonPayModel, type TravelRate,
} from '../../live/pay';
import { payslipUrl } from '../../live/money';
import type { Person, PersonRecord as Rec } from '../../live/team';
import { IST_TODAY, dayMonth, dayOf } from '../../lib/days';
import { rupees } from '../../lib/format';
import { openFile } from '../../lib/openFile';
import { Drawer, Field, Notice, useFocusFirstError } from '../../components/kit';
import { LoadError, Loading } from '../../components/States';
import { useMe } from '../../live/session';
import { SalaryDrawer } from '../money/SalaryDrawer';

/** Who sees the tab: pay roles see the salary; the others its expense rule and travel rates. */
export const PAY_TAB_ROLES = ['owner', 'admin', 'hr', 'finance', 'management'];
const EXPENSE_ROLES = ['owner', 'admin', 'finance'];
const TRAVEL_ROLES = ['owner', 'admin', 'hr', 'finance', 'management'];
const SOURCE = { person: 'their own', role: 'their role\'s', company: 'the company\'s', none: '' } as const;
const MODE_LABEL: Record<string, string> = { bike: 'Bike', car: 'Car', bus: 'Bus', train: 'Train', flight: 'Flight', auto: 'Auto', taxi: 'Taxi' };
const monthLabel = (y: number, m: number) => new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

export function PayTab({ p, r }: { p: Person; r: Rec }) {
  const me = useMe();
  const res = useResource<PersonPayModel>(`team:person:${p.id}:pay`, () => loadPersonPay(p.id, me.role));
  if (res.status === 'error' && !res.data) return <LoadError what="Their pay and expenses" error={res.error} retry={() => void res.reload()} />;
  if (!res.data) return <Loading label="Reading their pay" lines={2} />;
  return <PayView p={p} r={r} m={res.data} />;
}

function PayView({ p, r, m }: { p: Person; r: Rec; m: PersonPayModel }) {
  const me = useMe();
  const pay = mayPay(me.role);
  const today = IST_TODAY();
  const [act, setAct] = useState<null | 'salary' | 'expense' | 'travel'>(null);
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState('');
  const done = (msg: string) => { setAct(null); setNotice(msg); invalidate('team:person:', 'money:', 'settings:pay:'); };
  const active = m.setup?.components.filter(c => c.active) ?? [];
  const current = m.salaries.find(s => s.from <= today) ?? null;
  const next = [...m.salaries].reverse().find(s => s.from > today) ?? null;
  const now = current ? monthOf(current.basic, current.values, active) : null;
  const open = (path: string) => { setProblem(''); openFile(() => payslipUrl(path)).catch(e => setProblem(e instanceof Error ? e.message : String(e))); };

  return (
    <div className="rec-body record-grid">
      <div>
        {pay && m.setup && (
          <section className="block">
            <div className="block-head">
              <h3 className="section-title">Salary</h3>
              <span className="block-meta">seen by owner, HR and finance only</span>
            </div>
            {!current && !next ? (
              <div className="block-empty">
                <p>No salary is set, so Payroll leaves them out.</p>
                {p.status === 'active' && <button type="button" className="btn btn-primary btn-small" onClick={() => setAct('salary')}>Set their salary</button>}
              </div>
            ) : (
              <>
                {current && now && (
                  <>
                    <p className="pay-hero"><strong>{rupees(now.net)}</strong> net a month <span className="cell-sub">since {dayMonth(current.from)} {current.from.slice(0, 4)}</span></p>
                    <ul className="pay-lines">
                      {now.lines.map(l => <li key={l.name}><span>{l.name}{l.kind === 'deduction' && <span className="cell-sub">deduction</span>}</span><strong>{l.kind === 'deduction' ? `− ${rupees(l.amount)}` : rupees(l.amount)}</strong></li>)}
                    </ul>
                    <p className="pay-sum"><span>Gross</span><strong>{rupees(now.gross)}</strong></p>
                  </>
                )}
                {next && <p className="form-note">From {dayMonth(next.from)} {next.from.slice(0, 4)}: {rupees(monthOf(next.basic, next.values, active).net)} net a month{next.note ? `, ${next.note}` : ''}.</p>}
                {p.status === 'active' && <div className="block-actions"><button type="button" className="btn btn-secondary btn-small" onClick={() => setAct('salary')}>{next ? 'Change the revision' : 'Revise the salary'}</button></div>}
                {m.salaries.length > 1 && (
                  <>
                    <h4 className="fig-title pay-sub-title">History</h4>
                    <ul className="rows">
                      {m.salaries.map(s => (
                        <li key={s.id} className="row">
                          <div className="row-main"><p className="row-title">From {dayMonth(s.from)} {s.from.slice(0, 4)}</p><p className="row-sub">basic {rupees(s.basic)}{s.note ? ` · ${s.note}` : ''}</p></div>
                          <span className="row-figure">{rupees(monthOf(s.basic, s.values, active).net)} net</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </section>
        )}
        {pay && (
          <section className="block sub-block">
            <div className="block-head"><h3 className="section-title">Payslips</h3><Link className="link block-meta" to="/money/payroll">Payroll</Link></div>
            {r.payslips.length === 0 ? <p className="block-empty">No payslip has been released for them.</p> : (
              <ul className="rows">
                {r.payslips.map(s => (
                  <li key={`${s.year}-${s.month}`} className="row">
                    <div className="row-main">
                      <p className="row-title">{monthLabel(s.year, s.month)}</p>
                      <p className="row-sub">released {dayMonth(dayOf(s.at))}{s.gross != null ? ` · gross ${rupees(s.gross)}, deductions ${rupees(s.deductions ?? 0)}` : ''}</p>
                    </div>
                    <span className="row-figure">{rupees(s.net)} net{s.file && <> · <button type="button" className="link" onClick={() => open(s.file!)}>PDF</button></>}</span>
                  </li>
                ))}
              </ul>
            )}
            {problem && <p className="form-error" role="alert">{problem}</p>}
          </section>
        )}
      </div>
      <div>
        <section className="block">
          <div className="block-head"><h3 className="section-title">Expense allowance</h3></div>
          <dl className="facts">
            <dt>Daily allowance</dt><dd>{rupees(m.expense.applies.allowance)} <span className="cell-sub">{SOURCE[m.expense.from.allowance]}</span></dd>
            <dt>Bill needed above</dt><dd>{m.expense.applies.billAbove != null ? <>{rupees(m.expense.applies.billAbove)} <span className="cell-sub">{SOURCE[m.expense.from.billAbove]}</span></> : 'Every claim'}</dd>
            <dt>Monthly ceiling</dt><dd>{m.expense.applies.ceiling != null ? <>{rupees(m.expense.applies.ceiling)} <span className="cell-sub">{SOURCE[m.expense.from.ceiling]}</span></> : 'None'}</dd>
          </dl>
          {m.expense.own?.note && <p className="block-note">{m.expense.own.note}</p>}
          {EXPENSE_ROLES.includes(me.role) && p.status === 'active' && <div className="block-actions"><button type="button" className="btn btn-secondary btn-small" onClick={() => setAct('expense')}>{m.expense.own ? 'Change their own rule' : 'Give them their own rule'}</button></div>}
          <p className="block-note">Their phone and Approvals use these. The role and company figures are in <Link className="link" to="/settings/pay">Pay and expenses</Link>.</p>
        </section>
        <section className="block sub-block">
          <div className="block-head"><h3 className="section-title">Travel rates</h3><span className="block-meta">₹ a kilometre</span></div>
          {m.travel.filter(t => t.local || t.outstation).length === 0 ? <p className="block-empty">None set. Their manager can also set them from the phone.</p> : (
            <table className="table compact-table">
              <thead><tr><th scope="col">Mode</th><th scope="col" className="num">Local</th><th scope="col" className="num">Outstation</th></tr></thead>
              <tbody>{m.travel.filter(t => t.local || t.outstation).sort((a, b) => TRAVEL_MODES.indexOf(a.mode as never) - TRAVEL_MODES.indexOf(b.mode as never)).map(t => <tr key={t.mode}><th scope="row">{MODE_LABEL[t.mode] ?? t.mode}</th><td className="num">{t.local}</td><td className="num">{t.outstation}</td></tr>)}</tbody>
            </table>
          )}
          {TRAVEL_ROLES.includes(me.role) && p.status === 'active' && <div className="block-actions"><button type="button" className="btn btn-secondary btn-small" onClick={() => setAct('travel')}>Set travel rates</button></div>}
        </section>
      </div>
      {pay && m.setup && (
        <SalaryDrawer open={act === 'salary'} person={{ id: p.id, name: p.name, designationId: p.designationId }} current={next ?? current} components={m.setup.components} structures={m.setup.structures}
          onClose={() => setAct(null)} onDone={done} />
      )}
      <ExpenseDrawer open={act === 'expense'} p={p} e={m.expense} onClose={() => setAct(null)} onDone={done} />
      <TravelDrawer open={act === 'travel'} p={p} rates={m.travel} onClose={() => setAct(null)} onDone={done} />
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

function ExpenseDrawer({ open, p, e, onClose, onDone }: { open: boolean; p: Person; e: PersonExpense; onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState({ allowance: '', billAbove: '', ceiling: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    const s = (v: number | null | undefined) => (v == null ? '' : String(v));
    setF({ allowance: s(e.own?.allowance), billAbove: s(e.own?.billAbove), ceiling: s(e.own?.ceiling), note: e.own?.note ?? '' });
    setProblem(''); setAttempt(0);
  }, [open, e]);
  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/[₹,\s]/g, '')));
  const bad = (v: string) => v.trim() !== '' && !(Number(v.replace(/[₹,\s]/g, '')) >= 0);
  const errors = {
    allowance: bad(f.allowance) ? 'Write an amount, or leave it blank.' : undefined,
    billAbove: bad(f.billAbove) ? 'Write an amount, or leave it blank.' : undefined,
    ceiling: bad(f.ceiling) ? 'Write an amount, or leave it blank.' : undefined,
  };
  const formRef = useFocusFirstError(errors, attempt);
  const empty = !f.allowance.trim() && !f.billAbove.trim() && !f.ceiling.trim();
  const fallback = (k: 'allowance' | 'billAbove' | 'ceiling') => {
    const v = e.from[k] === 'person' ? null : e.applies[k];
    return v == null ? 'none' : rupees(v);
  };
  const save = async () => {
    setAttempt(a => a + 1);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true); setProblem('');
    try {
      await savePersonExpense(p.id, { allowance: num(f.allowance), billAbove: num(f.billAbove), ceiling: num(f.ceiling) }, f.note);
      onDone(empty ? `${p.name} follows their role's expense rule again.` : `${p.name}'s own expense rule is saved; their phone uses it from the next claim.`);
    } catch (err) { setProblem(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  };
  return (
    <Drawer open={open} onClose={onClose} title={`${p.name}'s own expense rule`} sub={`Any figure left blank follows ${e.role ? `the ${e.role} rule` : 'their role'}, then the company's.`}
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : empty && e.own ? 'Remove their own rule' : 'Save'}</button></>}>
      <form ref={formRef} className="form" noValidate onSubmit={ev => { ev.preventDefault(); void save(); }}>
        <Field label="Daily allowance" optional help={e.from.allowance === 'person' ? undefined : `Blank: ${fallback('allowance')}.`} error={attempt ? errors.allowance : undefined}>{x => <input {...x} className="input" inputMode="numeric" value={f.allowance} onChange={ev => setF(v => ({ ...v, allowance: ev.target.value }))} />}</Field>
        <Field label="Bill needed above" optional help={e.from.billAbove === 'person' ? undefined : `Blank: ${fallback('billAbove')}.`} error={attempt ? errors.billAbove : undefined}>{x => <input {...x} className="input" inputMode="numeric" value={f.billAbove} onChange={ev => setF(v => ({ ...v, billAbove: ev.target.value }))} />}</Field>
        <Field label="Monthly ceiling" optional help={e.from.ceiling === 'person' ? undefined : `Blank: ${fallback('ceiling')}.`} error={attempt ? errors.ceiling : undefined}>{x => <input {...x} className="input" inputMode="numeric" value={f.ceiling} onChange={ev => setF(v => ({ ...v, ceiling: ev.target.value }))} />}</Field>
        <Field label="Why" optional help="Kept with the rule and in the audit log.">{x => <input {...x} className="input" value={f.note} placeholder="For example: covers two headquarters" onChange={ev => setF(v => ({ ...v, note: ev.target.value }))} />}</Field>
        {problem && <p className="form-error" role="alert">It was not saved. {problem}</p>}
      </form>
    </Drawer>
  );
}

function TravelDrawer({ open, p, rates, onClose, onDone }: { open: boolean; p: Person; rates: TravelRate[]; onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState<Record<string, { local: string; outstation: string }>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    if (!open) return;
    setF(Object.fromEntries(TRAVEL_MODES.map(m => {
      const r = rates.find(x => x.mode === m);
      return [m, { local: r?.local ? String(r.local) : '', outstation: r?.outstation ? String(r.outstation) : '' }];
    })));
    setProblem('');
  }, [open, rates]);
  const n = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(/[₹,\s]/g, '')));
  const bad = TRAVEL_MODES.some(m => !(n(f[m]?.local ?? '') >= 0) || !(n(f[m]?.outstation ?? '') >= 0));
  const save = async () => {
    if (bad) { setProblem('Each rate is a number of rupees, 0 or more.'); return; }
    setBusy(true); setProblem('');
    try {
      await saveTravelRates(p.id, TRAVEL_MODES.map(m => ({ mode: m, local: n(f[m]?.local ?? ''), outstation: n(f[m]?.outstation ?? '') })));
      onDone(`${p.name}'s travel rates are saved.`);
    } catch (e) { setProblem(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <Drawer open={open} onClose={onClose} title={`${p.name}'s travel rates`} sub="Rupees a kilometre, by how they travel. Blank is 0."
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save the rates'}</button></>}>
      <form className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        <table className="table compact-table travel-table">
          <thead><tr><th scope="col">Mode</th><th scope="col" className="num">Local</th><th scope="col" className="num">Outstation</th></tr></thead>
          <tbody>
            {TRAVEL_MODES.map(m => (
              <tr key={m}>
                <th scope="row">{MODE_LABEL[m]}</th>
                <td className="num"><input className="input" inputMode="decimal" aria-label={`${MODE_LABEL[m]}, local rate`} value={f[m]?.local ?? ''} onChange={e => setF(v => ({ ...v, [m]: { ...v[m], local: e.target.value } }))} /></td>
                <td className="num"><input className="input" inputMode="decimal" aria-label={`${MODE_LABEL[m]}, outstation rate`} value={f[m]?.outstation ?? ''} onChange={e => setF(v => ({ ...v, [m]: { ...v[m], outstation: e.target.value } }))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {problem && <p className="form-error" role="alert">{problem}</p>}
        <p className="block-note">These are kept on their record; the daily allowance does not use them.</p>
      </form>
    </Drawer>
  );
}
