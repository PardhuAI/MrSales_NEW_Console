import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';
import { invalidate, useResource } from '../../data/resource';
import { createPerson, loadRoster, type PersonInput, type RosterModel } from '../../live/team';
import { IST_TODAY } from '../../lib/days';
import { Field, useFocusFirstError } from '../../components/kit';
import { Empty, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useMe } from '../../live/session';
import { mayManagePeople } from './People';

/**
 * Adding a person: who they are, where they are posted and who they report
 * to; exactly what create_employee stores. Their login is a separate step
 * afterwards. A half-filled form is kept in this browser as a draft, so an
 * interruption does not lose it.
 */

const DRAFT_KEY = 'mrsales.joinerDraft';
type Draft = Partial<PersonInput> & { name?: string };

export function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    const d = raw ? (JSON.parse(raw) as Draft) : null;
    return d && Object.values(d).some(v => v) ? d : null;
  } catch {
    return null;
  }
}
const writeDraft = (d: Draft | null) => {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // A draft is a convenience; the form works without one.
  }
};

export function AddPerson() {
  const me = useMe();
  const r = useResource<RosterModel>('team:roster', loadRoster);
  if (!mayManagePeople(me.role)) return <Empty title="Adding people is for owner, admin and HR logins">Ask one of them to add this person, or to change your access.</Empty>;
  if (r.status === 'error' && !r.data) return <LoadError what="The roster" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Getting the form ready" lines={1} />;
  return <Form m={r.data} />;
}

