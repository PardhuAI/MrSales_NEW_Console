import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { invalidate, useResource } from '../../data/resource';
import { COMPLAINT_STATUS, decideComplaint, loadComplaints, type Complaint } from '../../live/clients';
import { dayMonth, dayOf, daysBetween, IST_TODAY } from '../../lib/days';
import { count } from '../../lib/format';
import { Drawer, Field, Notice, Pill, SearchBox, Summary, Toolbar } from '../../components/kit';
import { Segmented } from '../../components/Segmented';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useMe } from '../../live/session';

/**
 * Complaints: what clients raised through the field. The phone can only start
 * one; this is the only place one can be assigned, worked and closed. The
 * database lets owner, admin and HR decide them; everyone else reads.
 */

type Status = 'all' | 'open' | 'inProgress' | 'resolved' | 'closed';

export function Complaints() {
  const r = useResource('clients:complaints', loadComplaints);
  if (r.status === 'error' && !r.data) return <LoadError what="Complaints" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading complaints" lines={1} />;
  return <View data={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function View({ data, at, error, reload }: { data: Awaited<ReturnType<typeof loadComplaints>>; at: Date | null; error: string; reload: () => void }) {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<Status>('all');
  const [q, setQ] = useState('');
  const [notice, setNotice] = useState('');
  const openId = params.get('open');
  const open = data.complaints.find(c => c.id === openId) ?? null;
  const setOpen = (c: Complaint | null) => setParams(p => { if (c) p.set('open', c.id); else p.delete('open'); return p; }, { replace: true });
  const today = IST_TODAY();
  const age = (c: Complaint) => daysBetween(dayOf(c.at), today);
  const live = data.complaints.filter(c => c.status === 'open' || c.status === 'inProgress');
  const nobody = live.filter(c => !c.assignedToId);
  const by = (s: string) => data.complaints.filter(c => c.status === s).length;
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.complaints
      .filter(c => status === 'all' || c.status === status)
      .filter(c => !needle || `${c.number} ${c.subject} ${c.client} ${c.raisedBy}`.toLowerCase().includes(needle))
      .sort((a, b) => (COMPLAINT_STATUS[a.status]?.rank ?? 9) - (COMPLAINT_STATUS[b.status]?.rank ?? 9) || Number(Boolean(a.assignedToId)) - Number(Boolean(b.assignedToId)) || a.at.localeCompare(b.at));
  }, [data, status, q]);

  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read complaints again" />}>
        {data.complaints.length === 0 ? 'No complaints have been raised.' : <>
          <strong>{count(live.length, 'complaint')} open</strong>{nobody.length ? <>, <span className="warn-text">{nobody.length} with nobody working on {nobody.length === 1 ? 'it' : 'them'}</span></> : ', each with someone working on it'}.
          {live.length ? ` The oldest was raised ${count(Math.max(...live.map(age)), 'day')} ago.` : ''}
        </>}
      </Summary>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Number, subject, client or person" label="Find a complaint" />
        <Segmented label="Status" value={status} onChange={setStatus} options={[
          { value: 'all', label: 'All', count: data.complaints.length },
          { value: 'open', label: 'Open', count: by('open') },
          { value: 'inProgress', label: 'Being worked', count: by('inProgress') },
          { value: 'resolved', label: 'Resolved', count: by('resolved') },
          { value: 'closed', label: 'Closed', count: by('closed') },
        ]} />
      </Toolbar>
      {data.complaints.length === 0 ? (
        <Empty title="No complaints">Complaints raised on the phone at a clinic appear here, to be assigned and worked.</Empty>
      ) : rows.length === 0 ? (
        <div className="list-empty"><Empty title="No complaints match">Try another status or search.</Empty></div>
      ) : (
        <Arrive>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Complaint</th>
                  <th scope="col">Client</th>
                  <th scope="col">Working on it</th>
                  <th scope="col" className="num">Age</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(c => {
                  const st = COMPLAINT_STATUS[c.status] ?? { word: c.status, tone: 'neutral' as const };
                  return (
                    <tr key={c.id} className="clickable" onClick={() => setOpen(c)}>
                      <th scope="row">
                        <button type="button" className="cell-link cell-button" aria-haspopup="dialog" onClick={e => { e.stopPropagation(); setOpen(c); }}>{c.subject}</button>
                        <span className="cell-sub">{c.number} · raised by {c.raisedBy}</span>
                      </th>
                      <td>{c.client}<span className="cell-sub">{c.area}</span></td>
                      <td>{c.assignedToId ? c.assignedTo : (c.status === 'open' || c.status === 'inProgress') ? <Pill tone="warning">Nobody</Pill> : <span className="cell-quiet">Nobody</span>}</td>
                      <td className="num">{count(age(c), 'day')}</td>
                      <td><Pill tone={st.tone}>{st.word}</Pill></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Arrive>
      )}
      <ComplaintDrawer c={open} people={data.people} onClose={() => setOpen(null)} onDone={msg => { setNotice(msg); invalidate('clients:complaints', 'clients:record:'); }} />
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

function ComplaintDrawer({ c, people, onClose, onDone }: { c: Complaint | null; people: { id: string; name: string }[]; onClose: () => void; onDone: (m: string) => void }) {
  const me = useMe();
  const nav = useNavigate();
  const mayDecide = ['owner', 'admin', 'hr'].includes(me.role);
  const [assignee, setAssignee] = useState('');
  const [resolution, setResolution] = useState('');
  const [resolving, setResolving] = useState(false);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => {
    setAssignee(c?.assignedToId ?? '');
    setResolution(c?.resolution ?? '');
    setResolving(false);
    setProblem('');
    setTried(false);
  }, [c?.id]);
  if (!c) return <Drawer open={false} onClose={onClose} title="">{null}</Drawer>;
  const st = COMPLAINT_STATUS[c.status] ?? { word: c.status, tone: 'neutral' as const };
  const act = async (key: string, status: 'open' | 'inProgress' | 'resolved' | 'closed', opts: { assignedTo?: string | null; resolution?: string | null }, said: string) => {
    setBusy(key);
    setProblem('');
    try {
      await decideComplaint(c.id, status, opts);
      onDone(said);
      onClose();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };
  const working = c.status === 'open' || c.status === 'inProgress';

  return (
    <Drawer
      open
      onClose={onClose}
      title={c.subject}
      sub={`${c.number} · ${c.client}${c.area && !c.client.includes(c.area) ? `, ${c.area}` : ''}`}
      footer={mayDecide ? (
        working ? (
          resolving ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setResolving(false)}>Back</button>
              <button type="button" className="btn btn-primary" disabled={busy !== ''} onClick={() => { setTried(true); if (resolution.trim().length >= 3) void act('resolve', 'resolved', { resolution: resolution.trim() }, `${c.number} is resolved; ${c.raisedBy} can read what was done.`); }}>{busy === 'resolve' ? 'Saving…' : 'Mark resolved'}</button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setResolving(true)}>Resolve</button>
              <button type="button" className="btn btn-primary" disabled={!assignee || busy !== '' || (assignee === c.assignedToId && c.status === 'inProgress')} onClick={() => void act('assign', 'inProgress', { assignedTo: assignee }, `${c.number} is with ${people.find(p => p.id === assignee)?.name ?? 'them'} now.`)}>
                {busy === 'assign' ? 'Saving…' : c.assignedToId ? 'Hand it over' : 'Assign and start'}
              </button>
            </>
          )
        ) : c.status === 'resolved' ? (
          <>
            <button type="button" className="btn btn-secondary" disabled={busy !== ''} onClick={() => void act('reopen', 'inProgress', {}, `${c.number} is open again.`)}>Reopen</button>
            <button type="button" className="btn btn-primary" disabled={busy !== ''} onClick={() => void act('close', 'closed', {}, `${c.number} is closed.`)}>{busy === 'close' ? 'Saving…' : 'Close it'}</button>
          </>
        ) : (
          <button type="button" className="btn btn-secondary" disabled={busy !== ''} onClick={() => void act('reopen', 'inProgress', {}, `${c.number} is open again.`)}>Reopen</button>
        )
      ) : undefined}
    >
      <div className="pill-row"><Pill tone={st.tone}>{st.word}</Pill></div>
      <section className="drawer-section">
        <h3>What was reported</h3>
        <p className="drawer-copy">{c.body}</p>
        <dl className="facts">
          <dt>Raised</dt><dd>{dayMonth(dayOf(c.at))} by {c.raisedBy}</dd>
          <dt>Client</dt><dd>{c.clientId ? <Link className="link" to={`/clients/${c.clientId}`} onClick={() => nav(`/clients/${c.clientId}`)}>{c.client}</Link> : c.client}</dd>
          <dt>Working on it</dt><dd>{c.assignedToId ? c.assignedTo : 'Nobody yet'}</dd>
          {c.attachments.length > 0 && <><dt>Photos</dt><dd>{count(c.attachments.length, 'photo')} taken on the phone</dd></>}
        </dl>
      </section>
      {c.resolution && !resolving && (
        <section className="drawer-section"><h3>What was done</h3><p className="drawer-copy">{c.resolution}</p></section>
      )}
      {mayDecide && working && !resolving && (
        <section className="drawer-section">
          <h3>Who works on it</h3>
          <Field label="Person" help="They see it on their phone, and it stays with them until it is resolved.">{p => (
            <select {...p} className="input" value={assignee} onChange={e => setAssignee(e.target.value)}>
              <option value="">Choose someone</option>
              {people.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}</Field>
        </section>
      )}
      {mayDecide && resolving && (
        <section className="drawer-section">
          <h3>Resolve it</h3>
          <Field label="What was done about it" error={tried && resolution.trim().length < 3 ? 'Write what was done; the rep who raised it reads this.' : undefined} help={'The rep who raised it reads this. “Sorted” tells them nothing.'}>{p => (
            <textarea {...p} className="input textarea" rows={4} value={resolution} onChange={e => setResolution(e.target.value)} />
          )}</Field>
        </section>
      )}
      {!mayDecide && <p className="drawer-note">Owner, admin and HR logins assign and resolve complaints. You can read them here.</p>}
      {problem && <p className="form-error" role="alert">That was not saved. {problem}</p>}
    </Drawer>
  );
}
