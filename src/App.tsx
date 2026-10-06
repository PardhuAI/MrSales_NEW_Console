import { Suspense, lazy, useEffect, useState, type ComponentType } from 'react';
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PageError } from './components/PageError';
import { Loading as PageLoading } from './components/States';
import { Shell } from './components/Shell';
import { SectionLayout } from './components/SectionLayout';
import { Coming, NotFound } from './pages/Coming';
import { ThemeProvider } from './app/theme';
import { SessionProvider, useSession } from './live/session';
import { Blocked, ChoosePassword, Loading, SignIn } from './pages/SignIn';
import { ACCOUNT_PAGES, NEW_ACTIONS, SECTIONS, pageOf } from './app/nav';
import { useCan } from './app/access';

/**
 * Each page is its own download, fetched the first time it is opened, so the
 * console opens without carrying every screen. A page that fails to draw is
 * caught by PageError inside the shell, and a slow download shows a quiet
 * line only after a moment, so a fast one never flashes.
 */
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  const KEY = 'mrsales.reloaded-for-release';
  return lazy(() => load().then(m => {
    // A page file arrived, so a later stale one may reload once again.
    try { sessionStorage.removeItem(KEY); } catch { /* not needed */ }
    return { default: m[name] };
  }, e => {
    // A tab left open across a release asks for page files that no longer
    // exist. Reload once to fetch the new release; a second failure is real
    // and is shown by PageError rather than reloading forever.
    let tried = false;
    try { tried = sessionStorage.getItem(KEY) === '1'; sessionStorage.setItem(KEY, '1'); } catch { tried = true; }
    if (!tried) window.location.reload();
    throw e;
  }));
}

function Opening() {
  const [show, setShow] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setShow(true), 300); return () => window.clearTimeout(t); }, []);
  return show ? <PageLoading label="Opening the page" lines={1} /> : null;
}

const Dashboard = page(() => import('./pages/Dashboard'), 'Dashboard');
const SettingsHome = page(() => import('./pages/SettingsHome'), 'SettingsHome');
const Approvals = page(() => import('./pages/Approvals'), 'Approvals');
const ApprovalsDecided = page(() => import('./pages/ApprovalsDecided'), 'ApprovalsDecided');
const Attention = page(() => import('./pages/Attention'), 'Attention');
const FieldActivity = page(() => import('./pages/field/Activity'), 'FieldActivity');
const PersonDay = page(() => import('./pages/field/PersonDay'), 'PersonDay');
const DayPlans = page(() => import('./pages/field/Plans'), 'DayPlans');
const TourPlans = page(() => import('./pages/field/Plans'), 'TourPlans');
const Coverage = page(() => import('./pages/field/Coverage'), 'Coverage');
const ClientList = page(() => import('./pages/clients/ClientList'), 'ClientList');
const ClientRecordPage = page(() => import('./pages/clients/ClientRecord'), 'ClientRecordPage');
const ClientQuality = page(() => import('./pages/clients/Quality'), 'ClientQuality');
const Complaints = page(() => import('./pages/clients/Complaints'), 'Complaints');
const Sales = page(() => import('./pages/sales/Sales'), 'Sales');
const Orders = page(() => import('./pages/sales/Orders'), 'Orders');
const Targets = page(() => import('./pages/sales/Targets'), 'Targets');
const Rcpa = page(() => import('./pages/sales/Rcpa'), 'Rcpa');
const Products = page(() => import('./pages/sales/Products'), 'Products');
const Stockists = page(() => import('./pages/sales/Stockists'), 'Stockists');
const Stock = page(() => import('./pages/sales/Stock'), 'Stock');
const People = page(() => import('./pages/team/People'), 'People');
const AddPerson = page(() => import('./pages/team/AddPerson'), 'AddPerson');
const PersonRecordPage = page(() => import('./pages/team/PersonRecord'), 'PersonRecordPage');
const ManagerPage = page(() => import('./pages/team/Managers'), 'ManagerPage');
const Managers = page(() => import('./pages/team/Managers'), 'Managers');
const Messages = page(() => import('./pages/share/Messages'), 'Messages');
const OrgChart = page(() => import('./pages/team/OrgChart'), 'OrgChart');
const Attendance = page(() => import('./pages/team/PeopleOps'), 'Attendance');
const Leave = page(() => import('./pages/team/PeopleOps'), 'Leave');
const Tasks = page(() => import('./pages/team/PeopleOps'), 'Tasks');
const Claims = page(() => import('./pages/money/Claims'), 'Claims');
const Payroll = page(() => import('./pages/money/Payroll'), 'Payroll');
const Salaries = page(() => import('./pages/money/Salaries'), 'Salaries');
const PaySetup = page(() => import('./pages/settings/PaySetup'), 'PaySetup');
const CompanyPage = page(() => import('./pages/settings/Company'), 'Company');
const Resources = page(() => import('./pages/share/Share'), 'Resources');
const SentNotifications = page(() => import('./pages/share/Share'), 'SentNotifications');
const Surveys = page(() => import('./pages/share/Share'), 'Surveys');
const Downloads = page(() => import('./pages/reports/Reports'), 'Downloads');
const Reports = page(() => import('./pages/reports/Reports'), 'Reports');
const AuditLog = page(() => import('./pages/settings/Rules'), 'AuditLog');
const CompanyRules = page(() => import('./pages/settings/Rules'), 'CompanyRules');
const HrRules = page(() => import('./pages/settings/Rules'), 'HrRules');
const Ownership = page(() => import('./pages/settings/Rules'), 'Ownership');
const Geography = page(() => import('./pages/settings/Setup'), 'Geography');
const Logins = page(() => import('./pages/settings/Setup'), 'Logins');
const Roles = page(() => import('./pages/settings/Setup'), 'Roles');
const BillingPage = page(() => import('./pages/account/Account'), 'BillingPage');
const Help = page(() => import('./pages/account/Account'), 'Help');


