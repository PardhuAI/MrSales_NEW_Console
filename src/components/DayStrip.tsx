import { useRef, type KeyboardEvent } from 'react';
import { CalendarBlank, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { useResource } from '../data/resource';
import { loadOffDays, type OffDays } from '../live/calendar';
import { IST_TODAY, dayMonth, longDay, monthYear, shiftDay, weekdayOf } from '../lib/days';

const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * A week of days to tap, as on the phone: the chosen day, today named in
 * words, the week off and holidays in grey. The arrows move a week; any
 * other date is one tap away under "Pick a date". Future days are not
 * offered, because nothing has happened on them yet.
 */
export function DayStrip({ value, onChange, max = IST_TODAY() }: { value: string; onChange: (d: string) => void; max?: string }) {
  const off = useResource<OffDays>('calendar:off', loadOffDays, 10 * 60_000);
  const picker = useRef<HTMLInputElement>(null);
  const group = useRef<HTMLDivElement>(null);
  const today = IST_TODAY();
  // The week runs Monday to Sunday, as an Indian office calendar does.
  const monday = shiftDay(value, -((weekdayOf(value) + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
  const why = (k: string) => off.data?.holidays.get(k) ?? (off.data && weekdayOf(k) === off.data.weekOff ? 'Week off' : null);
  const go = (k: string) => { if (k <= max) onChange(k); };
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'Home' ? -((weekdayOf(value) + 6) % 7) : e.key === 'End' ? 6 - ((weekdayOf(value) + 6) % 7) : 0;
    if (!step) return;
    e.preventDefault();
    const next = shiftDay(value, step);
    if (next > max) return;
    onChange(next);
    requestAnimationFrame(() => group.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus());
  };
  const openPicker = () => {
    const el = picker.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }
  };
  const lastWeek = shiftDay(monday, -7);
  const nextWeek = shiftDay(monday, 7);
  return (
    <div className="daystrip">
      <div className="daystrip-head">
        <span className="daystrip-month" aria-live="polite">{monthYear(days[3])}</span>
        <span className="daystrip-moves">
          <button type="button" className="icon-btn" aria-label={`The week of ${dayMonth(lastWeek)}`} onClick={() => go(shiftDay(value, -7))}><CaretLeft size={16} /></button>
          <button type="button" className="icon-btn" aria-label={`The week of ${dayMonth(nextWeek)}`} disabled={nextWeek > max} onClick={() => go(shiftDay(value, 7) > max ? max : shiftDay(value, 7))}><CaretRight size={16} /></button>
          <span className="daystrip-pick">
            <button type="button" className="link" onClick={openPicker}><CalendarBlank size={14} aria-hidden="true" /> Pick a date</button>
            <input ref={picker} type="date" className="daystrip-input" tabIndex={-1} aria-hidden="true" max={max} value={value} onChange={e => e.target.value && go(e.target.value)} />
          </span>
          {value !== today && <button type="button" className="link" onClick={() => onChange(today)}>Today</button>}
        </span>
      </div>
      <div className="daystrip-days" role="radiogroup" aria-label="Day" ref={group} onKeyDown={onKey}>
        {days.map(k => {
          const on = k === value;
          const future = k > max;
          const reason = why(k);
          return (
            <button key={k} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} disabled={future}
              aria-label={`${longDay(k)}${k === today ? ', today' : ''}${reason ? `, ${reason}` : ''}`}
              title={reason ?? undefined}
              className={`daystrip-day${on ? ' on' : ''}${reason ? ' off' : ''}${k === today ? ' today' : ''}`}
              onClick={() => onChange(k)}>
              <span className="daystrip-wd" aria-hidden="true">{k === today ? 'Today' : SHORT[weekdayOf(k)]}</span>
              <span className="daystrip-n" aria-hidden="true">{Number(k.slice(8))}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
