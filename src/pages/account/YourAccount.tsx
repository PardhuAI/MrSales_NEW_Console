import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Copy } from '@phosphor-icons/react';
import { useResource, invalidate } from '../../data/resource';
import {
  PASSWORD_RULES, changePassword, confirmTwoStep, loadMyActivity, signOutOthers, startTwoStep, turnOffTwoStep, twoStepStatus,
  type Activity, type Enrolment, type TwoStep,
} from '../../live/account';
import { setChatName } from '../../live/chat';
import { isLive } from '../../live/client';
import { useMe, useSession } from '../../live/session';
import { ROLE_LABEL, useCan } from '../../app/access';
import { ago, dayMonth, dayOf, timeOf } from '../../lib/days';
import { Confirm, Field, Notice, Pill, Summary } from '../../components/kit';
import { Freshness, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { DEMO_PASSWORD } from '../../demo/fakedb/auth';

/**
 * Your account: who you are, your password, two-step sign-in, the devices
 * signed in, and what this login changed lately. Everything here acts on the
 * signed-in login only. Sections are separated by space and a hairline, set
 * like the settings on a Mac: the name and what it is for on the left, the
 * thing itself on the right.
 */

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function YourAccount() {
  const two = useResource<TwoStep>('account:twostep', twoStepStatus);
  const [notice, setNotice] = useState('');
  const me = useMe();
  return (
    <div className="page-body account">
      <Summary aside={<Freshness at={two.at} error={two.error} reload={() => void two.reload()} label="Read your account again" />}>
        Signed in as <strong>{me.email}</strong>, {ROLE_LABEL[me.role]} at {me.orgName}.{' '}
        {two.data ? (two.data.on ? 'Two-step sign-in is on.' : 'Two-step sign-in is off.') : ''}
      </Summary>
      <Who />
      <Password two={two.data} onDone={setNotice} />
      <TwoStepPart two={two.data} loading={!two.data && two.status !== 'error'} error={two.status === 'error' && !two.data ? two.error : ''}
        onChange={m => { invalidate('account:'); setNotice(m); }} />
      <Devices onDone={setNotice} />
      <RecentActivity />
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

function Part({ id, title, about, children }: { id: string; title: string; about: ReactNode; children: ReactNode }) {
  return (
    <section className="acct-part" aria-labelledby={id}>
      <div className="acct-part-head">
        <h2 id={id} className="section-title">{title}</h2>
        <p className="acct-part-about">{about}</p>
      </div>
      <div className="acct-part-body">{children}</div>
    </section>
  );
}

// ── who you are ───────────────────────────────────────────────────────

function Who() {
  const me = useMe();
  const { patchMe, refresh } = useSession();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(me.chatName ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setProblem('Write the name your team knows you by, at least two letters.');
    setBusy(true);
    setProblem('');
    try {
      await setChatName(name.trim());
      patchMe({ chatName: name.trim() });
      if (isLive) await refresh();
      setEditing(false);
    } catch (err) {
      setProblem(msg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Part id="acct-who" title="Who you are" about="As Mr Sales knows this login. Your company's owner or admin changes the role.">
      <dl className="acct-facts">
        <div><dt>Name</dt><dd>{me.name}</dd></div>
        <div><dt>Email</dt><dd>{me.email}</dd></div>
        <div><dt>Role</dt><dd>{ROLE_LABEL[me.role]}{me.scope === 'team' ? ', for your own team' : ''}</dd></div>
        <div><dt>Company</dt><dd>{me.orgName}</dd></div>
        <div>
          <dt>Name in Messages</dt>
          <dd>
            {!editing ? (
              <>{me.chatName ?? <span className="cell-quiet">Not chosen yet</span>} <button type="button" className="link acct-inline" onClick={() => { setName(me.chatName ?? ''); setProblem(''); setEditing(true); }}>{me.chatName ? 'Change' : 'Choose one'}</button></>
            ) : (
              <form className="acct-inline-form" onSubmit={save} noValidate>
                <Field label="Your name, as your team sees it in Messages" error={problem || undefined}>
                  {x => <input {...x} className="input" value={name} maxLength={60} autoFocus onChange={e => setName(e.target.value)} />}
                </Field>
                <div className="acct-actions">
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => setEditing(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary btn-small" disabled={busy}>{busy ? 'Saving…' : 'Save the name'}</button>
                </div>
              </form>
            )}
          </dd>
        </div>
      </dl>
    </Part>
  );
}

// ── the password ──────────────────────────────────────────────────────

function Password({ two, onDone }: { two: TwoStep | undefined; onDone: (m: string) => void }) {
  const me = useMe();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [code, setCode] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const missing = PASSWORD_RULES.filter(r => !r.met(next));
  const errors = {
    current: !current ? 'Type your current password.' : undefined,
    next: missing.length ? `The new password needs: ${missing.map(r => r.label.toLowerCase()).join('; ')}.` : next === current ? 'The new password is the same as the current one.' : undefined,
    again: again !== next ? 'The two new passwords do not match.' : undefined,
    code: two?.on && !/^\d{6}$/.test(code) ? 'Type the six-digit code from your authenticator app.' : undefined,
  };
  const shown = (k: keyof typeof errors) => (tried ? errors[k] : undefined);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    setProblem('');
    if (Object.values(errors).some(Boolean)) {
      (e.currentTarget as HTMLFormElement).querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setBusy(true);
    try {
      await changePassword(me.email, current, next, two?.on ? code : null);
      setCurrent(''); setNext(''); setAgain(''); setCode(''); setTried(false);
      onDone('Your password is changed. Other devices stay signed in until you sign them out below.');
    } catch (err) {
      setProblem(msg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Part id="acct-password" title="Password" about="Change it whenever you like. You need the current one to set a new one.">
      <form className="form acct-form" onSubmit={submit} noValidate>
        <Field label="Current password" error={shown('current')} help={isLive ? undefined : `Demo: the current password is ${DEMO_PASSWORD}.`}>
          {x => <input {...x} className="input" type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} />}
        </Field>
        <Field label="New password" error={shown('next')}>
          {x => <input {...x} className="input" type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} />}
        </Field>
        <ul className="auth-rules acct-rules" aria-label="Password rules">
          {PASSWORD_RULES.map(r => (
            <li key={r.label} className={r.met(next) ? 'met' : ''}>{r.label}<span className="visually-hidden">{r.met(next) ? ', done' : ', not yet'}</span></li>
          ))}
        </ul>
        <Field label="New password again" error={shown('again')}>
          {x => <input {...x} className="input" type="password" autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} />}
        </Field>
        {two?.on && (
          <Field label="Code from your authenticator app" error={shown('code')} help="Two-step sign-in is on, so a change of password needs a code too.">
            {x => <input {...x} className="input code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />}
          </Field>
        )}
        {problem && <p className="form-error" role="alert">The password was not changed. {problem}</p>}
        <div className="acct-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Changing…' : 'Change the password'}</button>
        </div>
      </form>
    </Part>
  );
}

// ── two-step sign-in ──────────────────────────────────────────────────

function TwoStepPart({ two, loading, error, onChange }: { two: TwoStep | undefined; loading: boolean; error: string; onChange: (m: string) => void }) {
  const [enrol, setEnrol] = useState<Enrolment | null>(null);
  const [turningOff, setTurningOff] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const [copied, setCopied] = useState(false);

  const start = async () => {
    setBusy('start'); setProblem('');
    try {
      setEnrol(await startTwoStep());
      setCode('');
    } catch (e) {
      setProblem(msg(e));
    } finally {
      setBusy('');
    }
  };
  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    if (!enrol) return;
    if (!/^\d{6}$/.test(code)) return setProblem('Type the six digits your app shows for Mr Sales.');
    setBusy('confirm'); setProblem('');
    try {
      await confirmTwoStep(enrol.factorId, code);
      setEnrol(null);
      onChange('Two-step sign-in is on. From your next sign-in, the console asks for a code from your app.');
    } catch (err) {
      setProblem(msg(err));
    } finally {
      setBusy('');
    }
  };
  const off = async (e: FormEvent) => {
    e.preventDefault();
    if (!two?.factorId) return;
    if (!/^\d{6}$/.test(code)) return setProblem('Type the six digits your app shows now, to prove it is you.');
    setBusy('off'); setProblem('');
    try {
      await turnOffTwoStep(two.factorId, code);
      setTurningOff(false);
      onChange('Two-step sign-in is off. Signing in needs only your password again.');
    } catch (err) {
      setProblem(msg(err));
    } finally {
      setBusy('');
    }
  };
  const copy = async () => {
    if (!enrol) return;
    try {
      await navigator.clipboard.writeText(enrol.secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Part id="acct-two" title="Two-step sign-in"
      about="A six-digit code from an authenticator app on your phone, asked for after your password. Someone who learns your password still cannot get in.">
      {loading ? <Loading label="Reading two-step sign-in" lines={1} /> : error ? (
        <p className="form-error" role="alert">Whether two-step sign-in is on could not be read. {error}</p>
      ) : enrol ? (
        <form className="acct-enrol" onSubmit={confirm} noValidate>
          <ol className="acct-enrol-steps">
            <li>Open an authenticator app on your phone, such as Google Authenticator, Microsoft Authenticator or 1Password, and add an account.</li>
            <li>Scan this code with it. {!isLive && <span className="demo-tag">Demo data, this code does not scan</span>}</li>
          </ol>
          <img className="acct-qr" src={enrol.qr} alt="QR code to scan with your authenticator app" width={176} height={176} />
          <div className="acct-secret">
            <p className="form-help">Cannot scan? Type this key into the app instead:</p>
            <p className="acct-secret-row">
              <code className="acct-key">{enrol.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => void copy()}><Copy size={14} aria-hidden="true" /> {copied ? 'Copied' : 'Copy the key'}</button>
            </p>
          </div>
          <Field label="Then type the six-digit code the app shows" error={problem || undefined}>
            {x => <input {...x} className="input code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />}
          </Field>
          <div className="acct-actions">
            <button type="button" className="btn btn-secondary" onClick={() => { setEnrol(null); setProblem(''); }}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy === 'confirm'}>{busy === 'confirm' ? 'Checking…' : 'Turn on two-step sign-in'}</button>
          </div>
        </form>
      ) : two?.on ? (
        <div className="acct-status">
          <p><Pill tone="good">On</Pill> <span className="acct-status-text">since {two.since ? `${dayMonth(dayOf(two.since))} ${two.since.slice(0, 4)}` : 'it was set up'}. Every sign-in asks for a code from your app.</span></p>
          {!turningOff ? (
            <div className="acct-actions"><button type="button" className="btn btn-secondary" onClick={() => { setTurningOff(true); setCode(''); setProblem(''); }}>Turn it off</button></div>
          ) : (
            <form className="acct-inline-form" onSubmit={off} noValidate>
              <Field label="Code from your authenticator app" help="To turn it off, prove it is you with the code your app shows now." error={problem || undefined}>
                {x => <input {...x} className="input code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} autoFocus onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />}
              </Field>
              <div className="acct-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setTurningOff(false)}>Keep it on</button>
                <button type="submit" className="btn btn-danger" disabled={busy === 'off'}>{busy === 'off' ? 'Turning off…' : 'Turn off two-step sign-in'}</button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <div className="acct-status">
          <p><Pill>Off</Pill> <span className="acct-status-text">Signing in needs only your password.</span></p>
          {problem && <p className="form-error" role="alert">{problem}</p>}
          <div className="acct-actions"><button type="button" className="btn btn-primary" disabled={busy === 'start'} onClick={() => void start()}>{busy === 'start' ? 'Preparing…' : 'Turn on two-step sign-in'}</button></div>
        </div>
      )}
    </Part>
  );
}

// ── devices ───────────────────────────────────────────────────────────

function Devices({ onDone }: { onDone: (m: string) => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const go = async () => {
    setBusy(true); setProblem('');
    try {
      await signOutOthers();
      setAsking(false);
      onDone('Every other device is signed out. This one stays signed in.');
    } catch (e) {
      setProblem(msg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Part id="acct-devices" title="Signed-in devices" about="A laptop left signed in, a borrowed computer, a lost phone: sign them all out at once.">
      <p className="acct-status-text">This login may be signed in on other browsers and computers. Signing them out keeps this one.</p>
      <div className="acct-actions"><button type="button" className="btn btn-secondary" onClick={() => setAsking(true)}>Sign out everywhere else</button></div>
      <Confirm open={asking} title="Sign out every other device?" confirmLabel="Sign out everywhere else" busy={busy} error={problem}
        onCancel={() => { setAsking(false); setProblem(''); }} onConfirm={() => void go()}>
        Anyone using this login elsewhere must sign in again with the password{' '}and, if it is on, a code from your app.
      </Confirm>
    </Part>
  );
}

// ── what this login changed ───────────────────────────────────────────

function RecentActivity() {
  const allowed = useCan();
  const r = useResource<Activity[]>('account:activity', loadMyActivity);
  return (
    <Part id="acct-activity" title="Your recent activity" about="The last 20 changes made with this login, so you can tell if someone else used it.">
      {r.status === 'error' && !r.data ? <p className="form-error" role="alert">{r.error}</p>
        : !r.data ? <Loading label="Reading your recent changes" lines={1} />
          : r.data.length === 0 ? <p className="acct-status-text">Nothing changed with this login yet. Approvals, edits and settings you change appear here.</p> : (
            <Arrive>
              <ul className="acct-activity">
                {r.data.map(a => (
                  <li key={a.id}>
                    <span className="acct-activity-what">{a.action.charAt(0).toUpperCase() + a.action.slice(1)}{a.label ? <span className="cell-sub">{a.label}</span> : null}</span>
                    <time className="acct-activity-when" dateTime={a.at} title={`${dayMonth(dayOf(a.at))}, ${timeOf(a.at)}`}>{ago(a.at)}</time>
                  </li>
                ))}
              </ul>
              {allowed('audit') && <p className="acct-more"><Link className="link" to="/settings/audit">The whole company's audit log</Link></p>}
            </Arrive>
          )}
    </Part>
  );
}
