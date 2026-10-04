import { useEffect, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { invalidate } from '../../data/resource';
import {
  CATEGORY_LABEL, CLIENT_TYPES, TYPE_LABEL, createClient, createSpecialty, deleteSpecialty, updateClient,
  type ClientInput, type ClientRow, type ClientsModel,
} from '../../live/clients';
import { Drawer, Field, useFocusFirstError } from '../../components/kit';
import { count } from '../../lib/format';

/**
 * Adding a client, and correcting one: one form, because they are one set of
 * rules. A client added here has no position, and cannot be given one from a
 * desk: the first rep to call there captures it, and until then visits there
 * cannot be checked. The form says so before anything is typed.
 */

type Form = {
  name: string; type: string; category: string; listing: 'listed' | 'unlisted'; active: boolean;
  specialty: string; designation: string; areaId: string; clusterId: string; ownerId: string;
  mobile: string; email: string; contactPerson: string; address: string; city: string; pincode: string;
  specialDate: string; specialOccasion: string;
};

const blank = (m: ClientsModel): Form => ({
  name: '', type: 'doctor', category: 'regular', listing: 'listed', active: true, specialty: '', designation: '',
  areaId: m.geo.areas[0]?.id ?? '', clusterId: '', ownerId: '', mobile: '', email: '', contactPerson: '', address: '', city: '', pincode: '',
  specialDate: '', specialOccasion: '',
});

const fromClient = (c: ClientRow): Form => ({
  name: c.name, type: c.type, category: c.category, listing: c.listed ? 'listed' : 'unlisted', active: c.active !== false,
  specialty: c.specialty ?? '', designation: c.designation ?? '', areaId: c.areaId, clusterId: c.clusterId ?? '', ownerId: c.ownerId ?? '',
  mobile: c.mobile ?? '', email: c.email ?? '', contactPerson: c.contactPerson ?? '', address: c.address ?? '', city: c.city ?? '', pincode: c.pincode ?? '',
  specialDate: c.specialDate ?? '', specialOccasion: c.specialOccasion ?? '',
});

export function ClientForm({ open, model: m, existing, onClose, onSaved }: {
  open: boolean;
  model: ClientsModel;
  existing?: ClientRow;
  onClose: () => void;
  onSaved: (id: string, name: string) => void;
}) {
  const [f, setF] = useState<Form>(() => (existing ? fromClient(existing) : blank(m)));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (open) {
      setF(existing ? fromClient(existing) : blank(m));
      setProblem('');
      setAttempt(0);
    }
  }, [open, existing, m]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(x => ({ ...x, [k]: v }));

  const errors = {
    name: f.name.trim().length < 2 ? 'Write the client\'s name, as the field knows it.' : undefined,
    areaId: !f.areaId ? 'Choose the area the client is in.' : undefined,
    email: f.email && !/^\S+@\S+\.\S+$/.test(f.email) ? 'That does not look like an email address.' : undefined,
    mobile: f.mobile && !/^[+\d][\d\s-]{6,}$/.test(f.mobile) ? 'Write the mobile number in digits.' : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);
  const formRef = useFocusFirstError(errors, attempt);
  const shown = (k: keyof typeof errors) => (attempt ? errors[k] : undefined);
  const clusters = m.geo.clusters.filter(c => c.areaId === f.areaId);
  const territoryOf = (areaId: string) => m.geo.territories.find(t => t.id === m.geo.areas.find(a => a.id === areaId)?.territoryId)?.name;

  const save = async () => {
    setAttempt(a => a + 1);
    if (invalid) return;
    setBusy(true);
    setProblem('');
    const input: ClientInput = {
      name: f.name.trim(), type: f.type, category: f.category, listing: f.listing, isActive: f.listing === 'listed' ? f.active : null,
      specialty: f.specialty || null, designation: f.designation.trim() || null, areaId: f.areaId, clusterId: f.clusterId || null,
      ownerId: f.ownerId || null, mobile: f.mobile.trim() || null, email: f.email.trim() || null, contactPerson: f.contactPerson.trim() || null,
      address: f.address.trim() || null, city: f.city.trim() || null, pincode: f.pincode.trim() || null,
      specialDate: f.specialDate || null, specialOccasion: f.specialDate ? f.specialOccasion || 'Birthday' : null,
      specialNote: existing?.specialNote ?? null,
      lat: existing?.lat ?? null, lng: existing?.lng ?? null,
    };
    try {
      const id = existing ? (await updateClient(existing.id, input), existing.id) : await createClient(input);
      onSaved(id, input.name);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={existing ? `Edit ${existing.name}` : 'Add a client'}
      sub="A doctor, hospital, chemist or stockist the field calls on."
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={busy || !m.geo.areas.length} onClick={() => void save()}>{busy ? 'Saving…' : existing ? 'Save changes' : 'Add the client'}</button>
        </>
      )}
    >
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        {!existing && (
          <p className="form-note"><strong>The first visit sets the location.</strong> A client added here has no position on the map, because only someone standing at the clinic can capture it. Until the first rep calls, visits there cannot be checked.</p>
        )}
        {existing && !existing.hasLocation && <p className="form-note">No location yet. The next rep to call there pins it.</p>}
        {!m.geo.areas.length && <p className="form-error">There are no areas yet. Every client sits in one: add your geography under Settings first.</p>}

        <Field label="Name" error={shown('name')}>{p => <input {...p} className="input" value={f.name} placeholder="Dr. Anita Rao" onChange={e => set('name', e.target.value)} autoComplete="off" />}</Field>
        <div className="form-row">
          <Field label="Type">{p => (
            <select {...p} className="input" value={f.type} onChange={e => set('type', e.target.value)}>
              {CLIENT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          )}</Field>
          <Field label="Category">{p => (
            <select {...p} className="input" value={f.category} onChange={e => set('category', e.target.value)}>
              {Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          )}</Field>
        </div>
        {f.type === 'doctor' && (
          <div className="form-row">
            <Field label="Specialty" optional help={m.specialties.length ? undefined : 'No specialties on the list yet. Add them from Specialties, so one does not become three spellings.'}>{p => (
              <select {...p} className="input" value={f.specialty} onChange={e => set('specialty', e.target.value)}>
                <option value="">Not set</option>
                {m.specialties.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                {f.specialty && !m.specialties.some(s => s.name === f.specialty) && <option value={f.specialty}>{f.specialty}</option>}
              </select>
            )}</Field>
            <Field label="Qualification" optional>{p => <input {...p} className="input" value={f.designation} placeholder="MD, MBBS" onChange={e => set('designation', e.target.value)} />}</Field>
          </div>
        )}

        <div className="form-row">
          <Field label="Area" error={shown('areaId')} help={f.areaId ? `In ${territoryOf(f.areaId) ?? 'its territory'}` : undefined}>{p => (
            <select {...p} className="input" value={f.areaId} onChange={e => { set('areaId', e.target.value); set('clusterId', ''); }}>
              {m.geo.territories.map(t => (
                <optgroup key={t.id} label={t.name}>
                  {m.geo.areas.filter(a => a.territoryId === t.id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </optgroup>
              ))}
            </select>
          )}</Field>
          <Field label="Cluster" optional>{p => (
            <select {...p} className="input" value={f.clusterId} onChange={e => set('clusterId', e.target.value)} disabled={!clusters.length}>
              <option value="">{clusters.length ? 'Not set' : 'This area has no clusters'}</option>
              {clusters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}</Field>
        </div>
        {!existing && (
          <Field label="Seen by" optional help="The person who calls on this client. Reports and coverage count the visits under them.">{p => (
            <select {...p} className="input" value={f.ownerId} onChange={e => set('ownerId', e.target.value)}>
              <option value="">Nobody yet</option>
              {m.people.filter(x => x.active).map(x => <option key={x.id} value={x.id}>{x.name}{x.code ? ` · ${x.code}` : ''}</option>)}
            </select>
          )}</Field>
        )}

        <fieldset className="form-fieldset">
          <legend className="form-label">On the company list</legend>
          <div className="choice-row">
            <label className="choice"><input type="radio" name="listing" checked={f.listing === 'listed'} onChange={() => set('listing', 'listed')} /> Listed</label>
            <label className="choice"><input type="radio" name="listing" checked={f.listing === 'unlisted'} onChange={() => set('listing', 'unlisted')} /> Unlisted</label>
          </div>
          {f.listing === 'listed' ? (
            <label className="choice"><input type="checkbox" checked={f.active} onChange={e => set('active', e.target.checked)} /> Still being called on</label>
          ) : (
            <p className="form-help">An unlisted client was never on the company list, so active or retired does not apply.</p>
          )}
        </fieldset>

        <div className="form-row">
          <Field label="Mobile" optional error={shown('mobile')}>{p => <input {...p} className="input" inputMode="tel" value={f.mobile} onChange={e => set('mobile', e.target.value)} />}</Field>
          <Field label="Email" optional error={shown('email')}>{p => <input {...p} className="input" type="email" value={f.email} onChange={e => set('email', e.target.value)} />}</Field>
        </div>
        {f.type !== 'doctor' && <Field label="Contact person" optional>{p => <input {...p} className="input" value={f.contactPerson} onChange={e => set('contactPerson', e.target.value)} />}</Field>}
        <Field label="Address" optional>{p => <input {...p} className="input" value={f.address} onChange={e => set('address', e.target.value)} />}</Field>
        <div className="form-row">
          <Field label="City" optional>{p => <input {...p} className="input" value={f.city} onChange={e => set('city', e.target.value)} />}</Field>
          <Field label="Pincode" optional>{p => <input {...p} className="input" inputMode="numeric" value={f.pincode} onChange={e => set('pincode', e.target.value)} />}</Field>
        </div>
        <div className="form-row">
          <Field label="An occasion worth a call" optional help="A birthday or anniversary. It appears under Coverage a month before.">{p => <input {...p} className="input" type="date" value={f.specialDate} onChange={e => set('specialDate', e.target.value)} />}</Field>
          {f.specialDate && (
            <Field label="What it is">{p => (
              <select {...p} className="input" value={f.specialOccasion || 'Birthday'} onChange={e => set('specialOccasion', e.target.value)}>
                {['Birthday', 'Wedding anniversary', 'Clinic anniversary'].map(o => <option key={o}>{o}</option>)}
              </select>
            )}</Field>
          )}
        </div>
        {problem && <p className="form-error" role="alert">That was not saved. {problem}</p>}
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}

/** The closed list of specialties, so one specialty does not become three spellings. */
export function Specialties({ list }: { list: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const [said, setSaid] = useState('');
  const run = async (key: string, f: () => Promise<string>) => {
    setBusy(key);
    setProblem('');
    setSaid('');
    try {
      setSaid(await f());
      invalidate('clients:all');
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };
  return (
    <>
      <button type="button" className="btn btn-secondary btn-small" onClick={() => setOpen(true)}>Specialties</button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Specialties" sub={`${count(list.length, 'specialty', 'specialties')} a doctor can be listed as, here and on the phone.`}>
        <form className="form" onSubmit={e => { e.preventDefault(); if (name.trim().length > 1) void run('add', async () => { const m = await createSpecialty(name); setName(''); return m; }); }}>
          <Field label="Add a specialty" help="A closed list is the point: typed freely, one specialty becomes three.">{p => (
            <div className="input-with-button">
              <input {...p} className="input" value={name} placeholder="Endocrinologist" onChange={e => setName(e.target.value)} />
              <button type="submit" className="btn btn-primary" disabled={name.trim().length < 2 || busy !== ''}>{busy === 'add' ? 'Adding…' : 'Add'}</button>
            </div>
          )}</Field>
          {problem && <p className="form-error" role="alert">{problem}</p>}
          {said && <p className="form-help" role="status">{said}</p>}
        </form>
        {list.length === 0 ? (
          <p className="drawer-note">Nothing on the list yet.</p>
        ) : (
          <ul className="tag-list">
            {list.map(s => (
              <li key={s.id}>
                <span>{s.name}</span>
                <button type="button" className="tag-x" aria-label={`Remove ${s.name}`} disabled={busy !== ''} onClick={() => void run(s.id, () => deleteSpecialty(s.id))}><X size={12} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}
        <p className="drawer-note">A specialty that clients are listed under cannot be removed until they are changed.</p>
      </Drawer>
    </>
  );
}