function Form({ m }: { m: RosterModel }) {
  const nav = useNavigate();
  const roles = m.roles.filter(x => x.active);
  const blank: PersonInput = { code: '', name: '', designationId: roles.find(x => x.appView === 'field')?.id ?? roles[0]?.id ?? '', department: 'Sales and marketing', territoryId: m.territories[0]?.id ?? '', hq: m.territories[0]?.hq ?? '', joinedAt: IST_TODAY(), managerId: null, mobile: '', email: '' };
  const [f, setF] = useState<PersonInput>(() => ({ ...blank, ...(readDraft() ?? {}) }));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [done, setDone] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (!done) writeDraft(JSON.stringify(f) === JSON.stringify(blank) ? null : f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, done]);
  const set = <K extends keyof PersonInput>(k: K, v: PersonInput[K]) => setF(x => ({ ...x, [k]: v }));
  const role = m.roles.find(x => x.id === f.designationId);
  const managers = useMemo(() => m.people.filter(p => p.status === 'active' && p.role === 'ASM').sort((a, b) => a.name.localeCompare(b.name)), [m]);
  const codeTaken = m.people.some(p => p.code.toUpperCase() === f.code.trim().toUpperCase());
  const errors = {
    name: f.name.trim().length < 2 ? 'Write their full name, as on their ID.' : undefined,
    code: !f.code.trim() ? 'Give them an employee code; it is how they sign in.' : codeTaken ? `${f.code.trim().toUpperCase()} is already someone's code.` : undefined,
    designationId: !f.designationId ? 'Choose their role. Set up your roles under Settings first.' : undefined,
    email: !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim()) ? 'Write a real email address; their login and password resets go there.' : undefined,
    mobile: f.mobile && !/^[+\d][\d\s-]{6,}$/.test(f.mobile) ? 'Write the mobile number in digits.' : undefined,
    territoryId: !f.territoryId ? 'Choose the territory they are posted to.' : undefined,
    hq: !f.hq.trim() ? 'Write their headquarters town.' : undefined,
    joinedAt: !f.joinedAt ? 'Give the date they joined.' : undefined,
    managerId: role?.appView === 'field' && !f.managerId ? 'Choose who approves their day; without a manager their leave and claims wait for ever.' : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);
  const formRef = useFocusFirstError(errors, attempt);
  const shown = (k: keyof typeof errors) => (attempt ? errors[k] : undefined);

  const save = async () => {
    setAttempt(a => a + 1);
    if (invalid) return;
    setBusy(true);
    setProblem('');
    try {
      const id = await createPerson({ ...f, code: f.code.trim().toUpperCase(), name: f.name.trim(), email: f.email.trim(), hq: f.hq.trim() });
      writeDraft(null);
      invalidate('team:', 'search:index', 'home:', 'field:');
      setDone({ id, name: f.name.trim() });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Arrive className="joined">
        <h2 className="page-title-lg">{done.name} is on the roster</h2>
        <p className="joined-text">They cannot open the app yet. Give them a phone login next: it sets a first password and emails them a link to choose their own.</p>
        <div className="record-actions">
          <Link className="btn btn-primary" to="/settings/logins">Give a phone login</Link>
          <Link className="btn btn-secondary" to={`/team/${done.id}`}>Open their record</Link>
          <button type="button" className="btn btn-secondary" onClick={() => { setDone(null); setF(blank); setAttempt(0); }}>Add another person</button>
        </div>
      </Arrive>
    );
  }

  return (
    <Arrive className="add-person">
      <Link className="link back-link" to="/team"><ArrowLeft size={13} aria-hidden="true" /> People</Link>
      <h2 className="page-title-lg">Add a person</h2>
      <p className="add-lede">Who they are, where they work and who they report to. Their phone login comes after, as its own step.{readDraft() ? ' What you typed earlier is kept in this browser until you add them or clear it.' : ''}</p>
      {roles.length === 0 || m.territories.length === 0 ? (
        <Empty title={roles.length === 0 ? 'Name your roles first' : 'Set up your geography first'}>
          Everyone is added against one of your roles and posted to a territory. {roles.length === 0 ? <Link className="link" to="/settings/roles">Name your roles</Link> : <Link className="link" to="/settings/geography">Add geography</Link>}
        </Empty>
      ) : (
        <form ref={formRef} className="form add-form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
          <fieldset className="add-group">
            <legend className="section-title">Who they are</legend>
            <div className="form-row">
              <Field label="Full name" error={shown('name')}>{p => <input {...p} className="input" autoComplete="off" value={f.name} onChange={e => set('name', e.target.value)} />}</Field>
              <Field label="Employee code" error={shown('code')} help="It never changes; they sign in with it.">{p => <input {...p} className="input" autoComplete="off" value={f.code} placeholder="CL-MR-018" onChange={e => set('code', e.target.value)} />}</Field>
            </div>
            <div className="form-row">
              <Field label="Role" error={shown('designationId')} help={role ? (role.appView === 'manager' ? 'Opens the manager app: approves a team\'s day, tours, leave and claims.' : 'Opens the field app: plans the day and logs calls.') : undefined}>{p => (
                <select {...p} className="input" value={f.designationId} onChange={e => set('designationId', e.target.value)}>
                  {roles.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              )}</Field>
              <Field label="Joined on" error={shown('joinedAt')}>{p => <input {...p} className="input" type="date" value={f.joinedAt} onChange={e => set('joinedAt', e.target.value)} />}</Field>
            </div>
            <div className="form-row">
              <Field label="Email" error={shown('email')} help="Their login and password resets arrive here.">{p => <input {...p} className="input" type="email" autoComplete="off" value={f.email} onChange={e => set('email', e.target.value)} />}</Field>
              <Field label="Mobile" optional error={shown('mobile')}>{p => <input {...p} className="input" inputMode="tel" value={f.mobile} onChange={e => set('mobile', e.target.value)} />}</Field>
            </div>
            <Field label="Department" optional>{p => <input {...p} className="input" value={f.department} onChange={e => set('department', e.target.value)} />}</Field>
          </fieldset>

          <fieldset className="add-group">
            <legend className="section-title">Where they work</legend>
            <div className="form-row">
              <Field label="Territory" error={shown('territoryId')}>{p => (
                <select {...p} className="input" value={f.territoryId} onChange={e => { const t = m.territories.find(x => x.id === e.target.value); setF(x => ({ ...x, territoryId: e.target.value, hq: x.hq && x.hq !== m.territories.find(y => y.id === x.territoryId)?.hq ? x.hq : t?.hq ?? '' })); }}>
                  {m.territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}</Field>
              <Field label="Headquarters" error={shown('hq')} help="The town they start from each day.">{p => <input {...p} className="input" value={f.hq} onChange={e => set('hq', e.target.value)} />}</Field>
            </div>
          </fieldset>

          <fieldset className="add-group">
            <legend className="section-title">Who they report to</legend>
            <Field label="Manager" optional={role?.appView === 'manager'} error={shown('managerId')} help="Approves their day plans, tour plans, leave and expense claims.">{p => (
              <select {...p} className="input" value={f.managerId ?? ''} onChange={e => set('managerId', e.target.value || null)}>
                <option value="">{role?.appView === 'manager' ? 'Nobody, they report to the office' : 'Choose a manager'}</option>
                {managers.map(x => <option key={x.id} value={x.id}>{x.name}{x.hq ? ` · ${x.hq}` : ''}</option>)}
              </select>
            )}</Field>
            {managers.length === 0 && <p className="form-note">There are no managers yet. Add your managers first, so the people after them have someone to report to.</p>}
          </fieldset>

          <p className="form-help">Leave, salary and expense rules are company settings and are not set per person here. Documents are added on the person's record once they are on the roster.</p>
          {problem && <p className="form-error" role="alert">They were not added. {problem}</p>}
          <div className="add-actions">
            <button type="button" className="btn btn-secondary" onClick={() => { writeDraft(null); nav('/team'); }}>Discard</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add to the roster'}</button>
          </div>
        </form>
      )}
    </Arrive>
  );
}
