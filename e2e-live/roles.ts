import type { Role } from '../e2e/grants';

/** Testbed Pharma's office logins, one per role. There is no owner login on the testbed. */
export const LIVE_ROLES: { role: Role; emailVar: string }[] = [
  { role: 'admin', emailVar: 'TESTBED_ADMIN_EMAIL' },
  { role: 'hr', emailVar: 'TESTBED_HR_EMAIL' },
  { role: 'it', emailVar: 'TESTBED_IT_EMAIL' },
  { role: 'finance', emailVar: 'TESTBED_FINANCE_EMAIL' },
  { role: 'management', emailVar: 'TESTBED_MANAGEMENT_EMAIL' },
];

export const haveLogins = () =>
  Boolean(process.env.VITE_SUPABASE_URL && process.env.TESTBED_PASSWORD && LIVE_ROLES.every(r => process.env[r.emailVar]));

/** Where a role's signed-in browser state is kept between tests (git-ignored). */
export const stateFor = (role: Role) => `e2e-live/.auth/${role}.json`;
