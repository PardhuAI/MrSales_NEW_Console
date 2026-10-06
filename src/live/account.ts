import { db } from './client';

/**
 * Your account: the password, two-step sign-in with an authenticator app,
 * other devices, and what this login has changed. All of it is Supabase Auth
 * acting on the signed-in login only; nothing here can touch anyone else's.
 */

const sentence = (m: string) => m.charAt(0).toUpperCase() + m.slice(1).replace(/\.?$/, '.');

/** What Supabase Auth says, in words an owner understands. */
function plain(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'That is not your current password.';
  if (m.includes('different from the old')) return 'The new password is the same as the current one. Choose a different one.';
  if (m.includes('invalid totp') || m.includes('invalid code')) return 'That code did not match. Codes change every 30 seconds; type the one showing now.';
  if (m.includes('expired')) return 'That code has expired. Type the one showing now.';
  if (m.includes('mfa') && (m.includes('disabled') || m.includes('not enabled'))) return 'Two-step sign-in is not switched on for Mr Sales yet. It needs to be enabled by Mr Sales first.';
  if (m.includes('aal2')) return 'Confirm with the six-digit code from your authenticator app first.';
  if (m.includes('weak') || m.includes('pwned')) return 'That password is known from leaks elsewhere. Choose another.';
  return sentence(message);
}
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(plain(e.message));
};

// ── the password ──────────────────────────────────────────────────────

/** The rules an office password is held to, the same as when it was first chosen. */
export const PASSWORD_RULES: { label: string; met: (p: string) => boolean }[] = [
  { label: 'At least 12 characters', met: p => p.length >= 12 },
  { label: 'Upper and lower case letters', met: p => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: 'At least one digit', met: p => /\d/.test(p) },
  { label: 'Does not start with password, welcome or mrsales', met: p => p.length > 0 && !/^(password|welcome|mrsales)/i.test(p) },
];

/**
 * Checks the current password by signing in with it again, then changes it.
 * With two-step sign-in on, signing in again starts at the first step, so the
 * code is asked for here too and the session is lifted back before the change.
 */
export async function changePassword(email: string, current: string, next: string, code: string | null): Promise<void> {
  const auth = db().auth;
  const again = await auth.signInWithPassword({ email, password: current });
  if (again.error) throw new Error(plain(again.error.message));
  if (code) await secondStep(code);
  fail((await auth.updateUser({ password: next })).error);
  // Clears the prompt a manager-set password leaves; an older database has no such call.
  await db().rpc('password_changed', {}).then(() => undefined, () => undefined);
}

// ── two-step sign-in ──────────────────────────────────────────────────

export type TwoStep = { on: boolean; factorId: string | null; since: string | null };

export async function twoStepStatus(): Promise<TwoStep> {
  const { data, error } = await db().auth.mfa.listFactors();
  fail(error);
  const f = data?.totp?.find(x => x.status === 'verified') ?? null;
  return { on: Boolean(f), factorId: f?.id ?? null, since: f?.created_at ?? null };
}

export type Enrolment = { factorId: string; qr: string; secret: string };

/** Starts adding an authenticator app: a QR code to scan, and the secret as text to type. */
export async function startTwoStep(): Promise<Enrolment> {
  const mfa = db().auth.mfa;
  // An app added and never confirmed blocks a new one with the same name; clear it first.
  const list = await mfa.listFactors();
  for (const f of list.data?.all ?? []) {
    if (f.factor_type === 'totp' && f.status !== 'verified') await mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await mfa.enroll({ factorType: 'totp', friendlyName: `Mr Sales console ${new Date().toISOString().slice(0, 16)}` });
  fail(error);
  if (!data || data.type !== 'totp') throw new Error('The authenticator app could not be added. Try again.');
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Confirms the app with its first code; from then on every sign-in asks for one. */
export async function confirmTwoStep(factorId: string, code: string): Promise<void> {
  fail((await db().auth.mfa.challengeAndVerify({ factorId, code: code.trim() })).error);
}

/** Turns it off, with a current code as proof that this is the person who turned it on. */
export async function turnOffTwoStep(factorId: string, code: string): Promise<void> {
  const mfa = db().auth.mfa;
  fail((await mfa.challengeAndVerify({ factorId, code: code.trim() })).error);
  fail((await mfa.unenroll({ factorId })).error);
}

/** True when the login has an app and this session has not given its code yet. */
export async function needsSecondStep(): Promise<boolean> {
  const { data, error } = await db().auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return false;
  return data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
}

/** The code at sign-in, or before a change that needs the session lifted. */
export async function secondStep(code: string): Promise<void> {
  const { factorId } = await twoStepStatus();
  if (!factorId) return;
  await confirmTwoStep(factorId, code);
}

// ── devices ───────────────────────────────────────────────────────────

export async function signOutOthers(): Promise<void> {
  fail((await db().auth.signOut({ scope: 'others' })).error);
}

// ── what this login changed ───────────────────────────────────────────

export type Activity = { id: string; action: string; entity: string; label: string | null; reason: string | null; at: string };

export async function loadMyActivity(): Promise<Activity[]> {
  const sb = db();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return [];
  const { data, error } = await sb.from('audit_log').select('id, action, entity, entity_label, reason, at')
    .eq('actor_user', auth.user.id).order('at', { ascending: false }).limit(20);
  if (error) throw new Error(`Could not read your recent changes: ${error.message}`);
  const rows = (data ?? []) as { id: string; action: string; entity: string; entity_label: string | null; reason: string | null; at: string }[];
  return rows.map(r => ({ id: r.id, action: r.action, entity: r.entity, label: r.entity_label, reason: r.reason, at: r.at }));
}
