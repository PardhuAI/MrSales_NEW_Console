import { useRef, useState } from 'react';
import { DownloadSimple, UploadSimple } from '@phosphor-icons/react';
import { Drawer } from './kit';
import { download, readGrid, readSheet, toCsv, type Column } from '../lib/sheet';
import { readXlsx } from '../lib/xlsx';
import type { SheetReport } from '../lib/sheetReport';
import { count } from '../lib/format';

/**
 * Export and import as one pair, on the page that owns the records (the old
 * console's DataSheet). The sheet you download is the sheet you send back:
 * a row with an Id changes that record, a row without one adds a record, and
 * nothing in a sheet ever deletes. Nothing is written until the database's dry
 * run has been read, and then only if every row passes.
 */
export function SheetImport({ name, columns, load, run, onDone }: {
  name: string;
  columns: Column[];
  load: () => Promise<Record<string, unknown>[]>;
  run: (rows: Record<string, string>[], commit: boolean) => Promise<SheetReport>;
  onDone: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [report, setReport] = useState<SheetReport | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const sentence = (e: unknown) => {
    const m = e instanceof Error ? e.message : String(e);
    return m.charAt(0).toUpperCase() + m.slice(1);
  };

  const exportSheet = async () => {
    setBusy('export');
    setProblem('');
    try {
      download(`${name}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(columns, await load()));
    } catch (e) {
      setProblem(sentence(e));
    } finally {
      setBusy('');
    }
  };

  const reset = () => {
    setRows(null);
    setReport(null);
    setIgnored([]);
    setProblem('');
    setFileName('');
    if (file.current) file.current.value = '';
  };

  const chosen = async (f: File) => {
    reset();
    setFileName(f.name);
    setBusy('reading');
    try {
      const parsed = /\.xlsx$/i.test(f.name) ? readGrid(columns, await readXlsx(f)) : readSheet(columns, await f.text());
      setIgnored(parsed.ignored);
      setRows(parsed.rows);
      if (!parsed.rows.length) {
        setProblem('That file has a header row and nothing under it.');
        return;
      }
      setBusy('checking');
      setReport(await run(parsed.rows, false));
    } catch (e) {
      setProblem(sentence(e));
    } finally {
      setBusy('');
    }
  };

  const commit = async () => {
    if (!rows) return;
    setBusy('importing');
    setProblem('');
    try {
      const r = await run(rows, true);
      setReport(r);
      if (r.committed) {
        reset();
        setOpen(false);
        onDone(`${count(r.create, 'row')} added and ${r.update} changed.`);
      }
    } catch (e) {
      setProblem(sentence(e));
    } finally {
      setBusy('');
    }
  };

  const clean = report && report.rejected === 0;

  return (
    <>
      <button type="button" className="btn btn-secondary btn-small" disabled={busy === 'export'} onClick={() => void exportSheet()}>
        <DownloadSimple size={14} aria-hidden="true" /> {busy === 'export' ? 'Preparing…' : 'Download the sheet'}
      </button>
      <button type="button" className="btn btn-secondary btn-small" onClick={() => { reset(); setOpen(true); }}>
        <UploadSimple size={14} aria-hidden="true" /> Import a sheet
      </button>
      {problem && !open && <span className="form-error" role="alert">{problem}</span>}

      <Drawer
        open={open}
        onClose={() => { reset(); setOpen(false); }}
        title={`Import ${name}`}
        sub="The sheet you downloaded, edited and sent back. Nothing is written until you have read what it would do."
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => { reset(); setOpen(false); }}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={!clean || busy !== ''} onClick={() => void commit()}>
              {busy === 'importing' ? 'Importing…' : clean ? `Import ${count(report!.create + report!.update, 'row')}` : 'Import'}
            </button>
          </>
        )}
      >
        <div className="form">
          <div className="form-field">
            <label htmlFor="sheet-file" className="form-label">The file, as CSV or Excel</label>
            <input id="sheet-file" ref={file} type="file" className="input file-input"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={e => { const f = e.target.files?.[0]; if (f) void chosen(f); }} />
            <p className="form-help">Download the sheet first if you have not: its Id column tells an edit from an addition. A row with an Id changes that record; a row without one adds a new one. Nothing in a sheet deletes anything.</p>
          </div>
          {busy === 'reading' && <p className="form-help" role="status">Reading {fileName}…</p>}
          {busy === 'checking' && <p className="form-help" role="status">Checking {count(rows?.length ?? 0, 'row')}…</p>}
          {problem && <p className="form-error" role="alert">That did not work. {problem}</p>}
          {ignored.length > 0 && <p className="form-help">Columns not recognised, and left alone: {ignored.join(', ')}.</p>}
          {report && (
            <div className={`sheet-verdict${clean ? '' : ' bad'}`} role="status">
              <p><strong>{count(report.total, 'row')}: {report.create} new, {report.update} to change{report.rejected ? `, ${report.rejected} rejected` : ''}.</strong></p>
              <p>{clean ? 'Nothing has been written yet.' : 'Nothing will be written until every row is fixed, not even the rows that passed.'}</p>
            </div>
          )}
          {report && report.errors.length > 0 && (
            <ul className="sheet-errors">
              {report.errors.slice(0, 40).map((e, i) => <li key={i}><strong>Row {e.row}</strong>, {e.field}: {e.message}</li>)}
              {report.errors.length > 40 && <li>And {report.errors.length - 40} more.</li>}
            </ul>
          )}
        </div>
      </Drawer>
    </>
  );
}
