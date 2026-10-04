import { Link } from 'react-router-dom';
import { useResource } from '../../data/resource';
import { loadClients, quality, typeLabel, type ClientRow, type ClientsModel } from '../../live/clients';
import { dayMonth } from '../../lib/days';
import { count } from '../../lib/format';
import { Summary, useShowMore } from '../../components/kit';
import { Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';

/**
 * Data quality: where the client list disagrees with itself. Each check says
 * what it costs, not just how many, and every client opens to be fixed.
 */
export function ClientQuality() {
  const r = useResource<ClientsModel>('clients:all', loadClients);
  if (r.status === 'error' && !r.data) return <LoadError what="The client list" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Checking the client list" lines={1} />;
  const q = quality(r.data.clients);
  const groups: { key: string; title: string; why: string; rows: ClientRow[]; pairs?: ClientRow[][] }[] = [
    { key: 'dup', title: 'Probable duplicates', rows: q.duplicates.flat(), pairs: q.duplicates,
      why: 'Two records for one doctor split their visits, orders and targets between them, and nothing later can tell they are the same person. Keep one, and retire the other.' },
    { key: 'loc', title: 'No registered location', rows: q.noLocation,
      why: 'Visits here can never be checked against the visit radius. For a client the office just added this is expected: the first rep to call there pins it. One that stays here is one nobody has visited.' },
    { key: 'own', title: 'Nobody assigned', rows: q.unassigned,
      why: 'Nobody is answerable for calling on these, and they fall outside every person\'s reports and coverage.' },
    { key: 'stale', title: 'Listed, but not visited in 30 days', rows: q.stale,
      why: 'A gap in coverage on clients the company chose to call on. Put them in next month\'s tour plans.' },
    { key: 'contra', title: 'Unlisted, but marked inactive', rows: q.contradictory,
      why: 'Active and retired describe a place on the company list, and these were never on it. Usually an old import; edit and save to clear it.' },
  ];
  const total = new Set(groups.flatMap(g => g.rows.map(c => c.id))).size;

  return (
    <div className="page-body">
      <Summary aside={<Freshness at={r.at} error={r.error} reload={() => void r.reload()} label="Check again" />}>
        {total === 0 ? <><strong>Nothing to fix.</strong> Every client has a location and someone assigned, and none look duplicated.</>
          : <><strong>{count(total, 'client needs', 'clients need')} fixing</strong> across {count(groups.filter(g => g.rows.length).length, 'check')}. Each check says what it costs.</>}
      </Summary>
      <div className="quality">
        {groups.map((g, i) => <Group key={g.key} g={g} index={i} />)}
      </div>
    </div>
  );
}

function Group({ g, index }: { g: { title: string; why: string; rows: ClientRow[]; pairs?: ClientRow[][] }; index: number }) {
  const { shown, more } = useShowMore(g.pairs ? g.pairs.map(p => p[0]) : g.rows, 10);
  return (
    <Arrive as="section" className="quality-group" index={index}>
      <header className="quality-head">
        <h2 className="section-title">{g.title}</h2>
        <p className="quality-count">{g.rows.length ? count(g.pairs ? g.pairs.length : g.rows.length, g.pairs ? 'pair' : 'client') : 'None'}</p>
        <p className="quality-why">{g.why}</p>
      </header>
      {g.rows.length === 0 ? (
        <p className="block-empty quality-clear">Every client passes this check.</p>
      ) : (
        <ul className="rows">
          {g.pairs
            ? shown.map(first => {
              const pair = g.pairs!.find(p => p[0] === first)!;
              return (
                <li key={first.id} className="row">
                  <div className="row-main">
                    {pair.map(c => (
                      <p key={c.id} className="row-title"><Link className="cell-link" to={`/clients/${c.id}`}>{c.name}</Link> <span className="row-title-sub">· {[typeLabel(c.type), c.area, c.owner || 'nobody assigned', count(c.visits, 'visit')].join(' · ')}</span></p>
                    ))}
                  </div>
                </li>
              );
            })
            : shown.map(c => (
              <li key={c.id} className="row">
                <div className="row-main">
                  <p className="row-title"><Link className="cell-link" to={`/clients/${c.id}`}>{c.name}</Link></p>
                  <p className="row-sub">{[typeLabel(c.type), c.area, c.owner || 'nobody assigned'].join(' · ')}</p>
                </div>
                <span className="row-meta">{c.lastVisit ? `last seen ${dayMonth(c.lastVisit)}` : 'never visited'}</span>
              </li>
            ))}
        </ul>
      )}
      {more}
    </Arrive>
  );
}
