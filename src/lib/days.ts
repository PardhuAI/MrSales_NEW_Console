/**
 * Days as the field lives them: India days (Asia/Kolkata), whatever the
 * browser's clock says. A day is a YYYY-MM-DD key; every screen uses these.
 */

const IST = 'Asia/Kolkata';
const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: false });

/** YYYY-MM-DD in India for an instant. */
export const dayOf = (d: Date | string) => keyFmt.format(typeof d === 'string' ? new Date(d) : d);
export const IST_TODAY = () => dayOf(new Date());

const parts = (k: string) => k.split('-').map(Number) as [number, number, number];

export const shiftDay = (k: string, n: number) => {
  const [y, m, d] = parts(k);
  return keyFmt.format(new Date(Date.UTC(y, m - 1, d + n, 6)));
};

/** 0 is Sunday. */
export const weekdayOf = (k: string) => {
  const [y, m, d] = parts(k);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/** Hours since midnight in India; 13.5 is 1:30 pm. */
export const hoursOf = (d: Date | string) => {
  const [h, m] = timeFmt.format(typeof d === 'string' ? new Date(d) : d).split(':').map(Number);
  return (h % 24) + m / 60;
};

/** Midnight of an India day as an instant, for querying timestamps. */
export const startOfDay = (k: string) => `${k}T00:00:00+05:30`;

/** A local Date at midnight of an India day, for formatting only. */
export const dateOfDay = (k: string) => {
  const [y, m, d] = parts(k);
  return new Date(y, m - 1, d);
};

export const daysBetween = (a: string, b: string) =>
  Math.round((Date.UTC(...(parts(b).map((x, i) => (i === 1 ? x - 1 : x)) as [number, number, number])) - Date.UTC(...(parts(a).map((x, i) => (i === 1 ? x - 1 : x)) as [number, number, number]))) / 86_400_000);

export const monthKeyOf = (k: string) => k.slice(0, 7);

/** "Saturday, 3 October" */
export const longDay = (k: string) => {
  const d = dateOfDay(k);
  return `${d.toLocaleDateString('en-IN', { weekday: 'long' })}, ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}`;
};
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Sep": current browsers write September as "Sept" in en-IN and every other month in three letters. */
export const monShort = (d: Date) => MON[d.getMonth()];
/** "3 Oct" */
export const shortDay = (k: string) => { const d = dateOfDay(k); return `${d.getDate()} ${monShort(d)}`; };
/** "3 October" */
export const dayMonth = (k: string) => dateOfDay(k).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
/** "October 2026" */
/** A run of days in words: "4 September", "28 to 30 September", "30 September to 2 October". */
export const dayRange = (a: string, b: string) =>
  a === b ? dayMonth(a) : a.slice(0, 7) === b.slice(0, 7) ? `${Number(a.slice(8))} to ${dayMonth(b)}` : `${dayMonth(a)} to ${dayMonth(b)}`;

export const monthYear = (k: string) => dateOfDay(`${k.slice(0, 7)}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

/** "today", "yesterday", "3 days ago", "2 hours ago" for an instant. */
export function ago(iso: string | Date | null, now = new Date()): string {
  if (!iso) return 'never';
  const t = typeof iso === 'string' ? new Date(iso) : iso;
  const mins = Math.round((now.getTime() - t.getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
  const h = Math.round(mins / 60);
  if (h < 24 && dayOf(t) === dayOf(now)) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  const d = daysBetween(dayOf(t), dayOf(now));
  if (d <= 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  return dayMonth(dayOf(t));
}

/** "9:40 am" for an instant, in India. */
export const timeOf = (d: Date | string) => {
  const h = hoursOf(d);
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`;
};
