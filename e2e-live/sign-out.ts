/**
 * After the run: signs each role's session out on the server and deletes the
 * saved state, so no live session outlives the suite on this machine.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { LIVE_ROLES, stateFor } from './roles';

export default async function signOut() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  for (const { role } of LIVE_ROLES) {
    const file = stateFor(role);
    if (!existsSync(file) || !url || !key) continue;
    try {
      const state = JSON.parse(readFileSync(file, 'utf8'));
      const item = state.origins.flatMap((o: { localStorage: { name: string; value: string }[] }) => o.localStorage)
        .find((i: { name: string }) => i.name.includes('auth-token'));
      const token = item ? JSON.parse(item.value).access_token : null;
      if (token) await fetch(`${url}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${token}` } });
    } catch { /* the file is deleted below either way */ }
  }
  rmSync('e2e-live/.auth', { recursive: true, force: true });
}
