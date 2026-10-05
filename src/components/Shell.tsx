import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, List, MagnifyingGlass, Plus, X } from '@phosphor-icons/react';
import { ACCOUNT_PAGES, NEW_ACTIONS, SECTIONS, sectionOf, type Section } from '../app/nav';
import { ROLE_LABEL, useCan, type Role } from '../app/access';
import { useMe, useSession } from '../live/session';
import { THEMES, useTheme } from '../app/theme';
import { requestCount, useApprovals } from '../data/approvals';
import { CommandPalette } from './CommandPalette';

/** A section as this person sees it: only the pages their role opens. */
/** The sections as this person sees them: only the pages their role and plan open. */
export function useVisibleSections(): Section[] {
  const allowed = useCan();
  return SECTIONS
    .map(s => ({ ...s, pages: s.pages.filter(p => allowed(p.module)) }))
    .filter(s => s.pages.length > 0);
}

export function Shell({ children }: { children: ReactNode }) {
  const pending = requestCount(useApprovals().pending());
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const previewTimer = useRef<number>();
  const loc = useLocation();
  const current = sectionOf(loc.pathname);
  const sections = useVisibleSections();
  const allowed = useCan();
  const menuBtn = useRef<HTMLButtonElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const nav = useRef<HTMLElement>(null);
  const opened = useRef(false);

  // ⌘K / Ctrl K opens search from anywhere; so does "/" outside a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input, textarea, [contenteditable]');
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        e.preventDefault();
        setSearch(true);
      }
      if (e.key === 'Escape') setMenu(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Changing page closes the phone menu and any preview.
  useEffect(() => {
    setMenu(false);
    setPreview(null);
  }, [loc.pathname]);

  // Focus goes into the phone menu when it opens and back when it closes.
  useEffect(() => {
    if (menu) {
      opened.current = true;
      closeBtn.current?.focus();
    } else if (opened.current) {
      menuBtn.current?.focus();
    }
  }, [menu]);

  // On a narrow screen the closed menu is off screen; inert keeps it out of reach.
  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 960px)');
    const apply = () => nav.current?.toggleAttribute('inert', narrow.matches && !menu);
    apply();
    narrow.addEventListener('change', apply);
    return () => narrow.removeEventListener('change', apply);
  }, [menu]);

  // The preview opens after a short rest on a section, so passing over the menu
  // does not flash panels; it closes a moment after leaving, so it can be reached.
  const showPreview = (id: string) => {
    window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(() => setPreview(id), preview ? 0 : 220);
  };
  const hidePreview = () => {
    window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(() => setPreview(null), 160);
  };

  const previewed = sections.find(s => s.id === preview);
  const canPreview = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (min-width: 961px)').matches;

  return (
    <div className={`shell${menu ? ' menu-open' : ''}`}>
      <a className="skip" href="#main">Skip to content</a>

      <nav ref={nav} className="nav" id="console-menu" aria-label="Console" onMouseLeave={hidePreview}>
        <div className="nav-head">
          <Link className="brand" to="/">
            <img src="/logo.svg" alt="" width={26} height={26} />
            <span>Mr Sales</span>
          </Link>
          <button ref={closeBtn} className="icon-btn nav-close" type="button" aria-label="Close menu" onClick={() => setMenu(false)}>
            <X size={18} />
          </button>
        </div>

        <ul className="nav-sections">
          {sections.map((s, i) => {
            const SIcon = s.icon;
            const isCurrent = current?.id === s.id;
            return (
              <li key={s.id} className={s.id === 'settings' ? 'nav-last' : undefined} onMouseEnter={() => canPreview && showPreview(s.id)} data-index={i}>
                <NavLink
                  to={s.pages[0].path}
                  className={`nav-section${isCurrent ? ' current' : ''}${preview === s.id ? ' previewing' : ''}`}
                  aria-current={isCurrent ? 'true' : undefined}
                >
                  <SIcon size={19} weight={isCurrent ? 'fill' : 'regular'} aria-hidden="true" />
                  <span>{s.label}</span>
                  {s.id === 'approvals' && pending > 0 && <span className="nav-count" aria-label={`${pending} waiting`}>{pending}</span>}
                </NavLink>
                {/* The current section's pages open under it, on every screen. */}
                {isCurrent && s.pages.length > 1 && (
                  <ul className="nav-sub">
                    {s.pages.map(p => (
                      <li key={p.path}>
                        <NavLink to={p.path} end className="nav-subitem">{p.label}</NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        {previewed && canPreview && previewed.id !== current?.id && (
          <PreviewPanel
            section={previewed}
            onEnter={() => window.clearTimeout(previewTimer.current)}
            onLeave={hidePreview}
          />
        )}
      </nav>

      <button className="scrim" type="button" aria-label="Close menu" tabIndex={-1} onClick={() => setMenu(false)} />

      <div className="main">
        <header className="bar">
          <button
            ref={menuBtn}
            className="icon-btn menu-btn"
            type="button"
            aria-label="Open menu"
            aria-expanded={menu}
            aria-controls="console-menu"
            onClick={() => setMenu(true)}
          >
            <List size={20} />
          </button>

          <button className="search" type="button" onClick={() => setSearch(true)} aria-keyshortcuts="Meta+K Control+K">
            <MagnifyingGlass size={16} aria-hidden="true" />
            <span className="search-text">Search or jump to anything…</span>
            <kbd aria-hidden="true">⌘K</kbd>
          </button>

          <div className="bar-right">
            <NewMenu />
            {/* Only when something waits: a zero asks for nothing and is noise. */}
            {allowed('approvals') && pending > 0 && (
              <Link className="bar-pending" to="/approvals">
                <span className="long">{pending} waiting for you</span>
                <span className="short" aria-hidden="true">{pending} waiting</span>
              </Link>
            )}
            <AccountMenu />
          </div>
        </header>

        <main id="main" className="content" tabIndex={-1}>{children}</main>
      </div>

      <CommandPalette open={search} onOpenChange={setSearch} />
    </div>
  );
}

/** What a section holds, shown on hover before anyone has to click. */
function PreviewPanel({ section, onEnter, onLeave }: { section: Section; onEnter: () => void; onLeave: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);

  useEffect(() => {
    const row = document.querySelector<HTMLElement>(`.nav-sections > li .nav-section[href="${section.pages[0].path}"]`);
    const panel = ref.current;
    if (!row || !panel) return;
    const r = row.getBoundingClientRect();
    const max = window.innerHeight - panel.offsetHeight - 12;
    setTop(Math.max(12, Math.min(r.top - 8, max)));
  }, [section]);

  return (
    <div
      ref={ref}
      className="nav-preview"
      style={{ top }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      role="group"
      aria-label={`${section.label}: what is inside`}
    >
      <p className="nav-preview-title">{section.label}</p>
      <ul>
        {section.pages.map(p => (
          <li key={p.path}>
            <Link to={p.path} className="nav-preview-item">
              <span className="nav-preview-label">{p.label}</span>
              <span className="nav-preview-about">{p.about}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Everything people create, in one place. */
function NewMenu() {
  const nav = useNavigate();
  const allowed = useCan();
  const actions = NEW_ACTIONS.filter(a => allowed(a.module));
  if (!actions.length) return null;
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button className="btn btn-primary btn-new" type="button">
          <Plus size={15} weight="bold" aria-hidden="true" />
          <span>New</span>
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="menu" align="end" sideOffset={8}>
          <Menu.Label className="menu-label">Create</Menu.Label>
          {actions.map(a => (
            <Menu.Item key={a.path} className="menu-item" onSelect={() => nav(a.path)}>
              {a.label}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** The signed-in person: appearance, help, billing, sign out. */
function AccountMenu() {
  const { theme, setTheme } = useTheme();
  const nav = useNavigate();
  const me = useMe();
  const allowed = useCan();
  const { signOut, viewAs } = useSession();
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button className="account" type="button" aria-label={`${me.name}: account and appearance`}>
          <span className="avatar" aria-hidden="true">{me.initials}</span>
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="menu menu-account" align="end" sideOffset={8}>
          <div className="menu-who">
            <strong>{me.name}</strong>
            <span>{ROLE_LABEL[me.role]} · {me.orgName}</span>
          </div>
          {viewAs && (
            <>
              <Menu.Separator className="menu-sep" />
              <Menu.Label className="menu-label">Demo: see the console as</Menu.Label>
              <Menu.RadioGroup value={me.role} onValueChange={v => { viewAs(v as Role); nav('/'); }}>
                {(Object.keys(ROLE_LABEL) as Role[]).map(r => (
                  <Menu.RadioItem key={r} value={r} className="menu-item menu-radio">
                    <span>{ROLE_LABEL[r]}</span>
                    <Menu.ItemIndicator className="menu-check"><Check size={15} weight="bold" /></Menu.ItemIndicator>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </>
          )}
          <Menu.Separator className="menu-sep" />
          <Menu.Label className="menu-label">Appearance</Menu.Label>
          <Menu.RadioGroup value={theme} onValueChange={v => setTheme(v as typeof theme)}>
            {THEMES.map(t => (
              <Menu.RadioItem key={t.id} value={t.id} className="menu-item menu-radio" onSelect={e => e.preventDefault()}>
                <span className="menu-radio-text">
                  <span>{t.label}</span>
                  <span className="menu-note">{t.note}</span>
                </span>
                <Menu.ItemIndicator className="menu-check"><Check size={15} weight="bold" /></Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
          <Menu.Separator className="menu-sep" />
          {ACCOUNT_PAGES.filter(p => allowed(p.module)).map(p => (
            <Menu.Item key={p.path} className="menu-item" onSelect={() => nav(p.path)}>{p.label}</Menu.Item>
          ))}
          <Menu.Separator className="menu-sep" />
          <Menu.Item className="menu-item" onSelect={() => void signOut()}>Sign out</Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
