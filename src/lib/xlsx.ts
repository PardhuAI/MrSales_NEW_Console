/**
 * Reading a customer's .xlsx, without a spreadsheet library.
 *
 * Excel saves .xlsx by default, so a customer's client list arrives as one
 * whatever the template says. Telling them to save as CSV first is an
 * instruction that gets skipped, and then the upload looks broken.
 *
 * The two libraries for this were both wrong here. SheetJS on npm carries a
 * high-severity advisory with no fix available — and this code parses files
 * that arrive from outside, which is precisely where that matters. ExcelJS is
 * over a megabyte to read a few hundred rows.
 *
 * So: none. An .xlsx is a zip of XML, the browser can inflate a zip entry
 * natively through `DecompressionStream`, and it can parse XML through
 * `DOMParser`. What is left is the zip's own table of contents, which is
 * about sixty lines. The app already writes the same format by hand on the
 * phone; this is the mirror of it.
 *
 * Deliberately not handled, because the sheets that come back here have no
 * such column: formulas (the cached value is read instead, which is what you
 * want anyway), and date cells, which arrive as Excel's serial numbers. If a
 * sheet ever needs a real date, convert it here rather than at the call site.
 */

/** One entry in the zip's central directory — only what is needed to inflate it. */
interface Entry { name: string; compressed: boolean; offset: number; size: number }

const td = new TextDecoder();

function readEntries(buf: Uint8Array, view: DataView): Entry[] {
  // The end-of-central-directory record is last, after a comment of unknown
  // length, so it is found by scanning backwards for its signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 65558; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('that file is not a workbook — no zip directory in it');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries: Entry[] = [];

  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    entries.push({
      name: td.decode(buf.subarray(p + 46, p + 46 + nameLen)),
      compressed: method === 8,
      offset: local,
      size,
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readFileInZip(buf: Uint8Array, view: DataView, entry: Entry): Promise<string> {
  // The local header repeats the name and extra fields, and its lengths are
  // the ones that count — the central directory's extra field is often longer.
  const nameLen = view.getUint16(entry.offset + 26, true);
  const extraLen = view.getUint16(entry.offset + 28, true);
  const start = entry.offset + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + (entry.compressed ? entry.size : entry.size));

  if (!entry.compressed) return td.decode(raw);

  const stream = new Blob([raw as unknown as BlobPart]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return td.decode(new Uint8Array(await new Response(stream).arrayBuffer()));
}

/** "BC12" → 54. Column letters are base-26 with no zero. */
function columnOf(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/**
 * The first worksheet, as rows of plain strings.
 *
 * Empty cells come back as empty strings, and every row is padded to the
 * width of the widest, so a caller can index by column without checking.
 */
export async function readXlsx(file: File): Promise<string[][]> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('this browser cannot open .xlsx files — save the sheet as CSV instead');
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(buf.buffer);
  const entries = readEntries(buf, view);
  const find = (name: string) => entries.find(e => e.name === name);

  // Which file is the first sheet: the workbook names them in order, and the
  // relationship file says which part each name points at. A workbook whose
  // first sheet is not sheet1.xml is common enough to matter — anybody who
  // has reordered tabs has one.
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const workbook = find('xl/workbook.xml');
  const rels = find('xl/_rels/workbook.xml.rels');
  if (workbook && rels) {
    const wb = new DOMParser().parseFromString(await readFileInZip(buf, view, workbook), 'application/xml');
    const id = wb.getElementsByTagName('sheet')[0]?.getAttribute('r:id');
    if (id) {
      const rl = new DOMParser().parseFromString(await readFileInZip(buf, view, rels), 'application/xml');
      for (const r of Array.from(rl.getElementsByTagName('Relationship'))) {
        if (r.getAttribute('Id') === id) {
          const target = r.getAttribute('Target') ?? '';
          sheetPath = target.startsWith('/') ? target.slice(1)
            : target.startsWith('xl/') ? target : `xl/${target}`;
        }
      }
    }
  }

  const sheet = find(sheetPath) ?? find('xl/worksheets/sheet1.xml');
  if (!sheet) throw new Error('that workbook has no sheet in it');

  // Text is pooled across the whole workbook, so a cell marked `t="s"` holds
  // an index into this rather than a word.
  let shared: string[] = [];
  const sst = find('xl/sharedStrings.xml');
  if (sst) {
    const doc = new DOMParser().parseFromString(await readFileInZip(buf, view, sst), 'application/xml');
    shared = Array.from(doc.getElementsByTagName('si')).map(si =>
      Array.from(si.getElementsByTagName('t')).map(t => t.textContent ?? '').join(''));
  }

  const doc = new DOMParser().parseFromString(await readFileInZip(buf, view, sheet), 'application/xml');
  const rows: string[][] = [];
  let width = 0;

  for (const row of Array.from(doc.getElementsByTagName('row'))) {
    const cells: string[] = [];
    for (const c of Array.from(row.getElementsByTagName('c'))) {
      const at = columnOf(c.getAttribute('r') ?? '');
      const type = c.getAttribute('t');
      let value = '';
      if (type === 's') {
        value = shared[Number(c.getElementsByTagName('v')[0]?.textContent ?? -1)] ?? '';
      } else if (type === 'inlineStr') {
        value = Array.from(c.getElementsByTagName('t')).map(t => t.textContent ?? '').join('');
      } else {
        // Numbers, booleans and formulas alike: `v` is the value, and for a
        // formula it is the answer Excel last calculated.
        value = c.getElementsByTagName('v')[0]?.textContent ?? '';
      }
      const index = at >= 0 ? at : cells.length;
      while (cells.length < index) cells.push('');
      cells[index] = value.trim();
    }
    width = Math.max(width, cells.length);
    rows.push(cells);
  }

  for (const r of rows) while (r.length < width) r.push('');
  // Excel keeps trailing empty rows a person once clicked into.
  while (rows.length && rows[rows.length - 1].every(c => c === '')) rows.pop();
  return rows;
}
