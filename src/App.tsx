import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Shell } from './components/Shell';
import { SectionLayout } from './components/SectionLayout';
import { Dashboard } from './pages/Dashboard';
import { Coming, NotFound } from './pages/Coming';
import { SettingsHome } from './pages/SettingsHome';
import { Approvals } from './pages/Approvals';
import { ApprovalsDecided } from './pages/ApprovalsDecided';
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
};

function TitleAndScroll() {
  const { pathname } = useLocation();
  useEffect(() => {
    const p = pageOf(pathname);
    document.title = p && pathname !== '/' ? `${p.label} · Mr Sales` : 'Mr Sales';
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <ThemeProvider>
      <SessionProvider>
        <BrowserRouter>
          <Gate />
        </BrowserRouter>
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
          {NEW_ACTIONS.filter(a => allowed(a.module)).map(a => (
            <Route key={a.path} path={a.path} element={<SectionLayout><Coming /></SectionLayout>} />
          ))}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Shell>
    </>
  );
}