/** Pages that are rebuilt; every other page in nav.ts shows <Coming />. */
const BUILT: Record<string, JSX.Element> = {
  '/': <Dashboard />,
  '/settings': <SettingsHome />,
  '/approvals': <Approvals />,
  '/approvals/decided': <ApprovalsDecided />,
  '/attention': <Attention />,
  '/field': <FieldActivity />,
  '/field/day-plans': <DayPlans />,
  '/field/tour-plans': <TourPlans />,
  '/field/coverage': <Coverage />,
  '/clients': <ClientList />,
  '/clients/quality': <ClientQuality />,
  '/clients/complaints': <Complaints />,
  '/sales': <Sales />,
  '/sales/orders': <Orders />,
  '/sales/targets': <Targets />,
  '/sales/prescriptions': <Rcpa />,
  '/sales/products': <Products />,
  '/sales/stockists': <Stockists />,
  '/sales/stock': <Stock />,
  '/team': <People />,
  '/team/managers': <Managers />,
  '/team/org-chart': <OrgChart />,
  '/team/attendance': <Attendance />,
  '/team/leave': <Leave />,
  '/team/tasks': <Tasks />,
  '/money': <Claims />,
  '/money/payroll': <Payroll />,
  '/money/salaries': <Salaries />,
  '/share': <Resources />,
  '/share/surveys': <Surveys />,
  '/share/messages': <Messages />,
  '/share/sent': <SentNotifications />,
  '/reports': <Reports />,
  '/reports/downloads': <Downloads />,
  '/settings/company': <CompanyPage />,
  '/settings/pay': <PaySetup />,
  '/settings/rules': <CompanyRules />,
  '/settings/geography': <Geography />,
  '/settings/roles': <Roles />,
  '/settings/logins': <Logins />,
  '/settings/hr': <HrRules />,
  '/settings/ownership': <Ownership />,
  '/settings/audit': <AuditLog />,
  '/help': <Help />,
  '/billing': <BillingPage />,
};

