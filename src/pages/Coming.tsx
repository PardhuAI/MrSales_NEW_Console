import { Link, useLocation } from 'react-router-dom';
import { NEW_ACTIONS, allPages, pageOf } from '../app/nav';
import { ROLE_LABEL, useCan } from '../app/access';
import { useMe } from '../live/session';
import { Arrive } from '../components/motion';

/**
 * A page that is designed into the structure but not rebuilt yet. It says so
 * plainly, says what it will hold, and points to where the work is done today,
 * rather than showing a screen that looks finished and does nothing.
 */
export function Coming() {
  const { pathname } = useLocation();
  const page = pageOf(pathname);
  const action = NEW_ACTIONS.find(a => a.path === pathname);
  const title = page?.label ?? action?.label ?? 'This page';

  return (
    <Arrive className="coming">
      <h2 className="page-title-lg">{title}</h2>
      {page?.about && <p className="coming-about">{page.about}</p>}
      <div className="coming-note">
        <p className="coming-state">Being rebuilt in the new design</p>
        {page?.will?.length ? (
          <ul className="coming-list">
            {page.will.map(w => <li key={w}>{w}</li>)}
          </ul>
        ) : (
          <p className="coming-text">
            Everything this page does in the current console comes across, feature for feature.
          </p>
        )}
        <p className="coming-text">
          Until then it works as before at <a className="link" href="https://app.mrsales.in">app.mrsales.in</a>.
        </p>
      </div>
      <Link className="link" to="/">Back to Today</Link>
    </Arrive>
  );
}

export function NotFound() {
  const { pathname } = useLocation();
  const me = useMe();
  const allowed = useCan();
  // A real page this role may not open says so, and who can change that, rather than pretending it is not there.
  const page = allPages().find(p => p.path === pathname || (p.path !== '/' && pathname.startsWith(`${p.path}/`)));
  if (page && !allowed(page.module)) {
    return (
      <div className="coming">
        <h1 className="page-title-lg">{page.label} is not open to your role</h1>
        <p className="coming-about">
          You are signed in as {ROLE_LABEL[me.role] ?? me.role}, and {page.label.toLowerCase()} needs the {page.module} permission, which that role does not have. An owner or admin can change your role under Logins and access.
        </p>
        <Link className="link" to="/">Back to Today</Link>
      </div>
    );
  }
  return (
    <div className="coming">
      <h1 className="page-title-lg">There is no page here</h1>
      <p className="coming-about">
        The address may be old or mistyped. Press <kbd className="kbd">⌘K</kbd> and type what you are looking for.
      </p>
      <Link className="link" to="/">Back to Today</Link>
    </div>
  );
}

export function SignedOut() {
  return (
    <div className="coming">
      <h1 className="page-title-lg">Sign out</h1>
      <p className="coming-about">Signing in and out arrives with the live connection. This preview runs on demo data.</p>
      <Link className="link" to="/">Back to Today</Link>
    </div>
  );
}
