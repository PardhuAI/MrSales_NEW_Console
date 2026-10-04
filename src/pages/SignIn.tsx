import { useState, type FormEvent, type ReactNode } from 'react';
import { useSession } from '../live/session';

/**
 * Getting into the console: signing in, a forgotten password, choosing a new
 * one from the email link, and the accounts that cannot come in, each said in
 * plain words. Nothing else on the page.
 */

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <main className="auth-card">
        <div className="auth-brand">
          <img src="/logo.svg" alt="" width={34} height={34} />
          <span>Mr Sales</span>
        </div>
        {children}
      </main>
      <p className="auth-foot">Need help? Write to support@mrsales.in</p>
    </div>
  );
}

export function Loading() {
  return (
    <div className="auth" aria-busy="true">
      <p className="auth-wait">Opening your console…</p>
    </div>
  );
}

export function SignIn({ message }: { message?: string }) {
  const { signIn, sendReset } = useSession();
  const [mode, setMode] = useState<'signin' | 'forgot' | 'sent'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(message ?? '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) return setError('Enter your work email.');
    setBusy(true);
    if (mode === 'forgot') {
      const err = await sendReset(email);
      setBusy(false);
      if (err) return setError(err);
      return setMode('sent');
    }
    if (!password) {
      setBusy(false);
      return setError('Enter your password.');
    }
    const err = await signIn(email, password);
    setBusy(false);
    if (err) setError(err);
  };

  if (mode === 'sent') {
    return (
      <Frame>
        <h1 className="auth-title">Check your email</h1>
        <p className="auth-text">
          If {email.trim()} has a Mr Sales login, a link to choose a new password is on its way.
          It works once, for an hour.
        </p>
        <button type="button" className="link auth-switch" onClick={() => setMode('signin')}>Back to sign in</button>
      </Frame>
    );
  }

  return (
    <Frame>
      <h1 className="auth-title">{mode === 'forgot' ? 'Reset your password' : 'Sign in to your console'}</h1>
      <p className="auth-text">
        {mode === 'forgot'
          ? 'Enter your work email and we will send a link to choose a new password.'
          : 'For owners and office teams. Field people use the Mr Sales app.'}
      </p>

      <form className="auth-form" onSubmit={submit} noValidate>
        <label className="field">
          <span className="field-label">Work email</span>
          <input
            className="input"
            type="email"
            name="email"
            autoComplete="username"
            spellCheck={false}
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoFocus
          />
        </label>
        {mode === 'signin' && (
          <label className="field">
            <span className="field-label">Password</span>
            <input
              className="input"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </label>
        )}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
          {busy ? (mode === 'forgot' ? 'Sending…' : 'Signing in…') : mode === 'forgot' ? 'Send the link' : 'Sign in'}
        </button>
      </form>

      <button
        type="button"
        className="link auth-switch"
        onClick={() => {
          setError('');
          setMode(mode === 'forgot' ? 'signin' : 'forgot');
        }}
      >
        {mode === 'forgot' ? 'Back to sign in' : 'Forgotten your password?'}
      </button>
    </Frame>
  );
}

export function ChoosePassword() {
  const { setPassword } = useSession();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (a.length < 8) return setError('Use at least 8 characters.');
    if (a !== b) return setError('The two passwords do not match.');
    setBusy(true);
    const err = await setPassword(a);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <Frame>
      <h1 className="auth-title">Choose a new password</h1>
      <p className="auth-text">At least 8 characters. You will use it to sign in from now on.</p>
      <form className="auth-form" onSubmit={submit} noValidate>
        <label className="field">
          <span className="field-label">New password</span>
          <input className="input" type="password" autoComplete="new-password" value={a} onChange={e => setA(e.target.value)} autoFocus />
        </label>
        <label className="field">
          <span className="field-label">Type it again</span>
          <input className="input" type="password" autoComplete="new-password" value={b} onChange={e => setB(e.target.value)} />
        </label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save and sign in'}
        </button>
      </form>
    </Frame>
  );
}

export function Blocked({ message }: { message: string }) {
  const { signOut } = useSession();
  return (
    <Frame>
      <h1 className="auth-title">You cannot open the console with this login</h1>
      <p className="auth-text">{message}</p>
      <button type="button" className="btn btn-secondary auth-submit" onClick={() => void signOut()}>
        Sign in with another login
      </button>
    </Frame>
  );
}
