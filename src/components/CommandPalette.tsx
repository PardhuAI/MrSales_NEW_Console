import { useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router-dom';
import { ArrowElbowDownLeft, MagnifyingGlass, Plus, Receipt, User, FileText, Stethoscope } from '@phosphor-icons/react';
import { NEW_ACTIONS, SECTIONS, ACCOUNT_PAGES } from '../app/nav';
import { useCan } from '../app/access';
import { useResource } from '../data/resource';
import { loadSearchIndex } from '../live/search';

/**
 * One box that finds anything: a page, an action, a person or a client, in the
 * words people actually use ("DA", "fake GPS", "reset password"). It is the
 * answer to officials hunting through menus for an option.
 */

type Hit = {
  id: string;
  group: 'Pages' | 'Create' | 'People' | 'Clients' | 'Orders';
  label: string;
  sub?: string;
  to: string;
  score: number;
};

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Higher is better; 0 is no match. Every word typed must appear somewhere. */
function score(q: string, label: string, extra: string[] = []): number {
  const l = norm(label);
  const words = q.split(' ');
  const hay = norm([label, ...extra].join(' '));
  if (!words.every(w => hay.includes(w))) return 0;
  if (l === q) return 100;
  if (l.startsWith(q)) return 80;
  if (l.split(' ').some(w => w.startsWith(q))) return 60;
  if (l.includes(q)) return 50;
  if (extra.some(k => norm(k) === q)) return 45;
  if (extra.some(k => norm(k).startsWith(q))) return 35;
  return 20;
}

const SUGGESTED = ['/approvals', '/field', '/team', '/reports/downloads', '/settings/rules'];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const nav = useNavigate();
  const allowed = useCan();
  const list = useRef<HTMLDivElement>(null);
  // People, clients and orders are read the first time search opens, then kept.
  const index = useResource(open ? 'search:index' : null, loadSearchIndex, 5 * 60_000);

  // Every search starts empty, however the last one was closed.
  const change = (o: boolean) => {
    setQ('');
    setActive(0);
    onOpenChange(o);
  };

  const pages = useMemo(
    () => [
      ...SECTIONS.flatMap(s => s.pages.map(p => ({ ...p, section: s.label }))),
      ...ACCOUNT_PAGES.map(p => ({ ...p, section: 'Account' })),
    ].filter(p => allowed(p.module)),
    [],
  );

  const hits = useMemo<Hit[]>(() => {
    const query = norm(q);
    if (!query) {
      const suggested: Hit[] = SUGGESTED.map(path => pages.find(p => p.path === path))
        .filter(p => p !== undefined)
        .map(p => ({ id: p.path, group: 'Pages', label: p.label, sub: `${p.section} · ${p.about}`, to: p.path, score: 1 }));
      const create: Hit[] = NEW_ACTIONS.filter(a => allowed(a.module)).slice(0, 3)
        .map(a => ({ id: a.path, group: 'Create', label: a.label, to: a.path, score: 1 }));
      return [...suggested, ...create];
    }
    const out: Hit[] = [];
    for (const p of pages) {
      const s = score(query, p.label, [p.section, ...(p.keywords ?? []), p.about]);
      if (s) out.push({ id: p.path, group: 'Pages', label: p.label, sub: `${p.section} · ${p.about}`, to: p.path, score: s });
    }
    for (const a of NEW_ACTIONS.filter(x => allowed(x.module))) {
      const s = score(query, a.label, a.keywords);
      if (s) out.push({ id: a.path, group: 'Create', label: a.label, to: a.path, score: s });
    }
    const ix = index.data;
    if (ix && allowed('people')) {
      for (const p of ix.people) {
        const s = score(query, p.name, [p.code, p.hq]);
        if (s) out.push({ id: p.id, group: 'People', label: p.name, sub: [p.code, p.hq, p.active ? '' : 'has left'].filter(Boolean).join(' · '), to: `/team/${p.id}`, score: s });
      }
    }
    if (ix && allowed('clients')) {
      for (const c of ix.clients) {
        const s = score(query, c.name, [c.city]);
        if (s) out.push({ id: c.id, group: 'Clients', label: c.name, sub: [c.type[0]?.toUpperCase() + c.type.slice(1), c.city].filter(Boolean).join(' · '), to: `/clients/${c.id}`, score: s });
      }
    }
    if (ix && allowed('orders')) {
      for (const o of ix.orders) {
        const s = score(query, `Order ${o.number}`, [o.number, o.client]);
        if (s && (query.length >= 3)) out.push({ id: o.id, group: 'Orders', label: `Order ${o.number}`, sub: o.client, to: `/sales/orders?open=${o.id}`, score: s - 10 });
      }
    }
    const order = { Pages: 0, Create: 1, People: 2, Clients: 3, Orders: 4 };
    return out
      .sort((a, b) => b.score - a.score || order[a.group] - order[b.group])
      .slice(0, 12)
      .sort((a, b) => order[a.group] - order[b.group] || b.score - a.score);
  }, [q, pages, index.data]);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (h: Hit | undefined) => {
    if (!h) return;
    change(false);
    nav(h.to);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => Math.min(a + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(hits[active]);
    }
  };

  const icon = (g: Hit['group']) =>
    g === 'Create' ? <Plus size={16} /> : g === 'People' ? <User size={16} /> : g === 'Clients' ? <Stethoscope size={16} /> : g === 'Orders' ? <Receipt size={16} /> : <FileText size={16} />;

  let lastGroup = '';

  return (
    <Dialog.Root open={open} onOpenChange={change}>
      <Dialog.Portal>
        <Dialog.Overlay className="palette-scrim" />
        <Dialog.Content className="palette" aria-describedby={undefined} onKeyDown={onKey}>
          <Dialog.Title className="visually-hidden">Search the console</Dialog.Title>
          <div className="palette-input">
            <MagnifyingGlass size={18} aria-hidden="true" />
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search pages, actions, people, clients…"
              aria-label="Search pages, actions, people and clients"
              aria-controls="palette-results"
              aria-activedescendant={hits[active] ? `hit-${active}` : undefined}
              role="combobox"
              aria-expanded="true"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <div className="palette-results" id="palette-results" role="listbox" ref={list}>
            {!q && <p className="palette-hint">Try “DA”, “fake GPS”, “reset password” or a person’s name.</p>}
            {q && index.status === 'loading' && <p className="palette-hint">Still reading people, clients and orders…</p>}
            {q && index.status === 'error' && <p className="palette-hint">People and clients could not be read just now; pages and actions still work.</p>}
            {q && hits.length === 0 && index.status !== 'loading' && (
              <p className="palette-empty">Nothing matches “{q}”. Try another word, such as “claims” or “visits”.</p>
            )}
            {hits.map((h, i) => {
              const header = h.group !== lastGroup ? (lastGroup = h.group) : null;
              return (
                <div key={`${h.group}-${h.id}`}>
                  {header && <p className="palette-group">{!q && header === 'Pages' ? 'Often used' : header}</p>}
                  <button
                    type="button"
                    id={`hit-${i}`}
                    role="option"
                    aria-selected={i === active}
                    data-active={i === active}
                    className="palette-hit"
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(h)}
                  >
                    <span className="palette-icon" aria-hidden="true">{icon(h.group)}</span>
                    <span className="palette-text">
                      <span className="palette-label">{h.label}</span>
                      {h.sub && <span className="palette-sub">{h.sub}</span>}
                    </span>
                    {i === active && <ArrowElbowDownLeft className="palette-enter" size={14} aria-hidden="true" />}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="palette-foot" aria-hidden="true">
            <span><kbd>↑</kbd><kbd>↓</kbd> to move</span>
            <span><kbd>↵</kbd> to open</span>
            <span><kbd>esc</kbd> to close</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
