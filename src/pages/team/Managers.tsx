import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';
import { useResource } from '../../data/resource';
import { loadManagers, type ManagerRow } from '../../live/team';
import { monthName } from '../../live/sales';
import { ago } from '../../lib/days';
import { count, percent, rupees, rupeesShort } from '../../lib/format';
import { Summary } from '../../components/kit';
import { MonthBars, ShareBar } from '../../components/charts';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';

/**
 * Managers: each manager's team side by side, then one manager's page with
 * their team figure by figure. "Who leads and who trails" is read from the
 * month's sales against target, or calls when there are no targets.
 */
export function Managers() {
  const r = useResource('team:managers', loadManagers);
  if (r.status === 'error' && !r.data) return <LoadError what="Managers" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading the teams" lines={1} />;
  const { managers, unmanaged, monthKey } = r.data;
  const sizes = managers.map(m => m.team.length).sort((a, b) => b - a);
  // Name the largest team only when one team really is the largest.
  const biggest = sizes[0] > (sizes[1] ?? 0) ? managers.find(m => m.team.length === sizes[0]) : undefined;
  const empty = managers.filter(m => !m.team.length);
  return (
    <div className="page-body">
      <Summary aside={<Freshness at={r.at} error={r.error} reload={() => void r.reload()} label="Read the teams again" />}>
        {managers.length === 0 ? 'Nobody manages a team yet.' : <>
          <strong>{count(managers.length, 'manager')}</strong>, managing {count(managers.reduce((s, m) => s + m.team.length, 0), 'person', 'people')}{biggest?.team.length ? `; the largest team is ${biggest.name}'s, with ${biggest.team.length}` : ''}.
          {empty.length ? ` ${count(empty.length, 'manager has', 'managers have')} nobody reporting to them.` : ''}
          {unmanaged.length ? <> <Link className="link" to="/team/org-chart"><span className="warn-text">{count(unmanaged.length, 'field person reports', 'field people report')} to nobody</span></Link>.</> : ''}
        </>}
      </Summary>
      {managers.length === 0 ? (
        <Empty title="No managers yet">Add people whose role opens the manager app, then put the field under them in the org chart.</Empty>
      ) : (
        <Arrive>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Manager</th><th scope="col" className="num">Team</th><th scope="col" className="num">Calls this week</th><th scope="col" className="num hide-narrow">At the client, 30 days</th><th scope="col" className="num">Sold in {monthName(monthKey)}</th><th scope="col" className="num">Of target</th></tr></thead>
              <tbody>
                {managers.map(m => (
                  <tr key={m.id}>
                    <th scope="row"><Link className="cell-link" to={`/team/managers/${m.id}`}>{m.name}</Link><span className="cell-sub">{[m.territory || m.hq, m.manager && `reports to ${m.manager}`].filter(Boolean).join(' · ')}</span></th>
                    <td className="num">{m.team.length || <span className="cell-quiet">Nobody</span>}</td>
                    <td className="num">{m.doneWeek}<span className="cell-sub-inline"> of {m.plannedWeek}</span></td>
                    <td className="num hide-narrow">{m.checked ? percent(m.verified, m.checked) : <span className="cell-quiet">No calls</span>}</td>
                    <td className="num">{rupeesShort(m.sales)}</td>
                    <td className="num">{m.target ? <ShareBar part={m.sales} whole={m.target} label={percent(m.sales, m.target)} /> : <span className="cell-quiet">No target</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Arrive>
      )}
    </div>
  );
}

export function ManagerPage() {
  const { id = '' } = useParams();
  const r = useResource('team:managers', loadManagers);
  if (r.status === 'error' && !r.data) return <LoadError what="This team" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading the team" />;
  const m = r.data.managers.find(x => x.id === id);
  if (!m) return <Empty title="No such manager">The link may be out of date. <Link className="link" to="/team/managers">Back to managers</Link></Empty>;
  return <ManagerView m={m} monthKey={r.data.monthKey} />;
}

function ManagerView({ m, monthKey }: { m: ManagerRow; monthKey: string }) {
  const [month, setMonth] = useState(monthKey);
  const ranked = [...m.team].sort((a, b) => (b.target ? b.sales / b.target : b.done30 / 100) - (a.target ? a.sales / a.target : a.done30 / 100));
  const useTarget = m.team.some(t => t.target);
  return (
    <div className="pday">
      <Arrive className="pday-head">
        <Link className="link back-link" to="/team/managers"><ArrowLeft size={13} aria-hidden="true" /> Managers</Link>
        <div className="pday-title-row">
          <div>
            <h2 className="page-title-lg">{m.name}'s team</h2>
            <p className="pday-who">{[m.code, m.territory || m.hq, count(m.team.length, 'person', 'people'), m.manager && `reports to ${m.manager}`].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="record-actions"><Link className="btn btn-secondary" to={`/team/${m.id}`}>Open {m.name.split(' ')[0]}'s record</Link></div>
        </div>
        <p className="pday-line">
          {m.target ? `${rupeesShort(m.sales)} sold in ${monthName(monthKey)}, ${percent(m.sales, m.target)} of ${rupeesShort(m.target)}. ` : ''}
          {m.doneWeek} of {count(m.plannedWeek, 'call')} done this week{m.checked ? `, ${percent(m.verified, m.checked)} at the client` : ''}.
        </p>
      </Arrive>
      <dl className="figs wide-figs">
        <div><dt>Calls this week</dt><dd>{m.doneWeek}</dd></div>
        <div><dt>Clients added this month</dt><dd>{m.clientsAdded}</dd></div>
        <div><dt>Leave days this month</dt><dd>{m.leaveDays}</dd></div>
        <div><dt>Claimed this month</dt><dd>{rupeesShort(m.claimed)}</dd></div>
      </dl>
      <section className="block">
        <MonthBars caption="The team's sales each month, against its target" format={rupees} partA="Sales" partB="" highlight={month} onPick={setMonth}
          data={m.year.map(y => ({ key: y.month, label: monthName(y.month, false), a: y.sales, b: 0, target: y.target }))} />
      </section>
      <section className="block">
        <div className="block-head"><h3 className="section-title">The team, figure by figure</h3><span className="block-meta">{useTarget ? `furthest ahead of target first` : 'most calls first'}</span></div>
        {m.team.length === 0 ? <p className="block-empty">Nobody reports to {m.name} yet. Move people under them in the org chart.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Person</th><th scope="col" className="num">Calls this week</th><th scope="col" className="num">Done, 30 days</th><th scope="col" className="num hide-narrow">Missed, 30 days</th><th scope="col" className="num">Sold</th><th scope="col" className="num">Of target</th><th scope="col" className="hide-narrow">Last seen</th></tr></thead>
              <tbody>
                {ranked.map((t, i) => (
                  <tr key={t.id}>
                    <th scope="row"><Link className="cell-link" to={`/team/${t.id}`}>{t.name}</Link><span className="cell-sub">{[t.hq, count(t.clients, 'client'), i === 0 && ranked.length > 2 ? 'leads the team' : i === ranked.length - 1 && ranked.length > 2 ? 'trails the team' : ''].filter(Boolean).join(' · ')}</span></th>
                    <td className="num">{t.doneWeek}<span className="cell-sub-inline"> of {t.plannedWeek}</span></td>
                    <td className="num">{t.done30}</td>
                    <td className="num hide-narrow">{t.missed30 ? <span className="warn-text">{t.missed30}</span> : 0}</td>
                    <td className="num">{rupeesShort(t.sales)}</td>
                    <td className="num">{t.target ? <ShareBar part={t.sales} whole={t.target} label={percent(t.sales, t.target)} /> : <span className="cell-quiet">No target</span>}</td>
                    <td className="hide-narrow">{t.lastSeen ? ago(t.lastSeen) : <span className="cell-quiet">Never</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
