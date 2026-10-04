/**
 * The sheet that goes out full and comes back edited.
 *
 * Out as CSV, back as either. The Export Centre already writes CSV and every
 * spreadsheet opens it; but Excel *saves* .xlsx by default, so that is what
 * comes back, and `lib/xlsx.ts` reads one without a library. Both arrive at
 * `readGrid` below, so the two file types cannot drift into two sets of rules.
 *
 * A round trip is a *data* file — one row per record, no derived columns —
 * which is a different thing from the report exports beside it, and the only
 * kind you can safely read back in.
 *
 * The parser is small but it is not naive: a client called `Sharma, Dr R.` and
 * an address with a line break in it are both ordinary, and a split on commas
 * would quietly shear the row and import rubbish.
 */

export interface Column {
  /** What the import function expects to be called. */
  key: string;
  /** What the person reading the sheet sees. */
  header: string;
  /** Read it off a record for export. */
  get: (row: Record<string, unknown>) => string;
}

const quote = (v: string) =>
  /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

export function toCsv(columns: Column[], rows: Record<string, unknown>[]): string {
  const head = columns.map(c => quote(c.header)).join(',');
  const body = rows.map(r => columns.map(c => quote(c.get(r) ?? '')).join(','));
  return [head, ...body].join('\r\n') + '\r\n';
}

export function download(filename: string, text: string) {
  // A BOM, so Excel on Windows reads it as UTF-8 rather than mangling every
  // name with an accent in it.
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Rows of raw cells, the first being the header. Quotes and newlines survive. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; }
      } else cell += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(cell); cell = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(cell); out.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  // Excel leaves a trailing blank line, and a sheet's last row is often empty
  // because somebody pressed Enter. Neither is a record.
  return out.filter(r => r.some(c => c.trim() !== ''));
}

const normalise = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface Parsed {
  /** One object per row, keyed the way the import function expects. */
  rows: Record<string, string>[];
  /** Headers in the file that mean nothing to us, named so nobody wonders. */
  ignored: string[];
  /** Columns we know about that the file did not carry. */
  absent: string[];
}

/**
 * Match the file's headers to ours by name, ignoring case, spaces and
 * punctuation — so "GST %", "gst_percent" and "Gst" are the same column.
 *
 * A header we do not recognise is **reported, never guessed at**. People send
 * back their own workbook with six extra columns in it, and a column quietly
 * mapped to the wrong field is the one mistake this whole screen exists to
 * prevent.
 */
export function readSheet(columns: Column[], text: string): Parsed {
  return readGrid(columns, parseCsv(text));
}

/**
 * The same mapping, from a grid however it was obtained — a CSV parsed here,
 * or a worksheet read out of an .xlsx. Splitting this out is what lets both
 * file types arrive at exactly the same rows, rather than two paths that
 * agree until one of them doesn't.
 */
export function readGrid(columns: Column[], grid: string[][]): Parsed {
  if (grid.length === 0) return { rows: [], ignored: [], absent: columns.map(c => c.header) };

  const header = grid[0];
  const byNorm = new Map(columns.map(c => [normalise(c.header), c]));
  const mapped = header.map(h => byNorm.get(normalise(h)) ?? null);

  const ignored = header.filter((h, i) => mapped[i] === null && h.trim() !== '');
  const found = new Set(mapped.filter(Boolean).map(c => (c as Column).header));
  const absent = columns.map(c => c.header).filter(h => !found.has(h));

  const rows = grid.slice(1).map((cells, i) => {
    const row: Record<string, string> = { row: String(i + 2) }; // the line in the file
    mapped.forEach((col, c) => { if (col) row[col.key] = (cells[c] ?? '').trim(); });
    return row;
  });

  return { rows, ignored, absent };
}

/** What the import functions answer with. */
export interface ImportReport {
  sheet: string;
  total: number;
  create: number;
  update: number;
  rejected: number;
  committed: boolean;
  errors: { row: number; field: string; message: string }[];
}
