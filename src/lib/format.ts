/** Every figure on screen goes through these. Never format inline. */

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** ₹1,84,600 */
export const rupees = (n: number) => `₹${inr.format(Math.round(n))}`;

/** ₹18.4 L, ₹1.2 Cr, ₹14,250: short form for large amounts. */
export const rupeesShort = (n: number) => {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(n >= 1e8 ? 0 : 1)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(n >= 1e6 ? 1 : 2).replace(/\.?0+$/, '')} L`;
  return rupees(n);
};

/** "67%". Something above nothing never reads as 0%: it says "under 1%". */
export const percent = (part: number, whole: number) => {
  if (!whole) return '0%';
  const p = (part / whole) * 100;
  return part > 0 && p < 1 ? 'under 1%' : `${Math.round(p)}%`;
};

/** "1 call", "2 calls". */
export const count = (n: number, noun: string, plural = `${noun}s`) =>
  `${inr.format(n)} ${n === 1 ? noun : plural}`;

/** 13.67 → "1:40 pm" */
export const clock = (hours: number) => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

export const longDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

export const days = (n: number) => count(n, 'day');
