import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CalendarBlank, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { IST_TODAY } from '../lib/days';

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** A month key ("2026-10") moved by n months. */
export const shiftMonth = (k: string, n: number) => {
  const [y, m] = k.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
const nameOf = (k: string) => `${LONG[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`;

type Props = {
  value: string;
  onChange: (m: string) => void;
  /** The last month offered; this month by default. */
  max?: string;
  /** A word or two under a month, such as "4 waiting". */
  note?: (k: string) => string | null;
  label?: string;
};

/**
 * Six months to tap, the month-sized sibling of the day strip: the chosen
 * month in the accent, this month named in words, no month offered that has
 * not begun. The arrows move six months; "Pick a month" opens any year.
 */
export function MonthStrip({ value, onChange, max = IST_TODAY().slice(0, 7), note, label = 'Month' }: Props) {
  const group = useRef<HTMLDivElement>(null);
  const now = IST_TODAY().slice(0, 7);
  // The six months end at the later of the chosen month and its window, so the chosen one is always in view.
  const [end, setEnd] = useState(() => (shiftMonth(value, 2) > max ? max : shiftMonth(value, 2)));
  useEffect(() => { if (value > end || value <= shiftMonth(end, -6)) setEnd(shiftMonth(value, 2) > max ? max : shiftMonth(value, 2)); }, [value, end, max]);
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(end, i - 5));
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = shiftMonth(value, step);
    if (next > max) return;
    onChange(next);
    requestAnimationFrame(() => group.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus());
  };
  const later = shiftMonth(end, 6) > max ? max : shiftMonth(end, 6);
  return (
    <div className="daystrip monthstrip">
      <div className="daystrip-head">
        <span className="daystrip-month" aria-live="polite">{months[0].slice(0, 4) === months[5].slice(0, 4) ? months[0].slice(0, 4) : `${months[0].slice(0, 4)} and ${months[5].slice(0, 4)}`}</span>
        <span className="daystrip-moves">
          <button type="button" className="icon-btn" aria-label={`The six months to ${nameOf(shiftMonth(end, -6))}`} onClick={() => setEnd(shiftMonth(end, -6))}><CaretLeft size={16} /></button>
          <button type="button" className="icon-btn" aria-label={`The six months to ${nameOf(later)}`} disabled={end >= max} onClick={() => setEnd(later)}><CaretRight size={16} /></button>
          <YearPicker value={value} max={max} onChange={onChange} />
          {value !== now && now <= max && <button type="button" className="link" onClick={() => onChange(now)}>This month</button>}
        </span>
      </div>
      <div className="daystrip-days" role="radiogroup" aria-label={label} ref={group} onKeyDown={onKey}>
        {months.map(k => {
          const on = k === value;
          const n = note?.(k);
          return (
            <button key={k} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} disabled={k > max}
              aria-label={`${nameOf(k)}${k === now ? ', this month' : ''}${n ? `, ${n}` : ''}`}
              className={`daystrip-day${on ? ' on' : ''}${k === now ? ' today' : ''}`} onClick={() => onChange(k)}>
              {/* The year only where it changes; the heading carries it otherwise. */}
              <span className="daystrip-wd" aria-hidden="true">{k === now ? 'Now' : k.endsWith('-01') ? k.slice(0, 4) : '\u00a0'}</span>
              <span className="daystrip-n" aria-hidden="true">{SHORT[Number(k.slice(5)) - 1]}</span>
              {note && <span className="daystrip-note" aria-hidden="true">{n ?? ''}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Any month of any year, in the same panel as the day calendar. Arrows move a month, Page Up and Down a year, Escape closes. */
function YearPicker({ value, max, onChange }: { value: string; max: string; onChange: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(value);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const now = IST_TODAY().slice(0, 7);
  useEffect(() => { if (open) setFocus(value); }, [open, value]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  useEffect(() => { if (open) requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>(`[data-month="${focus}"]`)?.focus()); }, [open, focus]);
  const close = () => { setOpen(false); requestAnimationFrame(() => button.current?.focus()); };
  const year = focus.slice(0, 4);
  const onKey = (e: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3, PageDown: 12, PageUp: -12 };
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') { setOpen(false); return; }
    if (!(e.key in moves)) return;
    e.preventDefault();
    setFocus(shiftMonth(focus, moves[e.key]));
  };
  return (
    <span className="daystrip-pick">
      <button ref={button} type="button" className="link" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <CalendarBlank size={14} aria-hidden="true" /> Pick a month
      </button>
      {open && (
        <div ref={panel} className="monthpick" role="dialog" aria-label={`Pick a month, ${year}`} onKeyDown={onKey}>
          <div className="monthpick-head">
            <button type="button" className="icon-btn" aria-label={`Back to ${Number(year) - 1}`} onClick={() => setFocus(shiftMonth(focus, -12))}><CaretLeft size={16} /></button>
            <span className="daystrip-month" aria-live="polite">{year}</span>
            <button type="button" className="icon-btn" aria-label={`On to ${Number(year) + 1}`} onClick={() => setFocus(shiftMonth(focus, 12))}><CaretRight size={16} /></button>
          </div>
          <div className="yearpick-grid">
            {SHORT.map((s, i) => {
              const k = `${year}-${String(i + 1).padStart(2, '0')}`;
              return (
                <button key={k} type="button" data-month={k} tabIndex={k === focus ? 0 : -1} disabled={k > max}
                  aria-label={`${nameOf(k)}${k === now ? ', this month' : ''}`} aria-pressed={k === value}
                  className={`monthpick-day${k === value ? ' on' : ''}${k === now ? ' today' : ''}`}
                  onClick={() => { onChange(k); close(); }}>{s}</button>
              );
            })}
          </div>
          <p className="monthpick-foot">{now <= max && <button type="button" className="link" onClick={() => { onChange(now); close(); }}>This month, {nameOf(now)}</button>}</p>
        </div>
      )}
    </span>
  );
}
