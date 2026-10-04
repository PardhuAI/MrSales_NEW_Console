import { Link } from 'react-router-dom';
import { CaretRight } from '@phosphor-icons/react';
import { SECTIONS } from '../app/nav';
import { useCan } from '../app/access';
import { Arrive } from '../components/motion';

/**
 * Every setting on one calm page, grouped by what it is about, like the
 * settings on a Mac. The old console spread these across eleven menu items.
 */
const GROUPS: { title: string; paths: string[] }[] = [
  { title: 'Your company', paths: ['/settings/rules', '/settings/geography', '/settings/roles'] },
  { title: 'People and access', paths: ['/settings/logins', '/settings/hr', '/settings/ownership'] },
  { title: 'Records', paths: ['/settings/audit'] },
];

export function SettingsHome() {
  const pages = SECTIONS.find(s => s.id === 'settings')!.pages;
  const allowed = useCan();
  return (
    <div className="settings-home">
      {GROUPS.map((g, gi) => {
        const rows = g.paths.map(p => pages.find(x => x.path === p)!).filter(p => allowed(p.module));
        if (!rows.length) return null;
        return (
          <Arrive as="section" key={g.title} index={gi} className="settings-group">
            <h2 className="settings-group-title">{g.title}</h2>
            <ul className="settings-list">
              {rows.map(p => (
                <li key={p.path}>
                  <Link to={p.path} className="settings-row">
                    <span className="settings-text">
                      <span className="settings-label">{p.label}</span>
                      <span className="settings-about">{p.about}</span>
                    </span>
                    <CaretRight size={14} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </Arrive>
        );
      })}
    </div>
  );
}
