import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, useLayoutEffect } from 'react';
import { CalendarBlank, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { useResource } from '../data/resource';
import { loadOffDays, type OffDays } from '../live/calendar';
import { IST_TODAY, dayMonth, longDay, monthYear, shiftDay, weekdayOf } from '../lib/days';

const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONDAY_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Days since the Monday of a day's week. */
const sinceMonday = (k: string) => (weekdayOf(k) + 6) % 7;

/** The company's week off and holidays, and why a day is off. */
function useOff() {
  const off = useResource<OffDays>('calendar:off', loadOffDays, 10 * 60_000);
  return (k: string) => off.data?.holidays.get(k) ?? (off.data && weekdayOf(k) === off.data.weekOff ? 'Week off' : null);
}

type Props = {
  value: string;
  onChange: (d: string) => void;
  /** The last day offered; today by default, because nothing has happened after it. */
  max?: string | null;
  min?: string;
  /** A word or two under a day, such as "3 away". */
  note?: (k: string) => string | null;
  label?: string;
};

/**
 * A week of days to tap, as on the phone: the chosen day in the accent, today
 * named in words, the week off and holidays in grey with their names. The
 * arrows move a week; "Pick a date" opens the month, drawn the same way.
 */
export function DayStrip({ value, onChange, max = IST_TODAY(), min, note, label = 'Day' }: Props) {
  const why = useOff();
  const group = useRef<HTMLDivElement>(null);
  const today = IST_TODAY();
  const allowed = (k: string) => (!max || k <= max) && (!min || k >= min);
  const monday = shiftDay(value, -sinceMonday(value));
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
  const clamp = (k: string) => (max && k > max ? max : min && k < min ? min : k);
  const onKey = (e: KeyboardEvent) => {
    // From the day that has focus, the one the person is on, not from `value`:
    // a navigation updates the address before the strip redraws, and a key
    // pressed in between moved two days from a value that was already old.
    const from = (e.target as HTMLElement).closest<HTMLElement>('[data-day]')?.dataset.day ?? value;
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'Home' ? -sinceMonday(from) : e.key === 'End' ? 6 - sinceMonday(from) : 0;
    if (!step) return;
    e.preventDefault();
    const next = shiftDay(from, step);
    if (!allowed(next)) return;
    onChange(next);
    requestAnimationFrame(() => group.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus());
  };
  const prevWeek = shiftDay(value, -7);
  const nextWeek = shiftDay(value, 7);
  return (
    <div className="daystrip">
      <div className="daystrip-head">
        <span className="daystrip-month" aria-live="polite">{monthYear(days[3])}</span>
        <span className="daystrip-moves">
          <button type="button" className="icon-btn" aria-label={`The week of ${dayMonth(shiftDay(monday, -7))}`} disabled={!!min && shiftDay(monday, -1) < min} onClick={() => onChange(clamp(prevWeek))}><CaretLeft size={16} /></button>
          <button type="button" className="icon-btn" aria-label={`The week of ${dayMonth(shiftDay(monday, 7))}`} disabled={!!max && shiftDay(monday, 7) > max} onClick={() => onChange(clamp(nextWeek))}><CaretRight size={16} /></button>
          <MonthPicker value={value} onChange={onChange} allowed={allowed} why={why} note={note} />
          {value !== today && allowed(today) && <button type="button" className="link" onClick={() => onChange(today)}>Today</button>}
        </span>
      </div>
      <div className="daystrip-days" role="radiogroup" aria-label={label} ref={group} onKeyDown={onKey}>
        {days.map(k => {
          const on = k === value;
          const reason = why(k);
          const n = note?.(k);
          return (
            <button key={k} type="button" role="radio" data-day={k} aria-checked={on} tabIndex={on ? 0 : -1} disabled={!allowed(k)}
              aria-label={`${longDay(k)}${k === today ? ', today' : ''}${reason ? `, ${reason}` : ''}${n ? `, ${n}` : ''}`}
              title={reason ?? undefined}
              className={`daystrip-day${on ? ' on' : ''}${reason ? ' off' : ''}${k === today ? ' today' : ''}`}
              onClick={() => onChange(k)}>
              <span className="daystrip-wd" aria-hidden="true">{k === today ? 'Today' : SHORT[weekdayOf(k)]}</span>
              <span className="daystrip-n" aria-hidden="true">{Number(k.slice(8))}</span>
              {note && <span className="daystrip-note" aria-hidden="true">{n ?? ''}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The month, drawn like the strip, in a small panel under "Pick a date". Our
 * own rather than the browser's, so it opens everywhere (an embedded page may
 * not open the browser's calendar) and every calendar in the console reads
 * the same. Arrow keys move a day or a week, Page Up and Down a month,
 * Escape closes it and returns to the button.
 */
function MonthPicker({ value, onChange, allowed, why, note }: {
  value: string; onChange: (d: string) => void; allowed: (k: string) => boolean;
  why: (k: string) => string | null; note?: (k: string) => string | null;
}) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(value);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const today = IST_TODAY();
  useEffect(() => { if (open) setFocus(value); }, [open, value]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  // In the same commit as the panel, not a frame later: a key pressed straight
  // after opening must reach the panel, not the button behind it.
  useLayoutEffect(() => {
    if (open) panel.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
  }, [open, focus]);
  const close = () => { setOpen(false); requestAnimationFrame(() => button.current?.focus()); };
  const pick = (k: string) => { if (!allowed(k)) return; onChange(k); close(); };

  const first = `${focus.slice(0, 7)}-01`;
  const start = shiftDay(first, -sinceMonday(first));
  const cells = Array.from({ length: 42 }, (_, i) => shiftDay(start, i));
  const weeks = cells[35].slice(0, 7) === focus.slice(0, 7) ? 6 : 5;
  const shiftMonth = (n: number) => {
    const [y, m, d] = focus.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1 + n, 1));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
  };
  const onKey = (e: KeyboardEvent) => {
    const moves: Record<string, () => string> = {
      ArrowRight: () => shiftDay(focus, 1), ArrowLeft: () => shiftDay(focus, -1), ArrowDown: () => shiftDay(focus, 7), ArrowUp: () => shiftDay(focus, -7),
      PageDown: () => shiftMonth(1), PageUp: () => shiftMonth(-1), Home: () => shiftDay(focus, -sinceMonday(focus)), End: () => shiftDay(focus, 6 - sinceMonday(focus)),
    };
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') { setOpen(false); return; }
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    setFocus(move());
  };

  return (
    <span className="daystrip-pick">
      <button ref={button} type="button" className="link" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <CalendarBlank size={14} aria-hidden="true" /> Pick a date
      </button>
      {open && (
        <div ref={panel} className="monthpick" role="dialog" aria-label={`Pick a date, ${monthYear(focus)}`} onKeyDown={onKey}>
          <div className="monthpick-head">
            <button type="button" className="icon-btn" aria-label={`Back to ${monthYear(shiftMonth(-1))}`} onClick={() => setFocus(shiftMonth(-1))}><CaretLeft size={16} /></button>
            <span className="daystrip-month" aria-live="polite">{monthYear(focus)}</span>
            <button type="button" className="icon-btn" aria-label={`On to ${monthYear(shiftMonth(1))}`} onClick={() => setFocus(shiftMonth(1))}><CaretRight size={16} /></button>
          </div>
          <div className="monthpick-grid" role="grid" aria-label={monthYear(focus)}>
            <div role="row" className="monthpick-row">
              {MONDAY_FIRST.map(d => <span key={d} role="columnheader" className="monthpick-wd" aria-label={d}>{d.slice(0, 2)}</span>)}
            </div>
            {Array.from({ length: weeks }, (_, w) => (
              <div key={w} role="row" className="monthpick-row">
                {cells.slice(w * 7, w * 7 + 7).map(k => {
                  const inMonth = k.slice(0, 7) === focus.slice(0, 7);
                  const reason = why(k);
                  const n = note?.(k);
                  return (
                    <span key={k} role="gridcell" aria-selected={k === value}>
                      <button type="button" data-day={k} tabIndex={k === focus ? 0 : -1} disabled={!allowed(k)}
                        aria-label={`${longDay(k)}${k === today ? ', today' : ''}${reason ? `, ${reason}` : ''}${n ? `, ${n}` : ''}`}
                        title={reason ?? undefined}
                        className={`monthpick-day${k === value ? ' on' : ''}${reason ? ' off' : ''}${k === today ? ' today' : ''}${inMonth ? '' : ' outside'}${n ? ' noted' : ''}`}
                        onClick={() => pick(k)}>
                        {Number(k.slice(8))}
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="monthpick-foot">
            {allowed(today) && <button type="button" className="link" onClick={() => pick(today)}>Today, {dayMonth(today)}</button>}
          </p>
        </div>
      )}
    </span>
  );
}

/** A labelled block holding a strip, for pages where the strip is part of the content rather than the toolbar. */
export function StripBlock({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="block stripblock">
      <div className="block-head"><h2 className="section-title">{title}</h2>{meta && <span className="block-meta">{meta}</span>}</div>
      {children}
    </section>
  );
}
