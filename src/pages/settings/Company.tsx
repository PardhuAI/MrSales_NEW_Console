import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { invalidate, useResource } from '../../data/resource';
import { loadCompany, saveCompany, setLogo, type Company as CompanyModel } from '../../live/pay';
import { Confirm, Field, Notice, Summary, useFocusFirstError } from '../../components/kit';
import { Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useMe } from '../../live/session';

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
// The database keeps the logo as a data URL of at most 400,000 characters.
const LOGO_MAX_BYTES = 280_000;

/**
 * The company: the details printed on every payslip (name, address, GSTIN,
 * PAN) and the logo. The name is the one Mr Sales registered; the owner keeps
 * the rest current, and the owner or an admin changes the logo.
 */
export function Company() {
  const r = useResource<CompanyModel>('settings:company', loadCompany);
  if (r.status === 'error' && !r.data) return <LoadError what="The company details" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading the company details" lines={2} />;
  return <View c={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function View({ c, at, error, reload }: { c: CompanyModel; at: Date | null; error: string; reload: () => void }) {
  const me = useMe();
  const owner = me.role === 'owner';
  const mayLogo = owner || me.role === 'admin';
  const [f, setF] = useState({ address: c.address, state: c.state, gstin: c.gstin, pan: c.pan, website: c.website });
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const [logoProblem, setLogoProblem] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [removing, setRemoving] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { setF({ address: c.address, state: c.state, gstin: c.gstin, pan: c.pan, website: c.website }); }, [c]);

  const gstin = f.gstin.trim().toUpperCase();
  const pan = f.pan.trim().toUpperCase();
  const errors = {
    gstin: gstin && !GSTIN.test(gstin) ? 'A GSTIN is 15 characters, like 36AABCM1234K1Z5.' : undefined,
    pan: pan && !PAN.test(pan) ? 'A PAN is 10 characters, like AABCM1234K.' : gstin && pan && GSTIN.test(gstin) && gstin.slice(2, 12) !== pan ? 'This PAN is not the one inside the GSTIN.' : undefined,
  };
  const formRef = useFocusFirstError(errors, attempt);
  const changed = f.address !== c.address || f.state !== c.state || gstin !== c.gstin || pan !== c.pan || f.website !== c.website;

  const save = async () => {
    setAttempt(a => a + 1);
    if (Object.values(errors).some(Boolean)) return;
    setBusy('details'); setProblem('');
    try {
      await saveCompany({ address: f.address.trim(), state: f.state.trim(), gstin, pan, website: f.website.trim() });
      invalidate('settings:company');
      setNotice('The company details are saved; payslips released from now on carry them.');
    } catch (e) { setProblem(e instanceof Error ? e.message : String(e)); } finally { setBusy(''); }
  };

  const pickLogo = async (picked: File | undefined) => {
    if (file.current) file.current.value = '';
    if (!picked) return;
    setLogoProblem('');
    if (!/^image\/(png|jpeg|svg\+xml)$/.test(picked.type)) { setLogoProblem('Choose a PNG, JPEG or SVG image.'); return; }
    if (picked.size > LOGO_MAX_BYTES) { setLogoProblem(`This image is ${Math.round(picked.size / 1000)} KB; a logo can be at most ${LOGO_MAX_BYTES / 1000} KB. Save a smaller one, about 600 pixels wide.`); return; }
    setBusy('logo');
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('The image could not be read.'));
        reader.readAsDataURL(picked);
      });
      await setLogo(data);
      invalidate('settings:company');
      setNotice('The logo is saved; payslips released from now on carry it.');
    } catch (e) { setLogoProblem(e instanceof Error ? e.message : String(e)); } finally { setBusy(''); }
  };
  const removeLogo = async () => {
    setRemoving(false); setBusy('logo'); setLogoProblem('');
    try { await setLogo(null); invalidate('settings:company'); setNotice('The logo is removed.'); } catch (e) { setLogoProblem(e instanceof Error ? e.message : String(e)); } finally { setBusy(''); }
  };

  const missing = [!c.address && 'address', !c.gstin && 'GSTIN'].filter(Boolean);
  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read the company details again" />}>
        <strong>{c.name || 'Your company'}</strong>{missing.length ? <>, <span className="warn-text">no {missing.join(' or ')} yet</span>, so payslips go out without {missing.length > 1 ? 'them' : 'it'}.</> : ', as printed on every payslip.'}
      </Summary>
      <Arrive className="company-layout">
        <section aria-labelledby="company-logo" className="company-logo">
          <h2 id="company-logo" className="fig-title">Logo</h2>
          <div className="logo-frame">{c.logo ? <img src={c.logo} alt={`${c.name} logo`} /> : <span className="cell-quiet">No logo</span>}</div>
          {mayLogo ? (
            <div className="logo-actions">
              <input ref={file} id="logo-file" type="file" className="visually-hidden" aria-label="Logo image" tabIndex={-1} accept="image/png,image/jpeg,image/svg+xml" onChange={e => void pickLogo(e.target.files?.[0])} />
              <button type="button" className="btn btn-secondary btn-small" disabled={busy === 'logo'} onClick={() => file.current?.click()}>{busy === 'logo' ? 'Saving…' : c.logo ? 'Change the logo' : 'Add a logo'}</button>
              {c.logo && <button type="button" className="link" disabled={busy === 'logo'} onClick={() => setRemoving(true)}>Remove</button>}
            </div>
          ) : <p className="block-note">The owner or an admin changes the logo.</p>}
          <p className="form-help">PNG, JPEG or SVG, up to {LOGO_MAX_BYTES / 1000} KB. A wide logo on a clear background prints best.</p>
          {logoProblem && <p className="form-error" role="alert">{logoProblem}</p>}
        </section>
        <section aria-labelledby="company-details">
          <h2 id="company-details" className="fig-title">Details</h2>
          <form ref={formRef} className="form company-form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
            <Field label="Company name" help={<>Registered with Mr Sales. To change it, write to us from <Link className="link" to="/help">Help</Link>.</>}>{x => <input {...x} className="input" value={c.name} readOnly />}</Field>
            <Field label="Registered address" optional>{x => <textarea {...x} className="input" rows={3} value={f.address} readOnly={!owner} onChange={e => setF(v => ({ ...v, address: e.target.value }))} />}</Field>
            <div className="form-row">
              <Field label="State" optional>{x => <input {...x} className="input" value={f.state} readOnly={!owner} placeholder="Telangana" onChange={e => setF(v => ({ ...v, state: e.target.value }))} />}</Field>
              <Field label="Website" optional>{x => <input {...x} className="input" value={f.website} readOnly={!owner} placeholder="example.in" onChange={e => setF(v => ({ ...v, website: e.target.value }))} />}</Field>
            </div>
            <div className="form-row">
              <Field label="GSTIN" optional error={attempt ? errors.gstin : undefined}>{x => <input {...x} className="input mono" value={f.gstin} readOnly={!owner} maxLength={15} autoCapitalize="characters" onChange={e => setF(v => ({ ...v, gstin: e.target.value.toUpperCase() }))} />}</Field>
              <Field label="PAN" optional error={attempt ? errors.pan : undefined}>{x => <input {...x} className="input mono" value={f.pan} readOnly={!owner} maxLength={10} autoCapitalize="characters" onChange={e => setF(v => ({ ...v, pan: e.target.value.toUpperCase() }))} />}</Field>
            </div>
            {owner ? (
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={!changed || busy === 'details'}>{busy === 'details' ? 'Saving…' : 'Save the details'}</button>
                {changed && <button type="button" className="btn btn-secondary" onClick={() => setF({ address: c.address, state: c.state, gstin: c.gstin, pan: c.pan, website: c.website })}>Undo changes</button>}
              </div>
            ) : <p className="block-note">Only the owner changes these, as the database allows.</p>}
            {problem && <p className="form-error" role="alert">It was not saved. {problem}</p>}
          </form>
        </section>
      </Arrive>
      <Confirm open={removing} title="Remove the logo?" confirmLabel="Remove" danger onCancel={() => setRemoving(false)} onConfirm={() => void removeLogo()}>
        <p>Payslips released from now on go out without a logo. Payslips already released keep theirs.</p>
      </Confirm>
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}
