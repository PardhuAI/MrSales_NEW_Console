/**
 * The part of Supabase Auth the account page uses, in memory: checking the
 * current password by signing in again, changing it, signing out other
 * devices, and two-step sign-in with an authenticator app (TOTP). Any six
 * digits are a right code here; the live project checks them for real.
 *
 * The demo login's password is DEMO_PASSWORD, shown on the page in the demo
 * only, so the "wrong current password" path can be tried.
 */

export const DEMO_PASSWORD = 'Cleocure@2026';

type Factor = { id: string; factor_type: 'totp'; friendly_name: string; status: 'verified' | 'unverified'; created_at: string; updated_at: string };

const later = <T>(f: () => T) => new Promise<T>(r => setTimeout(() => r(f()), 60));
const err = (message: string) => ({ data: null, error: { message, name: 'AuthApiError', status: 400 } });
const now = () => new Date().toISOString();

/** A QR-like square drawn from the secret. It is demo data and does not scan. */
function demoQr(secret: string) {
  const n = 21;
  let bits = '';
  for (let i = 0; bits.length < n * n; i++) bits += (secret.charCodeAt(i % secret.length) * (i + 7)).toString(2);
  const cells: string[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const finder = (x < 7 && y < 7) || (x > n - 8 && y < 7) || (x < 7 && y > n - 8);
      const on = finder ? (x % (n - 7) === 0 || y % (n - 7) === 0 || x % (n - 7) === 6 || y % (n - 7) === 6 || ((x % (n - 7)) > 1 && (x % (n - 7)) < 5 && (y % (n - 7)) > 1 && (y % (n - 7)) < 5)) : bits[y * n + x] === '1';
      if (on) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }
  }
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><g fill="#1d1d1f">${cells.join('')}</g></svg>`)}`;
}

export function fakeAuth(user: { id: string; email: string }) {
  let password = DEMO_PASSWORD;
  let level: 'aal1' | 'aal2' = 'aal1';
  let factors: Factor[] = [];
  const verified = () => factors.filter(f => f.status === 'verified');
  const sixDigits = (code: unknown) => /^\d{6}$/.test(String(code ?? ''));

  return {
    signInWithPassword: ({ email, password: p }: { email: string; password: string }) => later(() => {
      if (email.trim().toLowerCase() !== user.email || p !== password) return err('Invalid login credentials');
      // Signing in again starts a fresh session at the first level, as the live project does.
      level = 'aal1';
      return { data: { user, session: {} }, error: null };
    }),
    updateUser: ({ password: p }: { password?: string }) => later(() => {
      if (p !== undefined) {
        if (p.length < 6) return err('Password should be at least 6 characters.');
        if (p === password) return err('New password should be different from the old password.');
        if (verified().length && level !== 'aal2') return err('AAL2 session is required to update a password when two-step sign-in is on.');
        password = p;
      }
      return { data: { user }, error: null };
    }),
    signOut: (_opts?: { scope?: 'global' | 'local' | 'others' }) => later(() => ({ error: null })),
    mfa: {
      listFactors: () => later(() => ({ data: { all: factors, totp: verified(), phone: [] }, error: null })),
      getAuthenticatorAssuranceLevel: () => later(() => ({
        data: { currentLevel: level, nextLevel: verified().length ? 'aal2' : 'aal1', currentAuthenticationMethods: [] }, error: null,
      })),
      enroll: ({ factorType, friendlyName }: { factorType: string; friendlyName?: string }) => later(() => {
        if (factorType !== 'totp') return err('Only an authenticator app is offered.');
        const id = crypto.randomUUID();
        const secret = Array.from(crypto.getRandomValues(new Uint8Array(20)), b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[b % 32]).join('');
        factors = factors.filter(f => f.status === 'verified');
        factors.push({ id, factor_type: 'totp', friendly_name: friendlyName ?? 'Authenticator app', status: 'unverified', created_at: now(), updated_at: now() });
        return { data: { id, type: 'totp', totp: { qr_code: demoQr(secret), secret, uri: `otpauth://totp/Mr%20Sales:${user.email}?secret=${secret}&issuer=Mr%20Sales` } }, error: null };
      }),
      challenge: ({ factorId }: { factorId: string }) => later(() =>
        factors.some(f => f.id === factorId) ? { data: { id: crypto.randomUUID(), type: 'totp', expires_at: Date.now() / 1000 + 300 }, error: null } : err('Factor not found')),
      verify: ({ factorId, code }: { factorId: string; challengeId: string; code: string }) => later(() => {
        const f = factors.find(x => x.id === factorId);
        if (!f) return err('Factor not found');
        if (!sixDigits(code)) return err('Invalid TOTP code entered');
        f.status = 'verified';
        f.updated_at = now();
        level = 'aal2';
        return { data: { access_token: 'demo', user }, error: null };
      }),
      challengeAndVerify: ({ factorId, code }: { factorId: string; code: string }) => later(() => {
        const f = factors.find(x => x.id === factorId);
        if (!f) return err('Factor not found');
        if (!sixDigits(code)) return err('Invalid TOTP code entered');
        f.status = 'verified';
        level = 'aal2';
        return { data: { access_token: 'demo', user }, error: null };
      }),
      unenroll: ({ factorId }: { factorId: string }) => later(() => {
        const f = factors.find(x => x.id === factorId);
        if (!f) return err('Factor not found');
        if (f.status === 'verified' && level !== 'aal2') return err('AAL2 required to unenroll a verified factor');
        factors = factors.filter(x => x.id !== factorId);
        return { data: { id: factorId }, error: null };
      }),
    },
  };
}