/** Records and other pages reached from a list rather than the menu. */
const DETAIL: { path: string; module: string; element: JSX.Element }[] = [
  { path: '/field/:employeeId/:date', module: 'field', element: <PersonDay /> },
  { path: '/clients/new', module: 'clients', element: <ClientList /> },
  { path: '/clients/:id', module: 'clients', element: <ClientRecordPage /> },
  { path: '/sales/targets/new', module: 'targets', element: <Targets /> },
  { path: '/sales/products/new', module: 'products', element: <Products /> },
  { path: '/sales/stockists/new', module: 'stockists', element: <Stockists /> },
  { path: '/team/new', module: 'onboarding', element: <AddPerson /> },
  { path: '/team/import', module: 'onboarding', element: <People /> },
  { path: '/team/tasks/new', module: 'tasks', element: <Tasks /> },
  { path: '/team/managers/:id', module: 'people', element: <ManagerPage /> },
  { path: '/team/:id', module: 'people', element: <PersonRecordPage /> },
  { path: '/settings/hr/holiday', module: 'hr', element: <HrRules /> },
  { path: '/share/new', module: 'resources', element: <Resources /> },
  { path: '/share/surveys/new', module: 'surveys', element: <Surveys /> },
  { path: '/settings/logins/invite', module: 'users', element: <Logins /> },
];

function TitleAndScroll() {
  const { pathname } = useLocation();
  useEffect(() => {
    const p = pageOf(pathname);
    document.title = p && pathname !== '/' ? `${p.label} · Mr Sales` : 'Mr Sales';
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

/**
 * A preview build (VITE_PREVIEW=1) is shown inside a hosted page whose own
 * address the console cannot use, so it keeps its place in memory instead.
 */
const Router = ({ children }: { children: JSX.Element }) =>
  import.meta.env.VITE_PREVIEW
    ? <MemoryRouter initialEntries={[import.meta.env.VITE_PREVIEW_START || '/']}>{children}</MemoryRouter>
    : <BrowserRouter>{children}</BrowserRouter>;

export function App() {
  return (
    <ThemeProvider>
      <SessionProvider>
        <Router>
          <Gate />
        </Router>
      </SessionProvider>
    </ThemeProvider>
  );
}

/** Signed in, the console; otherwise the one screen that applies. */
function Gate() {
  const { state } = useSession();
  switch (state.status) {
    case 'loading':
      return <Loading />;
    case 'signedOut':
      return <SignIn message={state.message} />;
    case 'recovery':
      return <ChoosePassword />;
    case 'blocked':
      return <Blocked message={state.message} />;
    case 'signedIn':
      return <Console />;
  }
}

function Console() {
  const allowed = useCan();
  const loc = useLocation();
  const pages = [...SECTIONS.flatMap(s => s.pages), ...ACCOUNT_PAGES];
  return (
    <>
      <TitleAndScroll />
      <Shell>
        <PageError at={loc.pathname}>
        <Suspense fallback={<Opening />}>
        <Routes>
          {pages.filter(p => allowed(p.module)).map(p => (
            <Route
              key={p.path}
              path={p.path}
              element={
                <SectionLayout hideTitle={p.path === '/'}>
                  {BUILT[p.path] ?? <Coming />}
                </SectionLayout>
              }
            />
          ))}
          {DETAIL.filter(d => allowed(d.module)).map(d => (
            <Route key={d.path} path={d.path} element={<SectionLayout>{d.element}</SectionLayout>} />
          ))}
          {NEW_ACTIONS.filter(a => allowed(a.module) && !DETAIL.some(d => d.path === a.path)).map(a => (
            <Route key={a.path} path={a.path} element={<SectionLayout><Coming /></SectionLayout>} />
          ))}
          {/* A page this role may not open keeps its own route, so it says so rather than falling into a record's address. */}
          {pages.filter(p => !allowed(p.module)).map(p => (
            <Route key={`no:${p.path}`} path={p.path} element={<SectionLayout><NotFound /></SectionLayout>} />
          ))}
          {/* The same for actions and fixed addresses: "Add a person" without the
              permission must not fall into /team/:id and load a person called "new". */}
          {[...NEW_ACTIONS.map(a => ({ path: a.path, module: a.module })), ...DETAIL.filter(d => !d.path.includes(':'))]
            .filter(x => !allowed(x.module) && !pages.some(p => p.path === x.path))
            .map(x => (
              <Route key={`no:${x.path}`} path={x.path} element={<SectionLayout><NotFound /></SectionLayout>} />
            ))}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </PageError>
      </Shell>
    </>
  );
}
