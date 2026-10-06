import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DownloadSimple } from '@phosphor-icons/react';
import { Confirm, Drawer } from '../../components/kit';
import { download, readGrid, readSheet, toCsv, type Column } from '../../lib/sheet';
import { readXlsx } from '../../lib/xlsx';
import { count } from '../../lib/format';
import { invalidate } from '../../data/resource';
import { importPeople, type PeopleReport } from '../../live/team';
import { givePhoneLogin } from '../../live/settings';
import { mayPay } from '../../live/pay';
import { useMe } from '../../live/session';
import { useCan } from '../../app/access';

/**
 * Forty reps from a spreadsheet, in three steps: get the template, check the
 * sheet against the database's own rules (import_people, a dry run), and add
 * everyone at once. Nothing is written until every row passes. Logins are a
 * separate, deliberate step at the end, one invite per person.
 */

const COLUMNS: Column[] = [
  { key: 'code', header: 'Employee code', get: () => 'CL-MR-041' },
  { key: 'name', header: 'Name', get: () => 'Asha Kumari' },
  { key: 'role', header: 'Role', get: () => 'Medical Representative' },
  { key: 'department', header: 'Department', get: () => 'Sales and marketing' },
  { key: 'territory', header: 'Territory or HQ', get: () => 'Hyderabad West' },
  { key: 'hq', header: 'HQ town', get: () => 'Madhapur' },
  { key: 'reports_to', header: 'Reports to (employee code)', get: () => 'CL-ASM-01' },
  { key: 'joined_on', header: 'Joined on', get: () => '01/04/2026' },
  { key: 'mobile', header: 'Mobile', get: () => '+91 98480 12345' },
  { key: 'email', header: 'Email', get: () => 'asha.kumari@example.com' },
];
const BASIC: Column = { key: 'basic', header: 'Basic salary (monthly)', get: () => '18000' };

/** A starting password nobody needs to know: the emailed link replaces it. */
const throwaway = () => {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) + 'a1';
};
const sentence = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return m.charAt(0).toUpperCase() + m.slice(1);
};

type Sent = { done: number; failed: { name: string; why: string }[] };

