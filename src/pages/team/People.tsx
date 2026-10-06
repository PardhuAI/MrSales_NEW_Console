import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Faders, Plus, UploadSimple } from '@phosphor-icons/react';
import { useResource } from '../../data/resource';
import { loadRoster, type Person, type RosterModel } from '../../live/team';
import { IST_TODAY, dayMonth } from '../../lib/days';
import { count } from '../../lib/format';
import { Filter, Pill, SearchBox, Summary, Toolbar, useShowMore } from '../../components/kit';
import { Segmented } from '../../components/Segmented';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useMe } from '../../live/session';
import { useCan } from '../../app/access';
import { readDraft } from './AddPerson';
import { ImportPeople } from './ImportPeople';

/**
 * People: everyone on the roster. Find a person and open their record; add
 * someone new. Adding a person does not open the phone app for them: that is
 * a phone login, given separately.
 */

export const mayManagePeople = (role: string) => ['owner', 'admin', 'hr'].includes(role);

export function People() {
  const r = useResource<RosterModel>('team:roster', loadRoster);
  if (r.status === 'error' && !r.data) return <LoadError what="The roster" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading the roster" lines={1} />;
  return <View m={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

const LOGIN: Record<Person['login'], { word: string; tone: 'good' | 'neutral' | 'warning' }> = {
  phone: { word: 'Phone login', tone: 'good' }, office: { word: 'Office login', tone: 'good' }, suspended: { word: 'Login suspended', tone: 'neutral' }, none: { word: 'No login', tone: 'warning' },
};

function View({ m, at, error, reload }: { m: RosterModel; at: Date | null; error: string; reload: () => void }) {
  const nav = useNavigate();
  const me = useMe();
  const allowed = useCan();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'active' | 'left' | 'all'>('active');
  const [role, setRole] = useState('all');
  const [manager, setManager] = useState('all');
  const [more, setMore] = useState(false);
  const [territory, setTerritory] = useState('all');
  const [joined, setJoined] = useState('all');
  const [login, setLogin] = useState('all');
  const draft = readDraft();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const only = useMemo(() => new Set((params.get('only') ?? '').split(',').filter(Boolean)), [params]);
  const today = IST_TODAY();
  const active = m.people.filter(p => p.status === 'active');
  const managers = active.filter(p => p.reports > 0).sort((a, b) => a.name.localeCompare(b.name));
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    const since = joined === 'month' ? `${today.slice(0, 7)}-01` : joined === 'quarter' ? `${new Date(Date.now() - 92 * 864e5).toISOString().slice(0, 10)}` : joined === 'year' ? `${today.slice(0, 4)}-01-01` : '';
    if (only.size) return m.people.filter(p => only.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
    return m.people
      .filter(p => status === 'all' || (status === 'active' ? p.status === 'active' : p.status !== 'active'))
      .filter(p => !n || `${p.name} ${p.code} ${p.hq} ${p.email ?? ''} ${p.mobile ?? ''}`.toLowerCase().includes(n))
      .filter(p => role === 'all' || p.designationId === role)
      .filter(p => manager === 'all' || (manager === 'none' ? !p.managerId : p.managerId === manager))
      .filter(p => territory === 'all' || p.territoryId === territory)
      .filter(p => !since || p.joinedAt >= since)
      .filter(p => login === 'all' || p.login === login)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [m, q, status, role, manager, territory, joined, login, today, only]);
  const { shown, more: showMore } = useShowMore(rows, 60);
  const field = active.filter(p => p.role === 'MR').length;
  const mgrs = active.filter(p => p.role === 'ASM').length;
  const office = active.length - field - mgrs;
  const joinedMonth = active.filter(p => p.joinedAt >= `${today.slice(0, 7)}-01`).length;
  const noLogin = active.filter(p => p.role && p.login === 'none').length;
  const extra = [territory, joined, login].filter(x => x !== 'all').length;

  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read the roster again" />}>
        {active.length === 0 ? 'Nobody is on the roster yet.' : <>
          <strong>{count(active.length, 'person', 'people')}</strong>: {[field && `${field} in the field`, mgrs && count(mgrs, 'manager'), office > 0 && `${office} in the office`].filter(Boolean).join(', ')}.
          {joinedMonth ? ` ${joinedMonth} joined this month.` : ''}
          {noLogin && allowed('users') ? <> <Link className="link" to="/settings/logins">{count(noLogin, 'person has', 'people have')} no login yet</Link>.</> : ''}
        </>}
      </Summary>
      <Toolbar>
        {mayManagePeople(me.role) && <Link className="btn btn-primary btn-small" to="/team/new"><Plus size={14} weight="bold" aria-hidden="true" /> Add a person</Link>}
        {mayManagePeople(me.role) && <Link className="btn btn-secondary btn-small" to="/team/import"><UploadSimple size={14} aria-hidden="true" /> Import from a sheet</Link>}
        {draft && mayManagePeople(me.role) && <Link className="link" to="/team/new">Finish adding {draft.name || 'the joiner you started'}</Link>}
      </Toolbar>
      {mayManagePeople(me.role) && <ImportPeople open={pathname === '/team/import'} onClose={() => nav('/team')} />}
      {pathname === '/team/import' && !mayManagePeople(me.role) && (
        <p className="table-filter-note" role="status">Importing people is for owner, admin and HR logins. Ask one of them to import the sheet, or to change your access.</p>
      )}
      {only.size > 0 && (
        <p className="table-filter-note">Showing the {count(only.size, 'person', 'people')} just imported. <button type="button" className="link" onClick={() => setParams({})}>Show everyone</button></p>
      )}
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Name, employee code, HQ, email or mobile" label="Find a person" />
        <Segmented label="Status" value={status} onChange={setStatus} options={[{ value: 'active', label: 'Working here', count: active.length }, { value: 'left', label: 'Left', count: m.people.length - active.length }, { value: 'all', label: 'Everyone' }]} />
        <Filter label="Role" value={role} onChange={setRole} options={[{ value: 'all', label: 'Every role' }, ...m.roles.map(r => ({ value: r.id, label: r.name }))]} />
        <Filter label="Manager" value={manager} onChange={setManager} options={[{ value: 'all', label: 'Anyone' }, { value: 'none', label: 'Reports to nobody' }, ...managers.map(x => ({ value: x.id, label: x.name }))]} />
        <button type="button" className={`btn btn-secondary btn-small${more || extra ? ' on' : ''}`} aria-expanded={more} onClick={() => setMore(v => !v)}><Faders size={14} aria-hidden="true" /> More filters{extra ? ` (${extra})` : ''}</button>
      </Toolbar>
      {more && (
        <Toolbar>
          <Filter label="Territory" value={territory} onChange={setTerritory} options={[{ value: 'all', label: 'All' }, ...m.territories.map(t => ({ value: t.id, label: t.name }))]} />
          <Filter label="Joined" value={joined} onChange={setJoined} options={[{ value: 'all', label: 'Any time' }, { value: 'month', label: 'This month' }, { value: 'quarter', label: 'In the last three months' }, { value: 'year', label: 'This year' }]} />
          <Filter label="Login" value={login} onChange={setLogin} options={[{ value: 'all', label: 'Any' }, { value: 'phone', label: 'Phone login' }, { value: 'office', label: 'Office login' }, { value: 'none', label: 'No login' }, { value: 'suspended', label: 'Suspended' }]} />
        </Toolbar>
      )}
      {m.people.length === 0 ? (
        <Empty title="Nobody on the roster yet">Add your managers first, then the people who report to them. <Link className="link" to="/team/new">Add a person</Link></Empty>
      ) : rows.length === 0 ? (
        <div className="list-empty"><Empty title="Nobody matches">Try another name, or clear a filter.</Empty></div>
      ) : (
        <Arrive>
          <p className="table-count">{rows.length === m.people.length ? count(rows.length, 'person', 'people') : `${count(rows.length, 'person', 'people')} of ${m.people.length}`}</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th scope="col">Person</th><th scope="col">Posted</th><th scope="col">Reports to</th><th scope="col" className="hide-narrow">Joined</th><th scope="col">Login</th></tr>
              </thead>
              <tbody>
                {shown.map(p => {
                  const to = `/team/${p.id}`;
                  return (
                    <tr key={p.id} className="clickable" onClick={() => nav(to)}>
                      <th scope="row">
                        <Link className="cell-link" to={to} onClick={e => e.stopPropagation()}>{p.name}</Link>
                        <span className="cell-sub">{[p.code, p.designation, p.reports ? `${count(p.reports, 'report')}` : ''].filter(Boolean).join(' · ')}</span>
                      </th>
                      <td>{p.hq || <span className="cell-quiet">No HQ</span>}<span className="cell-sub">{p.territory}</span></td>
                      <td>{p.managerId ? p.manager : p.role === 'MR' && p.status === 'active' ? <Pill tone="warning">Nobody</Pill> : <span className="cell-quiet">Nobody</span>}</td>
                      <td className="hide-narrow">{p.joinedAt ? `${dayMonth(p.joinedAt)} ${p.joinedAt.slice(0, 4)}` : ''}</td>
                      <td>{p.status !== 'active' ? <Pill>Left</Pill> : p.role || p.login !== 'none' ? <Pill tone={LOGIN[p.login].tone}>{LOGIN[p.login].word}</Pill> : <span className="cell-quiet">Not needed</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {showMore}
        </Arrive>
      )}
    </div>
  );
}
