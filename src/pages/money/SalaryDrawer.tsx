import { useEffect, useMemo, useState } from 'react';
import { howWorked, monthOf, setSalary, structureFor, type Component, type Salary, type Structure } from '../../live/pay';
import { IST_TODAY, dayMonth } from '../../lib/days';
import { rupees } from '../../lib/format';
import { Drawer, Field, useFocusFirstError } from '../../components/kit';

/**
 * Set or revise one person's salary from a date. It starts from their role's
 * structure (or their salary now); every figure can be changed; the month's
 * gross, deductions and net are worked out as the office types, with the same
 * arithmetic the payroll uses. Saving adds a dated row: the old salary stays
 * in the history, and payslips already released are never touched.
 */
export function SalaryDrawer({ open, person, current, components, structures, onClose, onDone }: {
  open: boolean;
  person: { id: string; name: string; designationId: string | null } | null;
  current: Salary | null;
  components: Component[];
  structures: Structure[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const today = IST_TODAY();
  const firstOfNext = (() => { const [y, m] = today.split('-').map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`; })();
  const active = components.filter(c => c.active);
  const [structureId, setStructureId] = useState('');
  const [basic, setBasic] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [from, setFrom] = useState(firstOfNext);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);

  const fillFrom = (basicFigure: number, vals: Record<string, number>) => {
    setBasic(String(basicFigure || ''));
    setValues(Object.fromEntries(active.map(c => [c.id, String(vals[c.id] ?? c.amount)])));
  };

  useEffect(() => {
    if (!open || !person) return;
    setProblem(''); setAttempt(0); setNote('');
    setFrom(current ? firstOfNext : `${today.slice(0, 7)}-01`);
    const s = current ? null : structureFor(person.designationId, structures);
    setStructureId(current?.structureId ?? s?.id ?? '');
    if (current) fillFrom(current.basic, current.values);
    else if (s) fillFrom(s.basic, s.values);
    else fillFrom(0, {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, person?.id]);

  const num = (v: string) => Number(v.replace(/[₹,\s%]/g, ''));
  const parsed = useMemo(() => Object.fromEntries(active.map(c => [c.id, num(values[c.id] ?? String(c.amount))])), [values, active]);
  const month = monthOf(num(basic) || 0, parsed, active);

  const errors = {
    basic: !(num(basic) > 0) ? 'Write the monthly basic.' : undefined,
    from: !from ? 'Say from when this salary applies.' : undefined,
    values: active.some(c => !(parsed[c.id] >= 0) || (c.calc === 'percent_of_basic' && parsed[c.id] > 100)) ? 'Each figure is 0 or more, and a percentage of basic at most 100.' : undefined,
  };
  const formRef = useFocusFirstError(errors, attempt);

  const pickStructure = (id: string) => {
    setStructureId(id);
    const s = structures.find(x => x.id === id);
    if (s) fillFrom(s.basic, s.values);
  };

  const save = async () => {
    setAttempt(a => a + 1);
    if (!person || Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setProblem('');
    try {
      // Only figures that differ from the company's default are kept as the person's own.
      const own = Object.fromEntries(active.filter(c => parsed[c.id] !== c.amount).map(c => [c.id, parsed[c.id]]));
      await setSalary({ employeeId: person.id, from, basic: num(basic), values: own, structureId: structureId || null, note });
      onDone(`${person.name}'s salary is set from ${dayMonth(from)}: ${rupees(month.net)} net a month.`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onClose={onClose} wide
      title={current ? `Revise ${person?.name ?? ''}'s salary` : `Set ${person?.name ?? ''}'s salary`}
      sub={current ? `Now ${rupees(monthOf(current.basic, current.values, active).net)} net a month, since ${dayMonth(current.from)}. The new salary is a new dated row; the history stays.` : 'Their first salary. Payroll uses it for every month from the date below.'}
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : current ? 'Save the revision' : 'Save the salary'}</button></>}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        <Field label="Start from" optional help="A structure fills every figure below; change any of them for this person.">{x => (
          <select {...x} className="input" value={structureId} onChange={e => pickStructure(e.target.value)}>
            <option value="">Their own figures</option>
            {structures.map(s => <option key={s.id} value={s.id}>{s.name}{s.designationId ? ` · ${s.designation}` : ' · every role'}</option>)}
          </select>
        )}</Field>
        <div className="form-row">
          <Field label="Monthly basic" error={attempt ? errors.basic : undefined}>{x => <input {...x} className="input" inputMode="numeric" value={basic} onChange={e => setBasic(e.target.value)} placeholder="20,000" />}</Field>
          <Field label="Applies from" error={attempt ? errors.from : undefined} help="Payroll uses it for this month onward.">{x => <input {...x} type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />}</Field>
        </div>
        {active.length > 0 && (
          <fieldset className="pay-fields">
            <legend className="field-label">Components</legend>
            {active.map(c => (
              <label key={c.id} className="pay-field">
                <span className="pay-field-name">{c.name}<span className="cell-sub">{c.kind === 'earning' ? 'Earning' : 'Deduction'}, company {howWorked(c)}</span></span>
                <span className="pay-field-input">
                  <input className="input" inputMode="decimal" value={values[c.id] ?? ''} aria-label={`${c.name}, ${c.calc === 'percent_of_basic' ? 'percent of basic' : 'rupees a month'}`}
                    onChange={e => setValues(v => ({ ...v, [c.id]: e.target.value }))} />
                  <span className="pay-field-unit">{c.calc === 'percent_of_basic' ? '% of basic' : '₹ a month'}</span>
                </span>
              </label>
            ))}
            {attempt > 0 && errors.values && <p className="form-error">{errors.values}</p>}
          </fieldset>
        )}
        <Field label="Why" optional help="Kept with the revision, and in the audit log.">{x => <input {...x} className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="For example: annual increment, April" />}</Field>
        <div className="pay-total" aria-live="polite">
          <p><span>Gross a month</span><strong>{rupees(month.gross)}</strong></p>
          <p><span>Deductions</span><strong>{rupees(month.deductions)}</strong></p>
          <p className="pay-net"><span>Net a month</span><strong>{rupees(month.net)}</strong></p>
          <p className="form-help">For a full month; Payroll takes off loss-of-pay days.</p>
        </div>
        {problem && <p className="form-error" role="alert">It was not saved. {problem}</p>}
      </form>
    </Drawer>
  );
}
