import { useEffect } from 'react';
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Shell } from './components/Shell';
import { SectionLayout } from './components/SectionLayout';
import { Dashboard } from './pages/Dashboard';
import { Coming, NotFound } from './pages/Coming';
import { SettingsHome } from './pages/SettingsHome';
import { Approvals } from './pages/Approvals';
import { ApprovalsDecided } from './pages/ApprovalsDecided';
import { Attention } from './pages/Attention';
import { FieldActivity } from './pages/field/Activity';
import { PersonDay } from './pages/field/PersonDay';
import { DayPlans, TourPlans } from './pages/field/Plans';
import { Coverage } from './pages/field/Coverage';
import { ClientList } from './pages/clients/ClientList';
import { ClientRecordPage } from './pages/clients/ClientRecord';
import { ClientQuality } from './pages/clients/Quality';
import { Complaints } from './pages/clients/Complaints';
import { Sales } from './pages/sales/Sales';
import { Orders } from './pages/sales/Orders';
import { Targets } from './pages/sales/Targets';
import { Rcpa } from './pages/sales/Rcpa';
import { Products } from './pages/sales/Products';
import { Stockists } from './pages/sales/Stockists';
import { Stock } from './pages/sales/Stock';
import { People } from './pages/team/People';
import { AddPerson } from './pages/team/AddPerson';
import { PersonRecordPage } from './pages/team/PersonRecord';
import { ManagerPage, Managers } from './pages/team/Managers';
import { OrgChart } from './pages/team/OrgChart';
import { Attendance, Leave, Tasks } from './pages/team/PeopleOps';
import { ThemeProvider } from './app/theme';
import { SessionProvider, useSession } from './live/session';
import { Blocked, ChoosePassword, Loading, SignIn } from './pages/SignIn';
import { ACCOUNT_PAGES, NEW_ACTIONS, SECTIONS, pageOf } from './app/nav';
import { useCan } from './app/access';

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
  { path: '/team/tasks/new', module: 'tasks', element: <Tasks /> },
  { path: '/team/managers/:id', module: 'people', element: <ManagerPage /> },
  { path: '/team/:id', module: 'people', element: <PersonRecordPage /> },
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
  const pages = [...SECTIONS.flatMap(s => s.pages), ...ACCOUNT_PAGES];
  return (
    <>
      <TitleAndScroll />
      <Shell>
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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Shell>
    </>
  );
}
