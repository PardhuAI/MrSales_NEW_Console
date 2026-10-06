import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from '@phosphor-icons/react';
import { invalidate, useResource } from '../../data/resource';
import {
  howWorked, loadPaySetup, loadPersonalRules, mayPay, monthOf, saveComponent, saveStructure,
  type Component, type PaySetup as PaySetupModel, type Role, type Structure,
} from '../../live/pay';
import { loadExpenseRules, saveExpenseRule, type ExpenseRule } from '../../live/settings';
import { count, rupees } from '../../lib/format';
import { Drawer, Field, Notice, Pill, Summary, useFocusFirstError } from '../../components/kit';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useMe } from '../../live/session';

const EXPENSE_ROLES = ['owner', 'admin', 'finance'];
const num = (v: string) => Number(v.replace(/[₹,\s%]/g, ''));

type Model = { pay: PaySetupModel | null; rules: ExpenseRule[]; personal: Awaited<ReturnType<typeof loadPersonalRules>>; roles: Role[] };

/**
 * Pay and expenses: what a salary is made of (components with the company's
 * figure), a starting salary for each role, and each role's daily allowance,
 * bill threshold and monthly ceiling. A person's own salary and own expense
 * rule are set on their record. Pay is seen by owner, HR and finance only.
 */
export function PaySetup() {
  const me = useMe();
  const pay = mayPay(me.role);
  const r = useResource<Model>(`settings:pay:${pay}`, async () => {
    const [p, rules, personal] = await Promise.all([loadPaySetup(), loadExpenseRules(), loadPersonalRules()]);
    return { pay: pay ? p : null, rules, personal, roles: p.roles };
  });
  if (r.status === 'error' && !r.data) return <LoadError what="Pay and expenses" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading pay and expenses" lines={2} />;
  return <View m={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function View({ m, at, error, reload }: { m: Model; at: Date | null; error: string; reload: () => void }) {
  const me = useMe();
  const mayExpense = EXPENSE_ROLES.includes(me.role);
  const [component, setComponent] = useState<Component | 'new' | null>(null);
  const [structure, setStructure] = useState<Structure | 'new' | null>(null);
  const [rule, setRule] = useState<ExpenseRule | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  const done = (msg: string) => { setComponent(null); setStructure(null); setRule(null); setNotice(msg); invalidate('settings:pay:', 'money:', 'team:person:'); };
  const active = m.pay?.components.filter(c => c.active) ?? [];
  const roleRules = m.rules.filter(r => r.designationId);
  const companyRule = m.rules.find(r => !r.designationId);

  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read pay and expenses again" />}>
        {m.pay ? <><strong>A salary is the basic and {count(active.length, 'component')}.</strong> {m.pay.structures.length ? `${count(m.pay.structures.length, 'role has', 'roles have')} a starting salary.` : 'No role has a starting salary yet.'} </> : null}
        {roleRules.length ? `${count(roleRules.length, 'role has', 'roles have')} its own expense allowance` : 'Every role uses the company allowance'}{m.personal.length ? `, and ${count(m.personal.length, 'person has', 'people have')} their own.` : '.'}
      </Summary>
      <Arrive className="pay-setup">
        {m.pay && (
          <section aria-labelledby="pay-components">
            <div className="pay-head">
              <h2 id="pay-components" className="fig-title">What a salary is made of</h2>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setComponent('new')}><Plus size={14} weight="bold" aria-hidden="true" /> Add a component</button>
            </div>
            {m.pay.components.length === 0 ? <Empty title="No components yet">Add earnings like HRA and conveyance, and deductions like PF and professional tax. Each has a company figure that a person's salary can change.</Empty> : (
              <div className="table-wrap">
                <table className="table compact-table">
                  <thead><tr><th scope="col">Component</th><th scope="col">Kind</th><th scope="col" className="num">Company figure</th><th scope="col"><span className="visually-hidden">Edit</span></th></tr></thead>
                  <tbody>
                    <tr><th scope="row">Basic<span className="cell-sub">set for each person</span></th><td>Earning</td><td className="num cell-quiet">each person's</td><td /></tr>
                    {m.pay.components.map(c => (
                      <tr key={c.id} className={c.active ? '' : 'past'}>
                        <th scope="row">{c.name}{!c.active && <span className="cell-sub">not in use</span>}</th>
                        <td>{c.kind === 'earning' ? 'Earning' : 'Deduction'}</td>
                        <td className="num">{howWorked(c)}</td>
                        <td className="row-action"><button type="button" className="link" onClick={() => setComponent(c)}>Edit</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="block-note">A percentage is of the basic. Loss-of-pay days reduce earnings and percentage deductions; fixed deductions are taken in full.</p>
          </section>
        )}
        {m.pay && (
          <section aria-labelledby="pay-structures">
            <div className="pay-head">
              <h2 id="pay-structures" className="fig-title">Starting salary by role</h2>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setStructure('new')}><Plus size={14} weight="bold" aria-hidden="true" /> Add a structure</button>
            </div>
            {m.pay.structures.length === 0 ? <p className="block-empty">None yet. A structure fills a new person's salary from their role; every figure can still be changed for them.</p> : (
              <ul className="rows hr-list">
                {m.pay.structures.map(s => {
                  const t = monthOf(s.basic, s.values, active);
                  return (
                    <li key={s.id} className="row">
                      <div className="row-main">
                        <p className="row-title">{s.name}{s.isDefault && <> <Pill>Default</Pill></>}</p>
                        <p className="row-sub">{s.designation}: basic {rupees(s.basic)}, gross {rupees(t.gross)}, net {rupees(t.net)} a month</p>
                      </div>
                      <span className="row-actions"><button type="button" className="link" onClick={() => setStructure(s)}>Edit</button></span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="block-note">Each person's own salary is set on <Link className="link" to="/money/salaries">Salaries</Link> or their record.</p>
          </section>
        )}
        <section aria-labelledby="pay-expenses">
          <div className="pay-head">
            <h2 id="pay-expenses" className="fig-title">Expense allowance by role</h2>
            {mayExpense && <button type="button" className="btn btn-secondary btn-small" onClick={() => setRule('new')}><Plus size={14} weight="bold" aria-hidden="true" /> Add a role's rule</button>}
          </div>
          <div className="table-wrap">
            <table className="table compact-table">
              <thead><tr><th scope="col">Who</th><th scope="col" className="num">Daily allowance</th><th scope="col" className="num">Bill needed above</th><th scope="col" className="num">Monthly ceiling</th>{mayExpense && <th scope="col"><span className="visually-hidden">Edit</span></th>}</tr></thead>
              <tbody>
                <tr>
                  <th scope="row">Everyone<span className="cell-sub">unless their role or they have their own</span></th>
                  <td className="num" colSpan={2}><Link className="link" to="/settings/rules">In Company rules</Link></td>
                  <td className="num">{companyRule?.ceiling != null ? rupees(companyRule.ceiling) : <span className="cell-quiet">none</span>}</td>
                  {mayExpense && <td className="row-action"><button type="button" className="link" onClick={() => setRule(companyRule ?? 'new')}>{companyRule ? 'Edit' : 'Set a ceiling'}</button></td>}
                </tr>
                {roleRules.map(r => (
                  <tr key={r.id}>
                    <th scope="row">{r.designation}</th>
                    <td className="num">{rupees(r.allowance)}</td>
                    <td className="num">{rupees(r.billAbove)}</td>
                    <td className="num">{r.ceiling != null ? rupees(r.ceiling) : <span className="cell-quiet">company's</span>}</td>
                    {mayExpense && <td className="row-action"><button type="button" className="link" onClick={() => setRule(r)}>Edit</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {m.personal.length > 0 && (
            <>
              <h3 className="fig-title pay-sub-title">People with their own</h3>
              <ul className="rows hr-list">
                {m.personal.map(p => (
                  <li key={p.employeeId} className="row">
                    <div className="row-main">
                      <p className="row-title"><Link className="cell-link" to={`/team/${p.employeeId}?tab=pay`}>{p.name}</Link></p>
                      <p className="row-sub">{[
                        p.figures.allowance != null && `${rupees(p.figures.allowance)} a day`,
                        p.figures.billAbove != null && `bill above ${rupees(p.figures.billAbove)}`,
                        p.figures.ceiling != null && `${rupees(p.figures.ceiling)} a month at most`,
                      ].filter(Boolean).join(', ')}{p.note ? `. ${p.note}` : ''}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="block-note">The phone and Approvals use the person's own figure first, then their role's, then the company's. A person's own is set on their record, under Pay.</p>
        </section>
      </Arrive>
      {m.pay && <ComponentDrawer open={component != null} component={component === 'new' ? null : component} next={(m.pay.components.at(-1)?.position ?? 0) + 10} onClose={() => setComponent(null)} onDone={done} />}
      {m.pay && <StructureDrawer open={structure != null} structure={structure === 'new' ? null : structure} components={active} roles={m.roles} taken={m.pay.structures} onClose={() => setStructure(null)} onDone={done} />}
      <ExpenseRuleDrawer open={rule != null} rule={rule === 'new' ? null : rule} roles={m.roles} taken={m.rules} onClose={() => setRule(null)} onDone={done} />
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

function ComponentDrawer({ open, component, next, onClose, onDone }: { open: boolean; component: Component | null; next: number; onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState({ name: '', kind: 'earning' as Component['kind'], calc: 'fixed' as Component['calc'], amount: '', active: true });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    setF({ name: component?.name ?? '', kind: component?.kind ?? 'earning', calc: component?.calc ?? 'fixed', amount: component ? String(component.amount) : '', active: component?.active ?? true });
    setProblem(''); setAttempt(0);
  }, [open, component]);
  const errors = {
    name: f.name.trim().length < 2 ? 'Name the component, for example HRA.' : /^basic$/i.test(f.name.trim()) ? 'Basic is set for each person; name this something else.' : undefined,
    amount: f.amount.trim() === '' || !(num(f.amount) >= 0) ? 'Write the company figure; 0 is allowed.' : f.calc === 'percent_of_basic' && num(f.amount) > 100 ? 'A percentage of basic is at most 100.' : undefined,
  };
  const formRef = useFocusFirstError(errors, attempt);
  const save = async () => {
    setAttempt(a => a + 1);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true); setProblem('');
    try {
      await saveComponent({ id: component?.id, name: f.name, kind: f.kind, calc: f.calc, amount: num(f.amount), position: component?.position ?? next, active: f.active });
      onDone(`${f.name.trim()} is saved. Payslips not yet released use it.`);
    } catch (e) { setProblem(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <Drawer open={open} onClose={onClose} title={component ? `Edit ${component.name}` : 'Add a component'} sub="Its company figure applies to everyone whose salary does not set their own."
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save the component'}</button></>}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        <Field label="Name" error={attempt ? errors.name : undefined}>{x => <input {...x} className="input" value={f.name} placeholder="HRA" onChange={e => setF(v => ({ ...v, name: e.target.value }))} />}</Field>
        <div className="form-row">
          <Field label="Kind">{x => <select {...x} className="input" value={f.kind} onChange={e => setF(v => ({ ...v, kind: e.target.value as Component['kind'] }))}><option value="earning">Earning</option><option value="deduction">Deduction</option></select>}</Field>
          <Field label="Worked out as">{x => <select {...x} className="input" value={f.calc} onChange={e => setF(v => ({ ...v, calc: e.target.value as Component['calc'] }))}><option value="fixed">Rupees a month</option><option value="percent_of_basic">Percent of basic</option></select>}</Field>
        </div>
        <Field label={f.calc === 'fixed' ? 'Company figure, ₹ a month' : 'Company figure, % of basic'} error={attempt ? errors.amount : undefined}>{x => <input {...x} className="input" inputMode="decimal" value={f.amount} placeholder={f.calc === 'fixed' ? '1,600' : '40'} onChange={e => setF(v => ({ ...v, amount: e.target.value }))} />}</Field>
        <label className="check-line"><input type="checkbox" checked={f.active} onChange={e => setF(v => ({ ...v, active: e.target.checked }))} /> In use</label>
        {component && !f.active && <p className="form-note">Not in use, it is left off every payslip from now on; released payslips keep it.</p>}
        {problem && <p className="form-error" role="alert">It was not saved. {problem}</p>}
      </form>
    </Drawer>
  );
}

function StructureDrawer({ open, structure, components, roles, taken, onClose, onDone }: {
  open: boolean; structure: Structure | null; components: Component[]; roles: Role[]; taken: Structure[]; onClose: () => void; onDone: (m: string) => void;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [basic, setBasic] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [isDefault, setIsDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    setName(structure?.name ?? ''); setRole(structure?.designationId ?? ''); setBasic(structure ? String(structure.basic) : '');
    setValues(Object.fromEntries(components.map(c => [c.id, String(structure?.values[c.id] ?? c.amount)])));
    setIsDefault(structure?.isDefault ?? taken.length === 0);
    setProblem(''); setAttempt(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, structure]);
  const parsed = Object.fromEntries(components.map(c => [c.id, num(values[c.id] ?? String(c.amount))]));
  const t = monthOf(num(basic) || 0, parsed, components);
  const clash = role && taken.find(s => s.designationId === role && s.id !== structure?.id);
  const errors = {
    name: name.trim().length < 2 ? 'Name the structure, for example MR standard.' : undefined,
    role: clash ? `${clash.name} is already the structure for this role; edit that one.` : undefined,
    basic: !(num(basic) > 0) ? 'Write the monthly basic.' : undefined,
    values: components.some(c => !(parsed[c.id] >= 0) || (c.calc === 'percent_of_basic' && parsed[c.id] > 100)) ? 'Each figure is 0 or more, and a percentage of basic at most 100.' : undefined,
  };
  const formRef = useFocusFirstError(errors, attempt);
  const save = async () => {
    setAttempt(a => a + 1);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true); setProblem('');
    try {
      const own = Object.fromEntries(components.filter(c => parsed[c.id] !== c.amount).map(c => [c.id, parsed[c.id]]));
      await saveStructure({ id: structure?.id, designationId: role || null, name, basic: num(basic), values: own, isDefault });
      onDone(`${name.trim()} is saved: ${rupees(t.net)} net a month.`);
    } catch (e) { setProblem(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <Drawer open={open} onClose={onClose} wide title={structure ? `Edit ${structure.name}` : 'Add a structure'} sub="A starting salary. It fills a person's salary when it is set; salaries already set are not changed."
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save the structure'}</button></>}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        <div className="form-row">
          <Field label="Name" error={attempt ? errors.name : undefined}>{x => <input {...x} className="input" value={name} placeholder="MR standard" onChange={e => setName(e.target.value)} />}</Field>
          <Field label="For the role" optional error={attempt ? errors.role : undefined}>{x => <select {...x} className="input" value={role} onChange={e => setRole(e.target.value)}><option value="">Every role</option>{roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}</Field>
        </div>
        <Field label="Monthly basic" error={attempt ? errors.basic : undefined}>{x => <input {...x} className="input" inputMode="numeric" value={basic} placeholder="20,000" onChange={e => setBasic(e.target.value)} />}</Field>
        {components.length > 0 && (
          <fieldset className="pay-fields">
            <legend className="field-label">Components</legend>
            {components.map(c => (
              <label key={c.id} className="pay-field">
                <span className="pay-field-name">{c.name}<span className="cell-sub">{c.kind === 'earning' ? 'Earning' : 'Deduction'}, company {howWorked(c)}</span></span>
                <span className="pay-field-input">
                  <input className="input" inputMode="decimal" value={values[c.id] ?? ''} aria-label={`${c.name}, ${c.calc === 'percent_of_basic' ? 'percent of basic' : 'rupees a month'}`} onChange={e => setValues(v => ({ ...v, [c.id]: e.target.value }))} />
                  <span className="pay-field-unit">{c.calc === 'percent_of_basic' ? '% of basic' : '₹ a month'}</span>
                </span>
              </label>
            ))}
            {attempt > 0 && errors.values && <p className="form-error">{errors.values}</p>}
          </fieldset>
        )}
        <label className="check-line"><input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} /> The default, for roles without their own</label>
        <div className="pay-total" aria-live="polite">
          <p><span>Gross a month</span><strong>{rupees(t.gross)}</strong></p>
          <p><span>Deductions</span><strong>{rupees(t.deductions)}</strong></p>
          <p className="pay-net"><span>Net a month</span><strong>{rupees(t.net)}</strong></p>
        </div>
        {problem && <p className="form-error" role="alert">It was not saved. {problem}</p>}
      </form>
    </Drawer>
  );
}

function ExpenseRuleDrawer({ open, rule, roles, taken, onClose, onDone }: { open: boolean; rule: ExpenseRule | null; roles: Role[]; taken: ExpenseRule[]; onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState({ designationId: '', allowance: '', billAbove: '', ceiling: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  const isNew = !rule;
  useEffect(() => {
    if (!open) return;
    const firstFree = roles.find(r => !taken.some(t => t.designationId === r.id))?.id ?? '';
    setF({ designationId: rule ? rule.designationId ?? '' : firstFree, allowance: rule?.designationId ? String(rule.allowance) : '', billAbove: rule?.designationId ? String(rule.billAbove) : '', ceiling: rule?.ceiling == null ? '' : String(rule.ceiling) });
    setProblem(''); setAttempt(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rule]);
  // The company row carries only a monthly ceiling: the company's allowance and
  // bill threshold have one home, Company rules, so they are never in two places.
  const company = !f.designationId;
  const clash = isNew && taken.find(t => (t.designationId ?? '') === f.designationId);
  const errors = {
    role: clash ? `${clash.designation} already has a rule; edit that one.` : undefined,
    allowance: !company && (f.allowance.trim() === '' || !(num(f.allowance) >= 0)) ? 'Write the daily allowance.' : undefined,
    billAbove: !company && (f.billAbove.trim() === '' || !(num(f.billAbove) >= 0)) ? 'Write the bill threshold.' : undefined,
    ceiling: company && !f.ceiling.trim() ? 'Write the monthly ceiling for everyone.' : f.ceiling.trim() && !(num(f.ceiling) >= 0) ? 'Write a monthly ceiling, or leave it blank.' : undefined,
  };
  const formRef = useFocusFirstError(errors, attempt);
  const roleName = roles.find(r => r.id === f.designationId)?.name ?? 'Everyone';
  const save = async () => {
    setAttempt(a => a + 1);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true); setProblem('');
    try {
      await saveExpenseRule({ id: rule?.id, designationId: f.designationId || null, allowance: company ? 0 : num(f.allowance), billAbove: company ? 0 : num(f.billAbove), ceiling: f.ceiling.trim() ? num(f.ceiling) : null });
      onDone(company ? 'The monthly ceiling for everyone is saved.' : `${roleName}'s expense rule is saved; their phones use it from the next claim.`);
    } catch (e) { setProblem(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <Drawer open={open} onClose={onClose} title={rule ? `Edit ${rule.designation}` : 'Add a role\'s rule'} sub="A role's rule replaces the company allowance and bill threshold for people in that role, on the phone and in Approvals."
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save the rule'}</button></>}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        <Field label="Role" error={attempt ? errors.role : undefined}>{x => (
          <select {...x} className="input" value={f.designationId} disabled={!isNew} onChange={e => setF(v => ({ ...v, designationId: e.target.value }))}>
            <option value="">Everyone (a monthly ceiling only)</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}</Field>
        {company ? (
          <p className="form-note">For everyone, only a monthly ceiling is set here. The company's daily allowance and bill threshold are in <Link className="link" to="/settings/rules">Company rules</Link>.</p>
        ) : (
          <div className="form-row">
            <Field label="Daily allowance" error={attempt ? errors.allowance : undefined}>{x => <input {...x} className="input" inputMode="numeric" value={f.allowance} placeholder="500" onChange={e => setF(v => ({ ...v, allowance: e.target.value }))} />}</Field>
            <Field label="Bill needed above" error={attempt ? errors.billAbove : undefined}>{x => <input {...x} className="input" inputMode="numeric" value={f.billAbove} placeholder="500" onChange={e => setF(v => ({ ...v, billAbove: e.target.value }))} />}</Field>
          </div>
        )}
        <Field label="Monthly ceiling" optional={!company} help="A month's claims above this are refused on the phone." error={attempt ? errors.ceiling : undefined}>{x => <input {...x} className="input" inputMode="numeric" value={f.ceiling} onChange={e => setF(v => ({ ...v, ceiling: e.target.value }))} />}</Field>
        {problem && <p className="form-error" role="alert">It was not saved. {problem}</p>}
      </form>
    </Drawer>
  );
}
