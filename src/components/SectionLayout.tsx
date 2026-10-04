import { type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { sectionOf } from '../app/nav';
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

  return (
    <div className="page">
      {section && (
        <header className={`section-head${hideTitle ? ' quiet' : ''}`}>
          <h1 className={hideTitle ? 'visually-hidden' : 'section-name'}>{section.label}</h1>
          {section.pages.length > 1 && (
            <nav className="tabs" aria-label={`${section.label} pages`}>
              {section.pages.map(p => (
                <NavLink key={p.path} to={p.path} end className="tab">
                  {p.label}
                </NavLink>
              ))}
            </nav>
          )}
        </header>
      )}
      {children}
    </div>
  );
}