export function ImportPeople({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe();
  const allowed = useCan();
  const columns = mayPay(me.role) ? [...COLUMNS, BASIC] : COLUMNS;
  const [busy, setBusy] = useState<'' | 'reading' | 'checking' | 'importing' | 'sending'>('');
  const [problem, setProblem] = useState('');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [report, setReport] = useState<PeopleReport | null>(null);
  const [added, setAdded] = useState<{ report: PeopleReport; people: { id: string; name: string; code: string; email: string; hq: string; designation: string }[] } | null>(null);
  const [asking, setAsking] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const reset = () => {
    setRows(null); setReport(null); setIgnored([]); setProblem(''); setFileName(''); setAdded(null); setSent(null);
    if (file.current) file.current.value = '';
  };
  const close = () => {
    if (busy === 'sending') return;
    reset();
    onClose();
  };

  const chosen = async (f: File) => {
    setReport(null); setProblem(''); setIgnored([]);
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
      if (!parsed.rows.some(r => r.code !== undefined)) {
        setProblem('There is no Employee code column. Start from the template, so every column is named the way the check reads it.');
        return;
      }
      setBusy('checking');
      setReport(await importPeople(parsed.rows, false));
    } catch (e) {
      setProblem(sentence(e));
    } finally {
      setBusy('');
      // The same file, fixed and saved, can be picked again.
      if (file.current) file.current.value = '';
    }
  };

  const commit = async () => {
    if (!rows) return;
    setBusy('importing');
    setProblem('');
    try {
      const r = await importPeople(rows, true);
      setReport(r);
      if (r.committed) {
        const sheetRow = new Map(rows.filter(x => x.code).map(x => [x.code.trim().toUpperCase(), x]));
        const people = r.created.map(c => {
          const x = sheetRow.get(c.code.toUpperCase()) ?? ({} as Record<string, string>);
          return { id: c.id, code: c.code, name: x.name?.trim() ?? c.code, email: x.email?.trim().toLowerCase() ?? '', hq: x.hq?.trim() ?? '', designation: x.role?.trim() ?? '' };
        });
        setAdded({ report: r, people });
        invalidate('team:', 'search:index', 'home:', 'field:', 'settings:');
      }
    } catch (e) {
      setProblem(sentence(e));
    } finally {
      setBusy('');
    }
  };

  const sendLogins = async () => {
    if (!added) return;
    setAsking(false);
    setBusy('sending');
    const progress: Sent = { done: 0, failed: [] };
    setSent({ ...progress });
    for (const p of added.people) {
      try {
        await givePhoneLogin({ id: p.id, name: p.name, code: p.code, hq: p.hq, email: p.email || null, designation: p.designation, login: null, office: null }, throwaway());
      } catch (e) {
        progress.failed.push({ name: p.name, why: sentence(e) });
      }
      progress.done += 1;
      setSent({ done: progress.done, failed: [...progress.failed] });
    }
    invalidate('team:', 'settings:');
    setBusy('');
  };

  const bad = report ? new Set(report.errors.filter(e => e.row > 0).map(e => e.row)).size : 0;
  const clean = Boolean(report && report.errors.length === 0);
  const step = added ? 3 : report ? 2 : 1;
  const newCount = added?.people.length ?? 0;
  const mayLogins = allowed('users');

  const footer = added ? (
    <button type="button" className="btn btn-primary" disabled={busy === 'sending'} onClick={close}>Close</button>
  ) : (
    <>
      <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
      <button type="button" className="btn btn-primary" disabled={!clean || busy !== ''} onClick={() => void commit()}>
        {busy === 'importing' ? 'Adding…' : clean && report
          ? [report.create && `Add ${count(report.create, 'person', 'people')}`, report.update && `${report.create ? 'update' : 'Update'} ${report.update}`].filter(Boolean).join(' and ')
          : 'Add the people'}
      </button>
    </>
  );

  return (
    <Drawer open={open} onClose={close} wide title="Import people from a sheet"
      sub="Everyone in one go, from a spreadsheet. Nothing is added until every row passes the check."
      footer={footer}>
      <ol className="import-steps" aria-label="Steps">
        {['Get the sheet', 'Check', 'Done'].map((s, i) => (
          <li key={s} aria-current={step === i + 1 ? 'step' : undefined} className={step === i + 1 ? 'on' : step > i + 1 ? 'past' : ''}>{s}</li>
        ))}
      </ol>

      {added ? (
        <div className="import-done">
          <p className="import-done-title">{added.report.create ? `${count(added.report.create, 'person', 'people')} added.` : 'Nobody new was added.'}{added.report.update ? ` ${count(added.report.update, 'person', 'people')} updated.` : ''}</p>
          {newCount > 0 && !sent && <p className="joined-text">{newCount === 1 ? 'Their phone login is not sent yet. They get' : 'Their phone logins are not sent yet. Each person gets'} an email with the company code, their employee ID and a link to choose a password.</p>}
          {sent && (
            <p className="joined-text" role="status">
              {busy === 'sending'
                ? `Sending logins: ${sent.done} of ${newCount}…`
                : sent.failed.length
                  ? `${count(sent.done - sent.failed.length, 'login')} sent. ${count(sent.failed.length, 'login was', 'logins were')} not.`
                  : `${count(sent.done, 'login')} sent. Each person has an email with a link to choose their password.`}
            </p>
          )}
          {sent && sent.failed.length > 0 && busy !== 'sending' && (
            <ul className="sheet-errors">{sent.failed.map(f => <li key={f.name}><strong>{f.name}</strong>: {f.why}</li>)}</ul>
          )}
          <div className="record-actions">
            {newCount > 0 && !sent && (mayLogins
              ? <button type="button" className="btn btn-primary" onClick={() => setAsking(true)}>{newCount === 1 ? `Send ${added.people[0].name} their login` : `Send logins to the ${newCount} new people`}</button>
              : <p className="form-note">Ask an owner or admin to send their logins, under Settings, Logins and access.</p>)}
            {newCount > 0 && <Link className="btn btn-secondary" to={`/team?only=${added.people.map(p => p.id).join(',')}`} onClick={close}>See the new people</Link>}
          </div>
        </div>
      ) : (
        <div className="form">
          <section className="import-part" aria-labelledby="imp-get">
            <h3 id="imp-get" className="section-title">Get the sheet</h3>
            <p className="form-help">One row per person. Start from the template: it names every column the check reads, with one example row to replace. Excel or CSV both come back fine.</p>
            <div>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => download('people-template.csv', toCsv(columns, [{}]))}>
                <DownloadSimple size={14} aria-hidden="true" /> Download the template
              </button>
            </div>
            <dl className="import-columns">
              <div><dt>Required</dt><dd>Employee code, name, role, territory or HQ, joined on, email; and reports to, for a field role.</dd></div>
              <div><dt>Optional</dt><dd>Department, HQ town, mobile{mayPay(me.role) ? ', basic salary' : ''}.</dd></div>
              <div><dt>Already on the roster</dt><dd>A code that already exists updates that person. Empty cells leave their details as they are.</dd></div>
            </dl>
            <div className="form-field">
              <label htmlFor="people-file" className="form-label">The filled sheet, as CSV or Excel</label>
              <input id="people-file" ref={file} type="file" className="input file-input" aria-label="The filled sheet, as CSV or Excel"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={e => { const f = e.target.files?.[0]; if (f) void chosen(f); }} />
              {fileName && !busy && <p className="form-help">{fileName}. Fixed it? Pick the file again; the check runs afresh.</p>}
            </div>
          </section>

          {busy === 'reading' && <p className="form-help" role="status">Reading {fileName}…</p>}
          {busy === 'checking' && <p className="form-help" role="status">Checking {count(rows?.length ?? 0, 'row')}…</p>}
          {problem && <p className="form-error" role="alert">That did not work. {problem}</p>}
          {ignored.length > 0 && <p className="form-help">Columns not recognised, and left alone: {ignored.join(', ')}.</p>}

          {report && busy !== 'checking' && (
            <section className="import-part" aria-labelledby="imp-check">
              <h3 id="imp-check" className="section-title">Check</h3>
              <p className="import-verdict" role="status">
                {clean
                  ? <><strong>{[report.create && `${count(report.create, 'person', 'people')} ready`, report.update && `${report.update} will be updated`].filter(Boolean).join(', ')}.</strong> Nothing has been added yet.</>
                  : <><strong>{bad ? `${count(bad, 'row needs', 'rows need')} fixing` : 'The sheet cannot be added yet'}</strong>{report.total - bad > 0 ? `; ${report.total - bad} of ${report.total} rows are ready` : ''}. Nothing is added until every row passes, not even the rows that did.</>}
              </p>
              {report.errors.length > 0 && (
                <div className="table-wrap import-problems">
                  <table className="table">
                    <caption className="visually-hidden">What to fix in the sheet</caption>
                    <thead><tr><th scope="col" className="num">Row</th><th scope="col">Column</th><th scope="col">What is wrong, and how to fix it</th></tr></thead>
                    <tbody>
                      {report.errors.slice(0, 200).map((e, i) => (
                        <tr key={i}>
                          <td className="num">{e.row > 0 ? e.row : ''}</td>
                          <th scope="row">{e.field}</th>
                          <td>{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {report.errors.length > 200 && <p className="form-help">And {report.errors.length - 200} more. Fix these first and check again.</p>}
            </section>
          )}
        </div>
      )}

      <Confirm open={asking} title={newCount === 1 ? `Send ${added?.people[0]?.name ?? ''} their login?` : `Send logins to ${newCount} people?`} confirmLabel={`Send ${count(newCount, 'login')}`}
        onCancel={() => setAsking(false)} onConfirm={() => void sendLogins()}>
        Each person gets an email with the company code, their employee ID and a link to choose a password. Each login takes a phone seat.
      </Confirm>
    </Drawer>
  );
}
