import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CaretDown, CaretRight, Plus } from '@phosphor-icons/react';
import { invalidate, useResource } from '../../data/resource';
import {
  GRANTABLE, createArea, createCluster, createRegion, createRole, createTerritory, deletePlace, deleteRole,
  givePhoneLogin, inviteOffice, loadGeoTree, loadLogins, loadRoles, mayManageLogins, setLoginStatus, setRoleActive, updateRole,
  type GeoTree, type Login, type LoginsModel, type OfficeRole, type PhoneRow, type Role,
} from '../../live/settings';
import { ROLE_LABEL } from '../../app/access';
import { ago } from '../../lib/days';
import { count } from '../../lib/format';
import { Confirm, Drawer, Field, Notice, Pill, SearchBox, Summary, Toolbar, useFocusFirstError, useShowMore } from '../../components/kit';
import { Segmented } from '../../components/Segmented';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useMe } from '../../live/session';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ── geography ─────────────────────────────────────────────────────────

type Adding = { level: 'region' } | { level: 'territory'; parent: string; under: string } | { level: 'area'; parent: string; under: string } | { level: 'cluster'; parent: string; under: string };
type Removing = { level: 'territory' | 'area' | 'cluster'; id: string; name: string };

/** Geography: regions, territories, areas and clusters, with who is posted where and how many clients each holds. */
export function Geography() {
  const r = useResource<GeoTree>('settings:geo', loadGeoTree);
  if (r.status === 'error' && !r.data) return <LoadError what="The geography" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading the geography" lines={1} />;
  return <GeoView tree={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function GeoView({ tree, at, error, reload }: { tree: GeoTree; at: Date | null; error: string; reload: () => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<Adding | null>(null);
  const [removing, setRemoving] = useState<Removing | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const territories = tree.regions.flatMap(r => r.territories);
  const areas = territories.flatMap(t => t.areas);
  const clusters = areas.flatMap(a => a.clusters);
  const toggle = (id: string) => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const done = (m: string) => { setNotice(m); invalidate('settings:geo', 'geo:', 'clients:', 'team:'); };
  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    setProblem('');
    try {
      done(await deletePlace(removing.level, removing.id));
      setRemoving(null);
    } catch (e) {
      setProblem(msg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read the geography again" />}>
        {tree.regions.length === 0 ? 'No geography yet. Start with a region, then the territories in it.' : <>
          <strong>{count(tree.regions.length, 'region')}</strong>, {count(territories.length, 'territory', 'territories')}, {count(areas.length, 'area')} and {count(clusters.length, 'cluster')}.
          {territories.some(t => !t.people.length) ? ` ${count(territories.filter(t => !t.people.length).length, 'territory has', 'territories have')} nobody posted to it.` : ''}
        </>}
      </Summary>
      <Toolbar>
        <button type="button" className="btn btn-primary btn-small" onClick={() => setAdding({ level: 'region' })}><Plus size={14} weight="bold" aria-hidden="true" /> Add a region</button>
      </Toolbar>
      {tree.regions.length === 0 ? <Empty title="No geography yet">Everyone is posted to a territory and every client sits in an area, so this comes first.</Empty> : (
        <Arrive className="geo-regions">
          {tree.regions.map(r => (
            <section key={r.id} className="geo-region">
              <div className="block-head">
                <h2 className="section-title">{r.name}</h2>
                <button type="button" className="link" onClick={() => setAdding({ level: 'territory', parent: r.id, under: r.name })}>Add a territory</button>
              </div>
              {r.territories.length === 0 ? <p className="block-empty">No territories in {r.name} yet.</p> : (
                <ul className="org-list geo-tree">
                  {r.territories.map(t => {
                    const isOpen = open.has(t.id);
                    return (
                      <li key={t.id} className="org-node">
                        <div className="org-row geo-row">
                          <button type="button" className="org-toggle" aria-expanded={isOpen} aria-label={`${isOpen ? 'Fold' : 'Open'} ${t.name}`} onClick={() => toggle(t.id)}>{isOpen ? <CaretDown size={12} /> : <CaretRight size={12} />}</button>
                          <span className="org-who">
                            <span className="row-title">{t.name}</span>
                            <span className="cell-sub">{[t.hq && `HQ ${t.hq}`, count(t.areas.length, 'area'), count(t.clients, 'client'), t.people.length ? count(t.people.length, 'person', 'people') + ' posted' : 'nobody posted'].filter(Boolean).join(' · ')}</span>
                          </span>
                          <span className="row-actions">
                            <button type="button" className="link" onClick={() => setAdding({ level: 'area', parent: t.id, under: t.name })}>Add an area</button>
                            <button type="button" className="link danger-link" onClick={() => setRemoving({ level: 'territory', id: t.id, name: t.name })}>Remove</button>
                          </span>
                        </div>
                        {isOpen && (
                          <div className="geo-body">
                            {t.people.length > 0 && <p className="geo-people">Posted here: {t.people.map((p, i) => <span key={p.id}>{i ? ', ' : ''}<Link className="cell-link" to={`/team/${p.id}`}>{p.name}</Link></span>)}</p>}
                            {t.areas.length === 0 ? <p className="block-empty">No areas yet. Clients are added against an area.</p> : (
                              <ul className="org-list">
                                {t.areas.map(a => (
                                  <li key={a.id} className="org-node">
                                    <div className="org-row geo-row">
                                      <span className="org-toggle" aria-hidden="true" />
                                      <span className="org-who"><span>{a.name}</span><span className="cell-sub">{[count(a.clients, 'client'), a.clusters.length ? a.clusters.map(c => `${c.name} (${c.clients})`).join(', ') : 'no clusters'].join(' · ')}</span></span>
                                      <span className="row-actions">
                                        <button type="button" className="link" onClick={() => setAdding({ level: 'cluster', parent: a.id, under: a.name })}>Add a cluster</button>
                                        {a.clusters.map(c => <button key={c.id} type="button" className="link danger-link" onClick={() => setRemoving({ level: 'cluster', id: c.id, name: c.name })}>Remove {c.name}</button>)}
                                        <button type="button" className="link danger-link" onClick={() => setRemoving({ level: 'area', id: a.id, name: a.name })}>Remove</button>
                                      </span>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </Arrive>
      )}
      <AddPlace adding={adding} onClose={() => setAdding(null)} onDone={m => { setAdding(null); done(m); }} />
      <Confirm open={Boolean(removing)} danger busy={busy} error={problem} title={`Remove ${removing?.name ?? ''}?`} confirmLabel={`Remove the ${removing?.level ?? ''}`}
        onCancel={() => { setRemoving(null); setProblem(''); }} onConfirm={() => void remove()}>
        A {removing?.level} that clients, people or plans still name cannot be removed; the database says what still names it. Nothing else changes.
      </Confirm>
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

function AddPlace({ adding, onClose, onDone }: { adding: Adding | null; onClose: () => void; onDone: (m: string) => void }) {
  const [name, setName] = useState('');
  const [hq, setHq] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { if (adding) { setName(''); setHq(''); setProblem(''); setAttempt(0); } }, [adding]);
  const level = adding?.level ?? 'region';
  const errors = { name: name.trim().length < 2 ? `Name the ${level}.` : undefined };
  const formRef = useFocusFirstError(errors, attempt);
  const save = async () => {
    setAttempt(a => a + 1);
    if (!adding || errors.name) return;
    setBusy(true);
    setProblem('');
    try {
      if (adding.level === 'region') await createRegion(name.trim());
      else if (adding.level === 'territory') await createTerritory(adding.parent, name.trim(), hq.trim() || name.trim());
      else if (adding.level === 'area') await createArea(adding.parent, name.trim());
      else await createCluster(adding.parent, name.trim());
      onDone(`${name.trim()} is added${adding.level === 'region' ? '' : ` to ${adding.under}`}.`);
    } catch (e) {
      setProblem(msg(e));
    } finally {
      setBusy(false);
    }
  };
  const title = adding?.level === 'region' ? 'Add a region' : adding ? `Add ${adding.level === 'area' ? 'an' : 'a'} ${adding.level} to ${adding.under}` : '';
  return (
    <Drawer open={Boolean(adding)} onClose={onClose} title={title}
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Adding…' : `Add the ${level}`}</button></>}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        <Field label="Name" error={attempt ? errors.name : undefined}>{x => <input {...x} className="input" value={name} onChange={e => setName(e.target.value)} />}</Field>
        {level === 'territory' && <Field label="Headquarters" optional help="The town people posted here start from. The territory's name, if left empty.">{x => <input {...x} className="input" value={hq} onChange={e => setHq(e.target.value)} />}</Field>}
        {problem && <p className="form-error" role="alert">It was not added. {problem}</p>}
      </form>
    </Drawer>
  );
}

// ── roles ─────────────────────────────────────────────────────────────

/** Roles: what the company calls its people, and which app each role opens. */
export function Roles() {
  const r = useResource<Role[]>('settings:roles', loadRoles);
  if (r.status === 'error' && !r.data) return <LoadError what="Your roles" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading your roles" lines={1} />;
  return <RolesView list={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function RolesView({ list, at, error, reload }: { list: Role[]; at: Date | null; error: string; reload: () => void }) {
  const [edit, setEdit] = useState<Role | 'new' | null>(null);
  const [ask, setAsk] = useState<{ r: Role; act: 'retire' | 'back' | 'delete' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const active = list.filter(r => r.active);
  const done = (m: string) => { setNotice(m); invalidate('settings:roles', 'team:'); };
  const act = async () => {
    if (!ask) return;
    setBusy(true);
    setProblem('');
    try {
      done(ask.act === 'delete' ? await deleteRole(ask.r.id) : await setRoleActive(ask.r.id, ask.act === 'back'));
      setAsk(null);
    } catch (e) {
      setProblem(msg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read the roles again" />}>
        {list.length === 0 ? 'No roles yet.' : <><strong>{count(active.length, 'role')} offered</strong>: {count(active.filter(r => r.app === 'field').length, 'opens', 'open')} the field app and {active.filter(r => r.app === 'manager').length} the manager app.{list.length > active.length ? ` ${count(list.length - active.length, 'role is', 'roles are')} retired.` : ''}</>}
      </Summary>
      <Toolbar><button type="button" className="btn btn-primary btn-small" onClick={() => setEdit('new')}><Plus size={14} weight="bold" aria-hidden="true" /> Add a role</button></Toolbar>
      {list.length === 0 ? <Empty title="No roles yet">Name the roles your company uses, such as Medical Representative or Area Sales Manager; everyone is added against one.</Empty> : (
        <Arrive>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Role</th><th scope="col">Opens</th><th scope="col" className="num">People</th><th scope="col">Status</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr></thead>
              <tbody>
                {list.map(r => (
                  <tr key={r.id}>
                    <th scope="row">{r.name}<span className="cell-sub">{r.short}</span></th>
                    <td>{r.app === 'manager' ? 'The manager app' : 'The field app'}</td>
                    <td className="num">{r.holders}</td>
                    <td>{r.active ? 'Offered' : <span className="cell-quiet">Retired</span>}</td>
                    <td className="row-action"><span className="row-actions">
                      <button type="button" className="link" onClick={() => setEdit(r)}>Edit</button>
                      {r.active ? <button type="button" className="link" onClick={() => setAsk({ r, act: 'retire' })}>Retire</button> : <button type="button" className="link" onClick={() => setAsk({ r, act: 'back' })}>Offer again</button>}
                      {r.holders === 0 && <button type="button" className="link danger-link" onClick={() => setAsk({ r, act: 'delete' })}>Delete</button>}
                    </span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Arrive>
      )}
      <RoleDrawer open={edit != null} role={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onDone={m => { setEdit(null); done(m); }} />
      <Confirm open={Boolean(ask)} danger={ask?.act === 'delete'} busy={busy} error={problem}
        title={ask?.act === 'delete' ? `Delete ${ask.r.name}?` : ask?.act === 'retire' ? `Retire ${ask.r.name}?` : `Offer ${ask?.r.name ?? ''} again?`}
        confirmLabel={ask?.act === 'delete' ? 'Delete the role' : ask?.act === 'retire' ? 'Retire the role' : 'Offer it again'} onCancel={() => { setAsk(null); setProblem(''); }} onConfirm={() => void act()}>
        {ask?.act === 'delete' ? 'Nobody holds it, so it leaves the list for good.' : ask?.act === 'retire' ? `It is no longer offered when you add somebody${ask.r.holders ? `; the ${count(ask.r.holders, 'person', 'people')} who hold it keep it` : ''}.` : 'It is offered again when you add somebody.'}
      </Confirm>
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

function RoleDrawer({ open, role, onClose, onDone }: { open: boolean; role: Role | null; onClose: () => void; onDone: (m: string) => void }) {
  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  const [app, setApp] = useState<'field' | 'manager'>('field');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { if (open) { setName(role?.name ?? ''); setShort(role?.short ?? ''); setApp(role?.app ?? 'field'); setProblem(''); setAttempt(0); } }, [open, role]);
  const errors = { name: name.trim().length < 2 ? 'Name the role; it is what your team sees on the phone.' : undefined, short: short.trim().length > 6 ? 'Six letters at most.' : undefined };
  const formRef = useFocusFirstError(errors, attempt);
  const save = async () => {
    setAttempt(a => a + 1);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setProblem('');
    try {
      if (role) await updateRole(role.id, name.trim(), app, short);
      else await createRole(name.trim(), app, short);
      onDone(role ? `${name.trim()} is saved.` : `${name.trim()} is offered when you add somebody.`);
    } catch (e) {
      setProblem(msg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} title={role ? `Edit ${role.name}` : 'Add a role'} sub="The role decides which app a person opens: the field app plans the day and logs calls; the manager app also approves a team."
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : role ? 'Save the role' : 'Add the role'}</button></>}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        <Field label="Name" error={attempt ? errors.name : undefined}>{x => <input {...x} className="input" value={name} placeholder="Territory Business Manager" onChange={e => setName(e.target.value)} />}</Field>
        <Field label="Short name" optional help="Up to six letters, shown beside names. Made from the initials if left empty." error={attempt ? errors.short : undefined}>{x => <input {...x} className="input" value={short} placeholder="TBM" onChange={e => setShort(e.target.value.toUpperCase())} />}</Field>
        <div className="field-block">
          <p className="form-label">Opens</p>
          <Segmented label="Opens" value={app} onChange={setApp} options={[{ value: 'field', label: 'The field app' }, { value: 'manager', label: 'The manager app' }]} />
          {role && role.holders > 0 && role.app !== app && <p className="form-note">{count(role.holders, 'person', 'people')} hold this role; they open the {app} app the next time they sign in.</p>}
        </div>
        {problem && <p className="form-error" role="alert">It was not saved. {problem}</p>}
      </form>
    </Drawer>
  );
}

// ── logins and access ─────────────────────────────────────────────────

const loginState = (l: Login | null) => !l ? { word: 'No login', tone: 'warning' as const }
  : l.status === 'suspended' ? { word: 'Switched off', tone: 'neutral' as const }
  : l.mustChange ? { word: 'Must choose a password', tone: 'warning' as const }
  : { word: 'Can sign in', tone: 'good' as const };

/** Logins and access: a phone login for each person on the roster, and the office's own logins. */
export function Logins() {
  const r = useResource<LoginsModel>('settings:logins', loadLogins);
  if (r.status === 'error' && !r.data) return <LoadError what="The logins" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading the logins" lines={1} />;
  return <LoginsView m={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function LoginsView({ m, at, error, reload }: { m: LoginsModel; at: Date | null; error: string; reload: () => void }) {
  const me = useMe();
  const loc = useLocation();
  const nav = useNavigate();
  const may = mayManageLogins(me.role);
  const [tab, setTab] = useState<'phone' | 'office'>(loc.pathname.endsWith('/invite') ? 'office' : 'phone');
  const [q, setQ] = useState('');
  const [giving, setGiving] = useState<PhoneRow | null>(null);
  const [inviting, setInviting] = useState(loc.pathname.endsWith('/invite'));
  const [switching, setSwitching] = useState<{ l: Login; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const able = m.phones.filter(p => p.login?.status === 'active');
  const none = m.phones.filter(p => !p.login && !p.office);
  const must = m.phones.filter(p => p.login?.mustChange && p.login.status === 'active');
  const phones = m.phones.filter(p => !q.trim() || `${p.name} ${p.code} ${p.hq}`.toLowerCase().includes(q.trim().toLowerCase()));
  const office = m.office.filter(o => !q.trim() || `${o.email} ${o.name} ${o.role}`.toLowerCase().includes(q.trim().toLowerCase()));
  const { shown, more } = useShowMore(phones, 50);
  const done = (t: string) => { setNotice(t); invalidate('settings:logins', 'team:', 'home:'); };
  const grantable = GRANTABLE[me.role as OfficeRole] ?? [];
  const closeInvite = () => { setInviting(false); if (loc.pathname.endsWith('/invite')) nav('/settings/logins', { replace: true }); };
  const flip = async (reason: string) => {
    if (!switching) return;
    setBusy(true);
    setProblem('');
    const next = switching.l.status === 'active' ? 'suspended' : 'active';
    try {
      await setLoginStatus(switching.l.id, next, reason);
      done(next === 'suspended' ? `${switching.name}'s login is switched off; they are signed out at their next sync.` : `${switching.name} can sign in again with the password they have.`);
      setSwitching(null);
    } catch (e) {
      setProblem(msg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read the logins again" />}>
        <strong>{able.length} of {count(m.phones.length, 'person', 'people')}</strong> can sign in on the phone.
        {none.length ? <> <span className="warn-text">{count(none.length, 'person has', 'people have')} no login yet.</span></> : ''}
        {must.length ? ` ${count(must.length, 'person', 'people')} must still choose a password.` : ''} {count(m.office.filter(o => o.status === 'active').length, 'office login')}.
      </Summary>
      {!may && <p className="form-note">Only an owner, admin or HR gives out logins, as the database allows. They are listed here so you can see who has one.</p>}
      <Toolbar>
        <Segmented label="Show" value={tab} onChange={setTab} options={[{ value: 'phone', label: 'Phone logins', count: m.phones.length }, { value: 'office', label: 'Office logins', count: m.office.length }]} />
        <SearchBox value={q} onChange={setQ} placeholder={tab === 'phone' ? 'Name, code or HQ' : 'Email, name or role'} label="Find a login" />
        {may && tab === 'office' && grantable.length > 0 && <button type="button" className="btn btn-primary btn-small" onClick={() => setInviting(true)}><Plus size={14} weight="bold" aria-hidden="true" /> Invite an office user</button>}
      </Toolbar>
      <Arrive>
        {tab === 'phone' ? (
          phones.length === 0 ? <Empty title={m.phones.length ? 'Nobody matches' : 'Nobody on the roster yet'}>{m.phones.length ? 'Try another name.' : <>Add people first; <Link className="link" to="/team/new">add a person</Link>.</>}</Empty> : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th scope="col">Person</th><th scope="col" className="hide-narrow">Email for the login</th><th scope="col">Login</th>{may && <th scope="col"><span className="visually-hidden">Actions</span></th>}</tr></thead>
                  <tbody>
                    {shown.map(p => {
                      const st = !p.login && p.office ? { word: `Office login, ${ROLE_LABEL[p.office as OfficeRole] ?? p.office}`, tone: 'neutral' as const } : loginState(p.login);
                      return (
                        <tr key={p.id}>
                          <th scope="row"><Link className="cell-link" to={`/team/${p.id}`}>{p.name}</Link><span className="cell-sub">{[p.code, p.designation, p.hq].filter(Boolean).join(' · ')}</span></th>
                          <td className="hide-narrow">{p.email ?? <span className="warn-text">None on the record</span>}</td>
                          <td><Pill tone={st.tone}>{st.word}</Pill></td>
                          {may && <td className="row-action"><span className="row-actions">
                            {(!p.login || p.login.status === 'active') && <button type="button" className="link" onClick={() => setGiving(p)}>{p.login ? 'Reset the password' : 'Give a phone login'}</button>}
                            {p.login && <button type="button" className={`link${p.login.status === 'active' ? ' danger-link' : ''}`} onClick={() => setSwitching({ l: p.login!, name: p.name })}>{p.login.status === 'active' ? 'Switch off' : 'Switch on'}</button>}
                          </span></td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {more}
            </>
          )
        ) : office.length === 0 ? <Empty title="No office logins match">Invite the people in the office who need the console: HR, finance, IT and management.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Login</th><th scope="col">Role</th><th scope="col">State</th>{may && <th scope="col"><span className="visually-hidden">Actions</span></th>}</tr></thead>
              <tbody>
                {office.map(o => {
                  const st = loginState(o);
                  const mine = o.userId === me.userId;
                  const allowed = may && !mine && grantable.includes(o.role as OfficeRole);
                  return (
                    <tr key={o.id}>
                      <th scope="row">{o.email || 'No email'}<span className="cell-sub">{[o.name, mine && 'you'].filter(Boolean).join(' · ')}</span></th>
                      <td>{ROLE_LABEL[o.role as OfficeRole] ?? o.role}</td>
                      <td><Pill tone={st.tone}>{st.word}</Pill>{o.invitedAt && o.mustChange && <span className="cell-sub">invited {ago(o.invitedAt)}</span>}</td>
                      {may && <td className="row-action">{allowed ? <button type="button" className={`link${o.status === 'active' ? ' danger-link' : ''}`} onClick={() => setSwitching({ l: o, name: o.email })}>{o.status === 'active' ? 'Switch off' : 'Switch on'}</button> : <span className="cell-quiet">{mine ? 'Your own' : 'Not yours to change'}</span>}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Arrive>
      <PhoneLoginDrawer p={giving} onClose={() => setGiving(null)} onDone={t => { setGiving(null); done(t); }} />
      <InviteDrawer open={inviting} roles={grantable} people={m.phones} onClose={closeInvite} onDone={t => { closeInvite(); done(t); }} />
      <Confirm open={Boolean(switching)} danger={switching?.l.status === 'active'} busy={busy} error={problem}
        title={switching?.l.status === 'active' ? `Switch off ${switching.name}'s login?` : `Switch ${switching?.name ?? ''}'s login back on?`}
        confirmLabel={switching?.l.status === 'active' ? 'Switch the login off' : 'Switch it back on'}
        reason={{ label: 'Why', required: true, placeholder: switching?.l.status === 'active' ? 'For example: phone lost; a new one is on its way.' : 'For example: the new phone has arrived.' }}
        onCancel={() => { setSwitching(null); setProblem(''); }} onConfirm={reason => void flip(reason)}>
        {switching?.l.status === 'active' ? 'They cannot sign in until it is switched back on. Their records stay as they are.' : 'They sign in with the password they already have.'}
      </Confirm>
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

function PhoneLoginDrawer({ p, onClose, onDone }: { p: PhoneRow | null; onClose: () => void; onDone: (m: string) => void }) {
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { if (p) { setPw(''); setAgain(''); setProblem(''); setAttempt(0); } }, [p]);
  const errors = { pw: pw.length < 8 ? 'At least 8 characters.' : undefined, again: again !== pw ? 'The two passwords do not match.' : undefined };
  const formRef = useFocusFirstError(errors, attempt);
  const save = async () => {
    setAttempt(a => a + 1);
    if (!p || Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setProblem('');
    try {
      onDone(await givePhoneLogin(p, pw));
    } catch (e) {
      setProblem(msg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={Boolean(p)} onClose={onClose} title={p?.login ? `Reset ${p.name}'s password` : `Give ${p?.name ?? ''} a phone login`}
      sub={`They sign in with the company code and their employee ID${p?.code ? `, ${p.code}` : ''}, and must choose their own password the first time.`}
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : p?.login ? 'Reset the password' : 'Give the login'}</button></>}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        <Field label="Starting password" error={attempt ? errors.pw : undefined}>{x => <input {...x} type="password" autoComplete="new-password" className="input" value={pw} onChange={e => setPw(e.target.value)} />}</Field>
        <Field label="The same again" error={attempt ? errors.again : undefined}>{x => <input {...x} type="password" autoComplete="new-password" className="input" value={again} onChange={e => setAgain(e.target.value)} />}</Field>
        <p className="form-note">{p?.email ? `A link to choose their own password is emailed to ${p.email}.` : 'There is no email on their record, so tell them the starting password yourself.'}</p>
        {problem && <p className="form-error" role="alert">It was not saved. {problem}</p>}
      </form>
    </Drawer>
  );
}

function InviteDrawer({ open, roles, people, onClose, onDone }: { open: boolean; roles: OfficeRole[]; people: PhoneRow[]; onClose: () => void; onDone: (m: string) => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OfficeRole | ''>('');
  const [who, setWho] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { if (open) { setEmail(''); setRole(''); setWho(''); setProblem(''); setAttempt(0); } }, [open]);
  const errors = { email: !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) ? 'Write their work email.' : undefined, role: !role ? 'Choose what they may open.' : undefined };
  const formRef = useFocusFirstError(errors, attempt);
  const save = async () => {
    setAttempt(a => a + 1);
    if (!role || Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setProblem('');
    try {
      await inviteOffice(email, role, who || null);
      onDone(`An invitation is on its way to ${email.trim()}, as ${ROLE_LABEL[role]}.`);
    } catch (e) {
      setProblem(msg(e));
    } finally {
      setBusy(false);
    }
  };
  const ROLE_ABOUT: Record<OfficeRole, string> = {
    owner: 'Everything.', admin: 'Everything but plan and billing.', hr: 'People, leave, documents, payroll and HR rules.',
    it: 'Logins, roles and the audit log.', finance: 'Claims, payroll, sales and billing.', management: 'The field, clients and sales, for their own team.',
  };
  return (
    <Drawer open={open} onClose={onClose} title="Invite an office user" sub="They get an email with a link to set their password. What they may open follows from the role."
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Inviting…' : 'Send the invitation'}</button></>}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        <Field label="Work email" error={attempt ? errors.email : undefined}>{x => <input {...x} type="email" autoComplete="off" className="input" value={email} onChange={e => setEmail(e.target.value)} />}</Field>
        <Field label="Role" error={attempt ? errors.role : undefined} help={role ? ROLE_ABOUT[role] : 'You may invite only the roles your own role may hand out.'}>{x => (
          <select {...x} className="input" value={role} onChange={e => setRole(e.target.value as OfficeRole)}><option value="">Choose a role</option>{roles.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
        )}</Field>
        <Field label="Linked to a person on the roster" optional help="For management: the person whose team they see.">{x => (
          <select {...x} className="input" value={who} onChange={e => setWho(e.target.value)}><option value="">Nobody</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        )}</Field>
        {problem && <p className="form-error" role="alert">The invitation was not sent. {problem}</p>}
      </form>
    </Drawer>
  );
}
