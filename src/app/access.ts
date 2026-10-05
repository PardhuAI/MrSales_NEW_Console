import { useMe } from '../live/session';

/**
 * Who may open what. The matrix is the old console's, unchanged
 * (Mr_Sales_Web/src/data/store.ts GRANTS), plus chat for every role: the old
 * console had no messages, and the database decides who may write to whom.
 * The database enforces the same rules; this only decides what is shown.
 */
export type Role = 'owner' | 'admin' | 'hr' | 'it' | 'finance' | 'management';

const GRANTS: Record<Role, string[]> = {
  owner: ['*'],
  admin: ['dashboard', 'attention', 'field', 'clients', 'sales', 'orders', 'targets',
    'products', 'stockists', 'people', 'org', 'geo', 'roles', 'resources', 'surveys', 'complaints',
    'tours', 'rcpa', 'coverage', 'stock', 'onboarding', 'hr', 'tasks',
    'notifications', 'ownership', 'reports', 'exports', 'config', 'users',
    'approvals', 'leave', 'expenses', 'attendance', 'audit', 'help', 'billing', 'chat'],
  hr: ['dashboard', 'attention', 'people', 'org', 'roles', 'attendance', 'leave',
    'documents', 'tours', 'hr', 'onboarding', 'payroll', 'ownership',
    'reports', 'exports', 'config', 'approvals', 'help', 'chat'],
  it: ['dashboard', 'people', 'org', 'users', 'roles', 'audit', 'health',
    'config', 'onboarding', 'help', 'chat'],
  finance: ['dashboard', 'attention', 'expenses', 'approvals', 'sales', 'orders',
    'targets', 'people', 'payroll', 'reports', 'exports', 'config', 'help', 'billing', 'chat'],
  management: ['dashboard', 'attention', 'field', 'clients', 'sales', 'orders', 'targets',
    'people', 'resources', 'surveys', 'complaints', 'tours', 'rcpa',
    'coverage', 'stock', 'stockists', 'tasks', 'notifications', 'reports', 'exports',
    'expenses', 'help', 'chat'],
};

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Owner', admin: 'Admin', hr: 'HR', it: 'IT', finance: 'Finance', management: 'Management',
};

export const can = (role: Role, module: string) => {
  const g = GRANTS[role];
  return Boolean(g) && (g.includes('*') || g.includes(module));
};

/** Whether the signed-in person may open a module: their role, and their plan. */
export function useCan() {
  const me = useMe();
  return (module: string) => can(me.role, module) && !me.disabledModules.includes(module);
}
