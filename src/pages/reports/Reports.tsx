import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, DownloadSimple } from '@phosphor-icons/react';
import { invalidate, useResource } from '../../data/resource';
import { loadEmployees, type Employee } from '../../live/people';
import {
  CATALOGUE, SHEETS, exportUrl, loadExports, recordExport, reportName, runReport, sheetValue,
  type Cell, type Col, type ExportJob, type Report, type ReportKey, type Scope,
} from '../../live/reports';
import { monthName } from '../../live/sales';
import { IST_TODAY, ago, dayMonth, timeOf } from '../../lib/days';
import { count, rupees } from '../../lib/format';
import { download, toCsv } from '../../lib/sheet';
import { openFile } from '../../lib/openFile';
import { Filter, Notice, Pill, Summary, Toolbar, useShowMore } from '../../components/kit';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useMe } from '../../live/session';

const monthsBack = (n: number) => {
  const [y, m] = IST_TODAY().split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
};
const monthLabel = (k: string) => `${monthName(k)} ${k.slice(0, 4)}`;

/** Whose data: everyone, a manager's whole line, or one person. */
function useWhose() {
  const r = useResource<Map<string, Employee>>('reports:people', loadEmployees);
  const people = r.data ? [...r.data.values()].filter(e => e.status === 'active') : [];
  const managers = people.filter(p => people.some(q => q.managerId === p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const field = people.filter(p => p.role === 'MR').sort((a, b) => a.name.localeCompare(b.name));
  const options = [
    { value: 'all', label: 'Everyone in the field' },
    ...managers.map(m => ({ value: `team:${m.id}`, label: `${m.name}'s team` })),
    ...field.map(p => ({ value: p.id, label: p.name })),
  ];
  const label = (v: string) => options.find(o => o.value === v)?.label ?? 'Everyone in the field';
  return { options, label };
}

const fmt = (c: Col, v: Cell) => {
  if (v == null || v === '') return c.kind && c.kind !== 'text' ? <span className="cell-quiet">{c.kind === 'pct' ? 'No base' : 'None'}</span> : '';
  if (c.kind === 'money') return rupees(Number(v));
  if (c.kind === 'pct') return `${v}%`;
  if (c.kind === 'day') return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? dayMonth(String(v)) : String(v);
  if (c.kind === 'time') return timeOf(String(v));
  return String(v);
};
const numeric = (c: Col) => c.kind === 'num' || c.kind === 'money' || c.kind === 'pct';
const csvOf = (r: Report) => toCsv(r.columns.map(c => ({ key: c.key, header: c.header, get: (row: Record<string, unknown>) => sheetValue(c, row[c.key] as Cell) })), r.rows as unknown as Record<string, unknown>[]);
const fileName = (key: string, s: Scope, whose: string) => `${reportName(key).toLowerCase().replace(/\s+/g, '-')}-${s.month}${s.whose === 'all' ? '' : `-${whose.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}.csv`;

// ── reports ───────────────────────────────────────────────────────────

/**
 * Reports: pick one, then a month and whose figures. The list is a list, not
 * a wall of cards; the report itself is one table with its total.
 */
export function Reports() {
  const [params, setParams] = useSearchParams();
  const key = params.get('report') as ReportKey | null;
  const known = key && CATALOGUE.some(g => g.items.some(i => i.key === key));
  if (known) return <ReportView reportKey={key} onBack={() => setParams({})} />;
  return (
    <div className="page-body">
      <Summary>Every report reads the same records the phones write, for one month and the people you choose, and downloads as the sheet you see.</Summary>
      <Arrive className="rpt-groups">
        {CATALOGUE.map(g => (
          <section key={g.group} className="rpt-group">
            <h2 className="fig-title">{g.group}</h2>
            <ul className="rows">
              {g.items.map(i => (
                <li key={i.key} className="row">
                  <div className="row-main">
                    <p className="row-title"><Link className="cell-link" to={`?report=${i.key}`}>{i.name}</Link></p>
                    <p className="row-sub">{i.about}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Arrive>
    </div>
  );
}

function ReportView({ reportKey, onBack }: { reportKey: ReportKey; onBack: () => void }) {
  const me = useMe();
  const months = monthsBack(12);
  const [month, setMonth] = useState(months[0]);
  const [whose, setWhose] = useState('all');
  const w = useWhose();
  const scope: Scope = { month, whose };
  const r = useResource<Report>(`reports:run:${reportKey}:${month}:${whose}`, () => runReport(reportKey, scope));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const item = CATALOGUE.flatMap(g => g.items).find(i => i.key === reportKey)!;
  const save = async () => {
    if (!r.data) return;
    setBusy(true);
    setProblem('');
    const csv = csvOf(r.data);
    try {
      download(fileName(reportKey, scope, w.label(whose)), csv);
      const { kept } = await recordExport(me.orgId, me.userId, reportKey, { month, scope: whose, whoseLabel: w.label(whose) }, csv);
      setNotice(kept ? 'The sheet is downloaded, and a copy is kept under Downloads.' : 'The sheet is downloaded; the copy under Downloads could not be kept.');
      invalidate('reports:exports');
    } catch (e) {
      setProblem(`The sheet is downloaded, but the download was not recorded: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-body">
      <div className="rpt-head">
        <button type="button" className="link back-link" onClick={onBack}><ArrowLeft size={13} aria-hidden="true" /> Reports</button>
        <h2 className="page-title-lg">{item.name}</h2>
        <p className="add-lede">{item.about}</p>
      </div>
      <Toolbar>
        <Filter label="Month" value={month} onChange={setMonth} options={months.map(k => ({ value: k, label: monthLabel(k) }))} />
        <Filter label="Whose" value={whose} onChange={setWhose} options={w.options} />
        <button type="button" className="btn btn-secondary btn-small" disabled={!r.data?.rows.length || busy} onClick={() => void save()}><DownloadSimple size={14} aria-hidden="true" /> {busy ? 'Making the sheet…' : 'Download as a sheet'}</button>
        <span className="toolbar-end"><Freshness at={r.at} error={r.error} reload={() => void r.reload()} label="Run the report again" /></span>
      </Toolbar>
      {problem && <p className="form-error" role="alert">{problem}</p>}
      {r.status === 'error' && !r.data ? <LoadError what="The report" error={r.error} retry={() => void r.reload()} />
        : !r.data ? <Loading label="Running the report" lines={1} />
        : <ReportTable report={r.data} empty={`Nothing recorded for ${w.label(whose).replace(/^Everyone in the field$/, 'the field')} in ${monthLabel(month)}.`} />}
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

function ReportTable({ report: full, empty }: { report: Report; empty: string }) {
  const report = { ...full, columns: full.columns.filter(c => !c.sheetOnly) };
  const { shown, more } = useShowMore(report.rows, 100);
  if (!report.rows.length) return <Empty title="Nothing to report">{empty}</Empty>;
  return (
    <Arrive>
      <p className="table-count">{count(report.rows.length, 'row')}</p>
      <div className="table-wrap rpt-wrap">
        <table className="table rpt-table">
          <thead><tr>{report.columns.map(c => <th key={c.key} scope="col" className={numeric(c) ? 'num' : ''}>{c.header}</th>)}</tr></thead>
          <tbody>
            {shown.map(row => (
              <tr key={row._id}>{report.columns.map((c, i) => i === 0
                ? <th key={c.key} scope="row">{fmt(c, row[c.key])}</th>
                : <td key={c.key} className={numeric(c) ? 'num' : ''}>{fmt(c, row[c.key])}</td>)}</tr>
            ))}
          </tbody>
          {report.total && (
            <tfoot><tr>{report.columns.map((c, i) => i === 0
              ? <th key={c.key} scope="row">{String(report.total![c.key] ?? 'Total')}</th>
              : <td key={c.key} className={numeric(c) ? 'num' : ''}>{report.total![c.key] != null ? fmt(c, report.total![c.key]) : ''}</td>)}</tr></tfoot>
          )}
        </table>
      </div>
      {more}
      {report.note && <p className="block-note">{report.note}</p>}
    </Arrive>
  );
}

// ── downloads ─────────────────────────────────────────────────────────

/** Downloads: the office's own sheets for any person and month, and the ones made before. */
export function Downloads() {
  const me = useMe();
  const months = monthsBack(12);
  const [month, setMonth] = useState(Number(IST_TODAY().slice(8)) <= 10 ? months[1] : months[0]);
  const [whose, setWhose] = useState('all');
  const w = useWhose();
  const jobs = useResource<ExportJob[]>('reports:exports', loadExports);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const make = async (key: ReportKey) => {
    setBusy(key);
    setProblem('');
    try {
      const rep = await runReport(key, { month, whose });
      if (!rep.rows.length) {
        setProblem(`There is nothing in ${reportName(key)} for ${w.label(whose)} in ${monthLabel(month)}, so no sheet was made.`);
        return;
      }
      const csv = csvOf(rep);
      download(fileName(key, { month, whose }, w.label(whose)), csv);
      const { kept } = await recordExport(me.orgId, me.userId, key, { month, scope: whose, whoseLabel: w.label(whose) }, csv);
      setNotice(`${reportName(key)} for ${monthLabel(month)} is downloaded, ${count(rep.rows.length, 'row')}${kept ? '; a copy is kept below' : ''}.`);
      invalidate('reports:exports');
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };
  const open = (p: string) => { setProblem(''); openFile(() => exportUrl(p)).catch(e => setProblem(e instanceof Error ? e.message : String(e))); };
  const recent = useMemo(() => jobs.data ?? [], [jobs.data]);
  return (
    <div className="page-body">
      <Summary aside={<Freshness at={jobs.at} error={jobs.error} reload={() => void jobs.reload()} label="Read the downloads again" />}>
        Sheets in the office's own shape, for <strong>{w.label(whose)}</strong> in <strong>{monthLabel(month)}</strong>. Each download is recorded, because it is data leaving the company.
      </Summary>
      <Toolbar>
        <Filter label="Month" value={month} onChange={setMonth} options={months.map(k => ({ value: k, label: monthLabel(k) }))} />
        <Filter label="Whose" value={whose} onChange={setWhose} options={w.options} />
      </Toolbar>
      {problem && <p className="form-error" role="alert">{problem}</p>}
      <Arrive className="dl-layout">
        <section>
          <h2 className="fig-title">Sheets</h2>
          <ul className="rows dl-sheets">
            {SHEETS.map(s => (
              <li key={s.key} className="row">
                <div className="row-main"><p className="row-title">{s.name}</p><p className="row-sub">{s.about}</p></div>
                <button type="button" className="btn btn-secondary btn-small" disabled={Boolean(busy)} onClick={() => void make(s.key)}>
                  <DownloadSimple size={14} aria-hidden="true" /> {busy === s.key ? 'Making…' : 'Download'}
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="fig-title">Made before</h2>
          {jobs.status === 'error' && !jobs.data ? <LoadError what="The downloads" error={jobs.error} retry={() => void jobs.reload()} />
            : !jobs.data ? <Loading label="Reading the downloads" lines={1} />
            : recent.length === 0 ? <p className="block-empty">No sheet has been downloaded yet. Each one you make is listed here, and can be opened again.</p> : (
              <ul className="rows dl-sheets">
                {recent.map(j => (
                  <li key={j.id} className="row">
                    <div className="row-main">
                      <p className="row-title">{reportName(j.kind)}{j.month && /^\d{4}-\d{2}$/.test(j.month) ? `, ${monthLabel(j.month)}` : ''}</p>
                      <p className="row-sub">{[j.whose && (j.whose === 'all' ? 'Everyone in the field' : j.whose), ago(j.at)].filter(Boolean).join(' · ')}{j.error ? ` · ${j.error}` : ''}</p>
                    </div>
                    <span className="row-actions">
                      {j.status === 'ready' && j.path ? <button type="button" className="link" onClick={() => open(j.path!)}>Open</button>
                        : j.status === 'failed' ? <Pill tone="critical">Failed</Pill>
                        : <Pill>Being made</Pill>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </section>
      </Arrive>
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}
