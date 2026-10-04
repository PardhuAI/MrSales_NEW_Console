import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { db, isLive, supabase } from './client';
import type { Role } from '../app/access';

/**
 * Who is signed in, to which organisation, with which role. Read once at
 * sign-in from the account itself (app_users, my_org_access), never inferred.
 */
export type Identity = {
  userId: string;
  email: string;
  name: string;
  initials: string;
  orgId: string;
  orgName: string;
  role: Role;
  scope: string;
  employeeId: string | null;
  disabledModules: string[];
  pastDue: boolean;
  demo: boolean;
};

const CONSOLE_ROLES: Role[] = ['owner', 'admin', 'hr', 'it', 'finance', 'management'];

/** Who each role is in the demo company, so the role picker shows a believable person. */
const DEMO_PEOPLE: Record<Role, string> = {
  owner: 'Pardhu Karnati', admin: 'Sneha Kapoor', hr: 'Anusha Rao', it: 'Kiran Kumar', finance: 'Ramesh Iyer', management: 'Venkata Ramana Rao',
};
const demoIdentity = (role: Role): Identity => ({
  ...DEMO_IDENTITY,
  role,
  name: DEMO_PEOPLE[role],
  initials: initialsOf(DEMO_PEOPLE[role]),
  scope: role === 'management' ? 'team' : 'company',
});
const DEMO_ROLE_KEY = 'mrsales.demoRole';
const savedDemoRole = (): Role => {
  try {
    const r = sessionStorage.getItem(DEMO_ROLE_KEY) as Role | null;
    return r && CONSOLE_ROLES.includes(r) ? r : 'owner';
  } catch {
    return 'owner';
  }
};

const initialsOf = (name: string) =>
  name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0]!.toUpperCase()).join('');

export const DEMO_IDENTITY: Identity = {
  userId: 'demo',
  email: 'demo@mrsales.in',
  name: 'Pardhu Karnati',
  initials: 'PK',
  orgId: 'demo',
  orgName: 'Cleocure Lifesciences',
  role: 'owner',
  scope: 'company',
  employeeId: null,
  disabledModules: [],
  pastDue: false,
  demo: true,
};

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut'; message?: string }
  | { status: 'recovery' }
  | { status: 'blocked'; message: string }
  | { status: 'signedIn'; me: Identity };

async function whoAmI(): Promise<SessionState> {
  const sb = db();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return { status: 'signedOut' };

  const { data: accessRows, error: accessError } = await sb.rpc('my_org_access');
  if (accessError) throw new Error(`Could not read your organisation's access: ${accessError.message}`);
  const access = (accessRows as { org_name: string; status: string; disabled_modules: string[] | null }[] | null)?.[0];
  if (access && (access.status === 'suspended' || access.status === 'closed')) {
    return {
      status: 'blocked',
      message: `${access.org_name}'s account is ${access.status}. Contact Mr Sales at support@mrsales.in to restore access.`,
    };
  }

  const { data, error } = await sb
    .from('app_users')
    .select('org_id, role, scope, employee_id, status, organisations(name)')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (error) throw new Error(`Could not read your account: ${error.message}`);
  if (!data) {
    return { status: 'blocked', message: `${auth.user.email} is signed in, but is not linked to any organisation yet. An owner adds this login under Settings, Logins and access.` };
  }
  if (!CONSOLE_ROLES.includes(data.role as Role)) {
    return { status: 'blocked', message: 'This is a phone login. Field people use the Mr Sales app; the console is for office logins.' };
  }
  if (data.status && data.status !== 'active') {
    return { status: 'blocked', message: 'This login has been suspended. Ask an owner or admin in your company to restore it.' };
  }

  let name = auth.user.email ?? 'You';
  if (data.employee_id) {
    const { data: emp } = await sb.from('employees').select('name').eq('id', data.employee_id).maybeSingle();
    if (emp?.name) name = emp.name;
  }
  const org = data.organisations as unknown as { name: string } | null;
  return {
    status: 'signedIn',
    me: {
      userId: auth.user.id,
      email: auth.user.email ?? '',
      name,
      initials: initialsOf(name),
      orgId: data.org_id,
      orgName: org?.name ?? access?.org_name ?? 'Your organisation',
      role: data.role as Role,
      scope: data.scope ?? 'company',
      employeeId: data.employee_id,
      disabledModules: access?.disabled_modules ?? [],
      pastDue: access?.status === 'past_due',
      demo: false,
    },
  };
}

const onWelcome = () => window.location.pathname === '/welcome';
const DEAD_LINK = 'That email link has expired or was already used. Sign in, or choose "Forgotten your password?" for a new link.';

const signOutHooks: (() => void)[] = [];
/** Runs on every sign-out, so data read for one login never shows to the next. */
export const onSignOut = (f: () => void) => signOutHooks.push(f);

type Ctx = {
  state: SessionState;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  sendReset: (email: string) => Promise<string | null>;
  setPassword: (password: string) => Promise<string | null>;
  /** Demo only: see the console as another of the six roles. */
  viewAs: ((role: Role) => void) | null;
};

const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(
    isLive ? { status: 'loading' } : { status: 'signedIn', me: demoIdentity(savedDemoRole()) },
  );

  const refresh = async () => {
    try {
      const next = await whoAmI();
      // An invitation or a reset email lands on /welcome, already signed in from
      // the link but with no password of their own yet: they choose one first.
      if (onWelcome() && next.status === 'signedIn') setState({ status: 'recovery' });
      else if (onWelcome() && next.status === 'signedOut') setState({ status: 'signedOut', message: DEAD_LINK });
      else setState(next);
    } catch (e) {
      setState({ status: 'blocked', message: e instanceof Error ? e.message : 'Could not reach Mr Sales.' });
    }
  };

  useEffect(() => {
    if (!supabase) return;
    void refresh();
    const { data } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') setState({ status: 'recovery' });
      else if (event === 'SIGNED_OUT') setState({ status: 'signedOut' });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const ctx: Ctx = {
    state,
    async signIn(email, password) {
      const { error } = await db().auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        return error.message.toLowerCase().includes('invalid')
          ? 'That email and password do not match. Check both, or reset your password.'
          : error.message;
      }
      await refresh();
      return null;
    },
    async signOut() {
      if (supabase) await supabase.auth.signOut();
      signOutHooks.forEach(f => f());
      setState(isLive ? { status: 'signedOut' } : { status: 'signedIn', me: demoIdentity('owner') });
    },
    async sendReset(email) {
      const { error } = await db().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/welcome` });
      return error ? error.message : null;
    },
    viewAs: isLive ? null : role => {
      try {
        sessionStorage.setItem(DEMO_ROLE_KEY, role);
      } catch {
        // Remembering the choice is a convenience; the switch works without it.
      }
      setState({ status: 'signedIn', me: demoIdentity(role) });
    },
    async setPassword(password) {
      const { error } = await db().auth.updateUser({ password });
      if (error) return error.message;
      // Clears the prompt a manager-set password leaves; an older database has no such call.
      await db().rpc('password_changed', {}).then(() => undefined, () => undefined);
      window.history.replaceState(null, '', '/');
      await refresh();
      return null;
    },
  };

  return <SessionCtx.Provider value={ctx}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error('useSession outside SessionProvider');
  return c;
}

/** The signed-in person. Only rendered inside the signed-in console. */
export function useMe(): Identity {
  const { state } = useSession();
  if (state.status !== 'signedIn') throw new Error('Not signed in');
  return state.me;
}
