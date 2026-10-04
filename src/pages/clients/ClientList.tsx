import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Faders, Plus } from '@phosphor-icons/react';
import { invalidate, useResource } from '../../data/resource';
import { CATEGORY_LABEL, clientSheet, importClients, loadClients, quality, typeLabel, type ClientsModel } from '../../live/clients';
import { CLIENT_COLUMNS } from '../../data/sheets';
import { dayMonth } from '../../lib/days';
import { count } from '../../lib/format';
import { Filter, Notice, Pill, SearchBox, Summary, Toolbar, useShowMore } from '../../components/kit';
import { Segmented } from '../../components/Segmented';
import { SheetImport } from '../../components/SheetImport';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useMe } from '../../live/session';
import { ClientForm, Specialties } from './ClientForm';

/**
 * All clients: the doctors, hospitals, chemists and stockists the field calls
 * on. One sentence says how many and how many need fixing; the list is the rest.
 */

export const mayEditClients = (role: string) => ['owner', 'admin', 'hr', 'management'].includes(role);
export const mayShapeClients = (role: string) => ['owner', 'admin', 'management'].includes(role);

export function ClientList() {
  const r = useResource<ClientsModel>('clients:all', loadClients);
  if (r.status === 'error' && !r.data) return <LoadError what="The client list" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading the client list" lines={1} />;
  return <ListView m={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function ListView({ m, at, error, reload }: { m: ClientsModel; at: Date | null; error: string; reload: () => void }) {
  const nav = useNavigate();
  const loc = useLocation();
  const me = useMe();
  const [adding, setAdding] = useState(loc.pathname === '/clients/new');
  const [notice, setNotice] = useState('');
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [listing, setListing] = useState<'all' | 'listed' | 'unlisted' | 'retired'>('all');
  const [more, setMore] = useState(false);
  const [territory, setTerritory] = useState('all');
  const [area, setArea] = useState('all');
  const [owner, setOwner] = useState('all');

  const gaps = useMemo(() => quality(m.clients), [m]);
  const gapCount = new Set([...gaps.noLocation, ...gaps.unassigned].map(c => c.id)).size + gaps.duplicates.length;
  const types = [...new Set(m.clients.map(c => c.type))].sort((a, b) => m.clients.filter(c => c.type === b).length - m.clients.filter(c => c.type === a).length);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return m.clients
      .filter(c => !needle || `${c.name} ${c.specialty ?? ''} ${c.city ?? ''} ${c.mobile ?? ''}`.toLowerCase().includes(needle))
      .filter(c => type === 'all' || c.type === type)
      .filter(c => listing === 'all' || (listing === 'retired' ? c.listed && c.active === false : listing === 'listed' ? c.listed && c.active !== false : !c.listed))
      .filter(c => territory === 'all' || c.territoryId === territory)
      .filter(c => area === 'all' || c.areaId === area)
      .filter(c => owner === 'all' || (owner === 'none' ? !c.ownerId : c.ownerId === owner));
  }, [m, q, type, listing, territory, area, owner]);
  const { shown, more: showMore } = useShowMore(rows, 60);
  const extra = [territory, area, owner].filter(x => x !== 'all').length;
  const listed = m.clients.filter(c => c.listed && c.active !== false).length;
  const clear = () => { setQ(''); setType('all'); setListing('all'); setTerritory('all'); setArea('all'); setOwner('all'); };

  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read the client list again" />}>
        {m.clients.length === 0 ? 'No clients yet.' : <>
          <strong>{count(m.clients.length, 'client')}</strong>, {listed} of them on the company list.{' '}
          {gapCount ? <><Link className="link" to="/clients/quality">{count(gapCount, 'record needs', 'records need')} fixing</Link>: {[gaps.noLocation.length && `${gaps.noLocation.length} without a location`, gaps.unassigned.length && `${gaps.unassigned.length} with nobody assigned`, gaps.duplicates.length && `${count(gaps.duplicates.length, 'probable duplicate')}`].filter(Boolean).join(', ')}.</> : 'Every client has a location and someone assigned.'}
        </>}
      </Summary>

      <Toolbar>
        {mayEditClients(me.role) && (
          <button type="button" className="btn btn-primary btn-small" onClick={() => setAdding(true)}><Plus size={14} weight="bold" aria-hidden="true" /> Add a client</button>
        )}
        {mayShapeClients(me.role) && (
          <>
            <SheetImport name="clients" columns={CLIENT_COLUMNS} load={clientSheet} run={importClients} onDone={msg => { invalidate('clients:', 'search:index'); setNotice(`Client sheet imported: ${msg}`); }} />
            <Specialties list={m.specialties} />
          </>
        )}
      </Toolbar>

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Name, specialty, city or mobile" label="Find a client" />
        <Filter label="Type" value={type} onChange={setType} options={[{ value: 'all', label: 'Every type' }, ...types.map(t => ({ value: t, label: `${typeLabel(t)} (${m.clients.filter(c => c.type === t).length})` }))]} />
        <Segmented label="Listing" value={listing} onChange={setListing} options={[
          { value: 'all', label: 'All' }, { value: 'listed', label: 'Listed' }, { value: 'unlisted', label: 'Unlisted' }, { value: 'retired', label: 'Retired' },
        ]} />
        <button type="button" className={`btn btn-secondary btn-small${more || extra ? ' on' : ''}`} aria-expanded={more} onClick={() => setMore(v => !v)}>
          <Faders size={14} aria-hidden="true" /> More filters{extra ? ` (${extra})` : ''}
        </button>
      </Toolbar>
      {more && (
        <Toolbar>
          <Filter label="Territory" value={territory} onChange={v => { setTerritory(v); setArea('all'); }} options={[{ value: 'all', label: 'All' }, ...m.geo.territories.map(t => ({ value: t.id, label: t.name }))]} />
          <Filter label="Area" value={area} onChange={setArea} options={[{ value: 'all', label: 'All' }, ...m.geo.areas.filter(a => territory === 'all' || a.territoryId === territory).map(a => ({ value: a.id, label: a.name }))]} />
          <Filter label="Seen by" value={owner} onChange={setOwner} options={[{ value: 'all', label: 'Anyone' }, { value: 'none', label: 'Nobody assigned' }, ...m.people.filter(p => p.active).map(p => ({ value: p.id, label: p.name }))]} />
        </Toolbar>
      )}

      {m.clients.length === 0 ? (
        <Empty title="No clients yet">
          Add the doctors, hospitals, chemists and stockists your field calls on, one at a time or from a sheet. Reps can also add them from the phone.
        </Empty>
      ) : rows.length === 0 ? (
        <div className="list-empty"><Empty title="No clients match">Try another name, or <button type="button" className="link" onClick={clear}>clear the filters</button>.</Empty></div>
      ) : (
        <Arrive>
          <p className="table-count">{rows.length === m.clients.length ? count(rows.length, 'client') : `${count(rows.length, 'client')} of ${m.clients.length}`}</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col">Area</th>
                  <th scope="col">Seen by</th>
                  <th scope="col">Listing</th>
                  <th scope="col" className="num">Visits</th>
                  <th scope="col" className="hide-narrow">Last visit</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(c => {
                  const to = `/clients/${c.id}`;
                  return (
                    <tr key={c.id} className="clickable" onClick={() => nav(to)}>
                      <th scope="row">
                        <Link className="cell-link" to={to} onClick={e => e.stopPropagation()}>{c.name}</Link>
                        <span className="cell-sub">{[typeLabel(c.type), c.specialty, CATEGORY_LABEL[c.category] && c.category !== 'regular' ? CATEGORY_LABEL[c.category] : ''].filter(Boolean).join(' · ')}</span>
                      </th>
                      <td>{c.area}<span className="cell-sub">{c.territory}</span></td>
                      <td>{c.ownerId ? c.owner : <Pill tone="warning">Nobody</Pill>}</td>
                      <td>{!c.listed ? <span className="cell-quiet">Unlisted</span> : c.active === false ? <span className="cell-quiet">Retired</span> : 'Listed'}{!c.hasLocation && <span className="cell-sub warn-text">No location yet</span>}</td>
                      <td className="num">{c.visits}</td>
                      <td className="hide-narrow">{c.lastVisit ? dayMonth(c.lastVisit) : <span className="cell-quiet">Never</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {showMore}
        </Arrive>
      )}

      <ClientForm
        open={adding}
        model={m}
        onClose={() => { setAdding(false); if (loc.pathname === '/clients/new') nav('/clients', { replace: true }); }}
        onSaved={(id, name) => { setAdding(false); invalidate('clients:', 'search:index'); nav(`/clients/${id}`, { state: { notice: `${name} was added.` } }); }}
      />
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}
