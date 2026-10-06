import { useState } from 'react';
import { Link } from 'react-router-dom';
import { invalidate, useResource } from '../../data/resource';
import { loadSalaries, monthOf, type SalariesModel, type SalaryPerson } from '../../live/pay';
import { IST_TODAY, dayMonth } from '../../lib/days';
import { count, rupees } from '../../lib/format';
import { Notice, Pill, SearchBox, Summary, Toolbar } from '../../components/kit';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { Segmented } from '../../components/Segmented';
import { SalaryDrawer } from './SalaryDrawer';

/**
 * Salaries: what everyone is paid now, who has no salary yet, and revisions
 * waiting for their date. Set or revise from here or from a person's record;
 * Payroll uses what is here for every month. Owner, HR and finance only.
 */
export function Salaries() {
  const today = IST_TODAY();
  const r = useResource<SalariesModel>('money:salaries', () => loadSalaries(today));
  if (r.status === 'error' && !r.data) return <LoadError what="The salaries" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading the salaries" lines={2} />;
  return <View m={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function View({ m, at, error, reload }: { m: SalariesModel; at: Date | null; error: string; reload: () => void }) {
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'all' | 'set' | 'none'>('all');
  const [editing, setEditing] = useState<SalaryPerson | null>(null);
  const [notice, setNotice] = useState('');
  const net = (p: SalaryPerson) => (p.current ? monthOf(p.current.basic, p.current.values, m.components) : null);
  const withPay = m.people.filter(p => p.current);
  const without = m.people.filter(p => !p.current);
  const total = withPay.reduce((s, p) => s + (net(p)?.net ?? 0), 0);
  const needle = q.trim().toLowerCase();
  const rows = m.people
    .filter(p => show === 'all' || (show === 'set' ? p.current : !p.current))
    .filter(p => !needle || `${p.name} ${p.code} ${p.designation} ${p.hq}`.toLowerCase().includes(needle));

  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read the salaries again" />}>
        {m.people.length === 0 ? 'Nobody is on the roster yet.' : <>
          <strong>{rupees(total)} net a month</strong> for {count(withPay.length, 'person', 'people')}.
          {without.length ? <> <span className="warn-text">{count(without.length, 'person has', 'people have')} no salary yet</span>, so Payroll leaves them out.</> : ' Everyone has a salary.'}
        </>}
      </Summary>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Name, code, role or HQ" label="Find a person" />
        <Segmented label="Show" value={show} onChange={setShow} options={[
          { value: 'all', label: 'Everyone', count: m.people.length },
          { value: 'set', label: 'With a salary', count: withPay.length },
          { value: 'none', label: 'No salary', count: without.length },
        ]} />
      </Toolbar>
      {m.components.length === 0 && <p className="form-note">No pay components are set. Add them under <Link className="link" to="/settings/pay">Settings, Pay and expenses</Link>; a salary is then a basic and those components.</p>}
      {rows.length === 0 ? <Empty title="Nobody matches">Try another name, or show everyone.</Empty> : (
        <Arrive>
          <div className="table-wrap">
            <table className="table">
              <thead><tr>
                <th scope="col">Person</th>
                <th scope="col" className="num">Basic</th>
                <th scope="col" className="num hide-narrow">Gross</th>
                <th scope="col" className="num">Net a month</th>
                <th scope="col" className="hide-narrow">Since</th>
                <th scope="col"><span className="visually-hidden">Action</span></th>
              </tr></thead>
              <tbody>
                {rows.map(p => {
                  const n = net(p);
                  return (
                    <tr key={p.id}>
                      <th scope="row"><Link className="cell-link" to={`/team/${p.id}?tab=pay`}>{p.name}</Link><span className="cell-sub">{[p.code, p.designation, p.hq].filter(Boolean).join(' · ')}</span></th>
                      <td className="num">{p.current ? rupees(p.current.basic) : <span className="cell-quiet">-</span>}</td>
                      <td className="num hide-narrow">{n ? rupees(n.gross) : <span className="cell-quiet">-</span>}</td>
                      <td className="num">{n ? <strong>{rupees(n.net)}</strong> : <Pill tone="warning">No salary</Pill>}</td>
                      <td className="hide-narrow">{p.current ? dayMonth(p.current.from) : ''}{p.next && <span className="cell-sub">Revised from {dayMonth(p.next.from)}</span>}</td>
                      <td className="row-action"><button type="button" className="link" onClick={() => setEditing(p)}>{p.current ? 'Revise' : 'Set salary'}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Arrive>
      )}
      <SalaryDrawer open={Boolean(editing)} person={editing} current={editing?.next ?? editing?.current ?? null} components={m.components} structures={m.structures}
        onClose={() => setEditing(null)} onDone={msg => { setEditing(null); setNotice(msg); invalidate('money:', 'team:person:'); }} />
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}
