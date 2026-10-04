import { type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { pageOf, sectionOf } from '../app/nav';
import { useVisibleSections } from './Shell';

/**
 * Every page sits under its section's title, with all the section's pages as
 * tabs. Nothing is behind a folder: what a section holds is always in view,
 * one click away.
 */
export function SectionLayout({ children, hideTitle = false }: { children: ReactNode; hideTitle?: boolean }) {
  const loc = useLocation();
  const base = sectionOf(loc.pathname);
  const section = useVisibleSections().find(s => s.id === base?.id);
  // The tab for a record is the page it belongs under: the longest page path the address starts with.
  const current = section?.pages
    .filter(p => loc.pathname === p.path || (p.path !== '/' && loc.pathname.startsWith(`${p.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path;

  return (
    <div className="page">
      {section && (
        <header className={`section-head${hideTitle ? ' quiet' : ''}`}>
          <h1 className={hideTitle ? 'visually-hidden' : 'section-name'}>{section.label}</h1>
          {section.pages.length > 1 && (
            <nav className="tabs" aria-label={`${section.label} pages`}>
              {section.pages.map(p => (
                <NavLink key={p.path} to={p.path} end className={() => `tab${p.path === current ? ' active' : ''}`} aria-current={p.path === current ? 'page' : undefined}>
                  {p.label}
                </NavLink>
              ))}
            </nav>
          )}
        </header>
      )}
      {/* A page outside every section, such as Help or billing, still says what it is. */}
      {!section && pageOf(loc.pathname) && (
        <header className="section-head"><h1 className="section-name">{pageOf(loc.pathname)!.label}</h1></header>
      )}
      {children}
    </div>
  );
}
