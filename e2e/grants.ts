/**
 * Every menu page and the roles granted to it, shared by the demo suite (e2e/)
 * and the live suite (e2e-live/), so both test the same specification.
 */
import { readFileSync } from 'node:fs';

export type Role = 'owner' | 'admin' | 'hr' | 'it' | 'finance' | 'management';

// Every menu page, read from the menu itself so a new page is tested the day it is added.
const nav = readFileSync(new URL('../src/app/nav.ts', import.meta.url), 'utf8');
export const pages = [...nav.matchAll(/path: '([^']+)', label: '([^']+)', module: '([^']+)'/g)].map(m => ({ path: m[1], label: m[2].replace(/\\'/g, "'"), module: m[3] }));

/** The old console's grants (Mr_Sales_Web/src/data/store.ts GRANTS), written out as the specification, plus chat for every role (owner decision, 5 October 2026), pay setup for the roles that pay or set expense rules, and announcements for owner, admin, HR and management (6 October 2026). */
export const GRANTS: Record<Role, string[]> = {
  owner: ['*'],
  admin: ['dashboard', 'attention', 'field', 'clients', 'sales', 'orders', 'targets', 'products', 'stockists', 'people', 'org', 'geo', 'roles', 'resources', 'surveys', 'complaints', 'tours', 'rcpa', 'coverage', 'stock', 'onboarding', 'hr', 'tasks', 'notifications', 'ownership', 'reports', 'exports', 'config', 'paysetup', 'users', 'approvals', 'leave', 'expenses', 'attendance', 'audit', 'help', 'billing', 'chat', 'announcements'],
  hr: ['dashboard', 'attention', 'people', 'org', 'roles', 'attendance', 'leave', 'documents', 'tours', 'hr', 'onboarding', 'payroll', 'paysetup', 'ownership', 'reports', 'exports', 'config', 'approvals', 'help', 'chat', 'announcements'],
  it: ['dashboard', 'people', 'org', 'users', 'roles', 'audit', 'health', 'config', 'onboarding', 'help', 'chat'],
  finance: ['dashboard', 'attention', 'expenses', 'approvals', 'sales', 'orders', 'targets', 'people', 'payroll', 'paysetup', 'reports', 'exports', 'config', 'help', 'billing', 'chat'],
  management: ['dashboard', 'attention', 'field', 'clients', 'sales', 'orders', 'targets', 'people', 'resources', 'surveys', 'complaints', 'tours', 'rcpa', 'coverage', 'stock', 'stockists', 'tasks', 'notifications', 'reports', 'exports', 'expenses', 'help', 'chat', 'announcements'],
};
export const can = (role: Role, module: string) => GRANTS[role].includes('*') || GRANTS[role].includes(module);

