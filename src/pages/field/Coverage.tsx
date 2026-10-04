import { Link } from 'react-router-dom';
import { useResource } from '../../data/resource';
import { loadCoverage, type CoverageModel } from '../../live/field';
import { dayMonth } from '../../lib/days';
import { count } from '../../lib/format';
import { Summary, useShowMore } from '../../components/kit';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';

/**
 * Coverage: where nobody is going. Completed calls by area and week, quietest
 * first, so the areas that need a decision sit at the top instead of buried
 * under the ones that are fine. A planned call is not coverage; only done ones count.
 */
export function Coverage() {
  const r = useResource<CoverageModel>('field:coverage', () => loadCoverage(6));
  if (r.status === 'error' && !r.data) return <LoadError what="Coverage" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading coverage" />;
  return <CoverageView m={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function CoverageView({ m, at, error, reload }: { m: CoverageModel; at: Date | null; error: string; reload: () => void }) {
  const last = m.weeks.length - 1;
  const quiet = m.rows.filter(x => last >= 0 && x.cells[last] === 0);
  const untouched = m.rows.filter(x => x.total === 0);
  const max = Math.max(1, ...m.rows.flatMap(x => x.cells));
  const occasions = useShowMore(m.occasions, 10);

  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read coverage again" />}>
        {m.rows.length === 0 ? 'No areas are set up yet.' : <>
          Of <strong>{count(m.rows.length, 'area')}</strong>,{' '}
          {quiet.length ? <><span className="warn-text">{quiet.length}</span> had no completed call in the last seven days</> : 'every one was worked in the last seven days'}
          {untouched.length ? <>, and <span className="warn-text">{untouched.length}</span> had none in {count(m.weeks.length, 'week')}</> : ''}.
          {' '}{count(m.callsPlotted, 'completed call')} plotted.
        </>}
      </Summary>

      {m.rows.length === 0 ? (
        <Empty title="No areas yet">Areas are added under Settings, Geography. <Link className="link" to="/settings/geography">Set up geography</Link></Empty>
      ) : m.weeks.length === 0 ? (
        <Empty title="No whole week of visits yet">Coverage is drawn only for weeks the records fully cover, so an empty week always means nobody went.</Empty>
      ) : (
        <Arrive as="section" className="block">
          <div className="block-head">
            <h2 className="section-title">Completed calls by area and week</h2>
            <span className="block-meta">quietest first · each week named by the day it starts</span>
          </div>
          <div className="table-wrap">
            <table className="table heat">
              <thead>
                <tr>
                  <th scope="col">Area</th>
                  {m.weeks.map(w => <th key={w.start} scope="col" className="num">{w.label}</th>)}
                  <th scope="col" className="num">All weeks</th>
                </tr>
              </thead>
              <tbody>
                {m.rows.map(x => (
                  <tr key={x.areaId}>
                    <th scope="row">
                      <span className="cell-main">{x.area}</span>
                      <span className="cell-sub">{[x.territory, count(x.clients, 'client')].filter(Boolean).join(' · ')}</span>
                    </th>
                    {x.cells.map((n, i) => (
                      <td key={i} className="num heat-cell">
                        <span className={`heat-box${n === 0 ? ' zero' : ''}`} style={{ ['--v' as string]: n / max }}>{n === 0 ? 'None' : n}</span>
                      </td>
                    ))}
                    <td className="num"><strong>{x.total}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="block-note">Darker means more completed calls. A week with none says “None”, so a quiet area reads the same with or without colour.</p>
        </Arrive>
      )}

      <Arrive as="section" className="block coverage-occasions" index={1}>
        <div className="block-head">
          <h2 className="section-title">Occasions worth a call</h2>
          <span className="block-meta">birthdays and anniversaries in the next 30 days</span>
        </div>
        {m.occasions.length === 0 ? (
          <p className="block-empty">No client has a birthday or anniversary on record in the next 30 days. Reps add them on the client's record.</p>
        ) : (
          <ul className="rows">
            {occasions.shown.map(o => (
              <li key={o.clientId} className="row">
                <div className="row-main">
                  <p className="row-title"><Link className="cell-link" to={`/clients/${o.clientId}`}>{o.client}</Link></p>
                  <p className="row-sub">{[o.what, o.area, o.owner ? `seen by ${o.owner}` : 'nobody assigned'].join(' · ')}</p>
                </div>
                <span className="row-meta">{o.inDays === 0 ? 'Today' : o.inDays === 1 ? 'Tomorrow' : `${dayMonth(o.on)}, in ${o.inDays} days`}</span>
              </li>
            ))}
          </ul>
        )}
        {occasions.more}
      </Arrive>
    </div>
  );
}
