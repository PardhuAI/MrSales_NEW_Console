import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';
import { invalidate, useResource } from '../../data/resource';
import { CATEGORY_LABEL, COMPLAINT_STATUS, loadClientRecord, loadClients, setClientListing, typeLabel, type ClientRecord as Rec, type ClientRow, type ClientsModel } from '../../live/clients';
import { VERDICT } from '../../live/field';
import { dayMonth, dayOf, longDay, timeOf } from '../../lib/days';
import { count, rupees, rupeesShort } from '../../lib/format';
import { Confirm, Notice, Pill } from '../../components/kit';
import { Empty, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useMe } from '../../live/session';
import { useCan } from '../../app/access';
import { ClientForm } from './ClientForm';
import { mayEditClients, mayShapeClients } from './ClientList';

/**
 * One client: who they are, where they stand on the list, who calls on them,
 * and everything the field recorded there: visits, orders and complaints.
 */
export function ClientRecordPage() {
  const { id = '' } = useParams();
  const list = useResource<ClientsModel>('clients:all', loadClients);
  const rec = useResource<Rec>(`clients:record:${id}`, () => loadClientRecord(id));
  if ((list.status === 'error' && !list.data) || (rec.status === 'error' && !rec.data)) {
    return <LoadError what="This client" error={list.error || rec.error} retry={() => { void list.reload(); void rec.reload(); }} />;
  }
  if (!list.data || !rec.data) return <Loading label="Reading the client" />;
  const c = list.data.clients.find(x => x.id === id);
  if (!c) return <Empty title="No such client">The link may be out of date, or this client is outside the ones you can see. <Link className="link" to="/clients">Back to all clients</Link></Empty>;
  return <View c={c} m={list.data} rec={rec.data} />;
}

const STATUS_WORD: Record<string, { word: string; tone: 'good' | 'warning' | 'neutral' | 'critical' }> = {
  completed: { word: 'Done', tone: 'good' }, missed: { word: 'Missed', tone: 'warning' }, inProgress: { word: 'Started', tone: 'warning' },
  planned: { word: 'Planned', tone: 'neutral' }, upcoming: { word: 'Planned', tone: 'neutral' },
};
const ORDER_WORD: Record<string, { word: string; tone: 'good' | 'warning' | 'neutral' | 'critical' | 'accent' }> = {
  pending: { word: 'Waiting', tone: 'accent' }, approved: { word: 'Approved', tone: 'good' }, fulfilled: { word: 'Fulfilled', tone: 'good' },
  rejected: { word: 'Rejected', tone: 'warning' }, cancelled: { word: 'Cancelled', tone: 'neutral' }, draft: { word: 'Draft', tone: 'neutral' },
};

function View({ c, m, rec }: { c: ClientRow; m: ClientsModel; rec: Rec }) {
  const me = useMe();
  const allowed = useCan();
  const nav = useNavigate();
  const loc = useLocation();
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState((loc.state as { notice?: string } | null)?.notice ?? '');
  const [ask, setAsk] = useState<null | { listing: 'listed' | 'unlisted'; active: boolean | null; label: string; body: string }>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const done = rec.visits.filter(v => v.status === 'completed');
  const retired = c.listed && c.active === false;
  const orderValue = rec.orders.filter(o => o.status !== 'rejected' && o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);

  const move = async () => {
    if (!ask) return;
    setBusy(true);
    setProblem('');
    try {
      const said = await setClientListing(c.id, ask.listing, ask.active);
      invalidate('clients:');
      setAsk(null);
      setNotice(said || 'Saved.');
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const line = done.length
    ? `${count(c.visits, 'visit')} in all. Last seen ${c.lastVisit ? dayMonth(c.lastVisit) : 'recently'}${done[0] ? ` by ${done[0].person}` : ''}.`
    : c.visits ? `${count(c.visits, 'visit')} in all, none in the recent record.` : 'Nobody has called on this client yet.';

  return (
    <div className="pday">
      <Arrive className="pday-head">
        <Link className="link back-link" to="/clients"><ArrowLeft size={13} aria-hidden="true" /> All clients</Link>
        <div className="pday-title-row">
          <div>
            <h2 className="page-title-lg">{c.name}</h2>
            <p className="pday-who">{[typeLabel(c.type), c.specialty, c.designation, c.area, c.territory].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="record-actions">
            {mayEditClients(me.role) && <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>Edit</button>}
            {mayShapeClients(me.role) && (!c.listed ? (
              <button type="button" className="btn btn-secondary" onClick={() => setAsk({ listing: 'listed', active: true, label: 'Add to the company list', body: `${c.name} goes on the company list and into targets and coverage.` })}>Add to the list</button>
            ) : retired ? (
              <button type="button" className="btn btn-secondary" onClick={() => setAsk({ listing: 'listed', active: true, label: 'Put back on the list', body: `${c.name} is called on again and counts in coverage.` })}>Put back on the list</button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={() => setAsk({ listing: 'listed', active: false, label: 'Retire the client', body: `${c.name} stays on record with every visit and order, but is no longer called on or counted in coverage.` })}>Retire</button>
            ))}
          </div>
        </div>
        <p className="pday-line">{line}</p>
        <div className="pill-row">
          {!c.listed ? <Pill>Unlisted</Pill> : retired ? <Pill>Retired</Pill> : <Pill tone="good">On the company list</Pill>}
          {CATEGORY_LABEL[c.category] && <Pill>{CATEGORY_LABEL[c.category]}</Pill>}
          {!c.hasLocation && <Pill tone="warning">No location yet</Pill>}
          {!c.ownerId && <Pill tone="warning">Nobody assigned</Pill>}
        </div>
      </Arrive>

      <div className="record-grid">
        <Arrive as="section" className="block" index={1}>
          <div className="block-head"><h3 className="section-title">Details</h3></div>
          <dl className="facts record-facts">
            <dt>Seen by</dt><dd>{c.ownerId ? (allowed('people') ? <Link className="link" to={`/team/${c.ownerId}`}>{c.owner}</Link> : c.owner) : 'Nobody yet. Assign them from the person who should take them on.'}</dd>
            <dt>Location</dt><dd>{c.hasLocation ? 'Registered, so visits here are checked against the visit radius' : 'Not yet. The next rep to call there pins it; until then visits cannot be checked.'}</dd>
            <dt>Mobile</dt><dd>{c.mobile ?? 'Not given'}</dd>
            {c.email && <><dt>Email</dt><dd>{c.email}</dd></>}
            {c.contactPerson && <><dt>Contact person</dt><dd>{c.contactPerson}</dd></>}
            <dt>Address</dt><dd>{[c.address, c.city, c.pincode].filter(Boolean).join(', ') || 'Not given'}</dd>
            {c.specialDate && <><dt>{c.specialOccasion ?? 'Occasion'}</dt><dd>{dayMonth(c.specialDate)}</dd></>}
            <dt>Next planned visit</dt><dd>{c.nextVisit ? longDay(c.nextVisit) : 'None planned'}</dd>
            <dt>On record since</dt><dd>{dayMonth(dayOf(c.createdAt))}</dd>
          </dl>
        </Arrive>

        <Arrive as="section" className="block" index={2}>
          <div className="block-head"><h3 className="section-title">Business</h3></div>
          <div className="record-figures">
            <div><span className="mf-value">{rec.orders.length}</span><span className="mf-label">{rec.orders.length === 1 ? 'order' : 'orders'}{orderValue ? `, ${rupeesShort(orderValue)}` : ''}</span></div>
            <div><span className="mf-value">{rec.sales ? rupeesShort(rec.sales) : '0'}</span><span className="mf-label">in recorded sales</span></div>
            <div><span className="mf-value">{rec.complaints.filter(x => x.status === 'open' || x.status === 'inProgress').length}</span><span className="mf-label">open complaints</span></div>
          </div>
        </Arrive>
      </div>

      <Arrive as="section" className="block" index={3}>
        <div className="block-head">
          <h3 className="section-title">Calls, latest first</h3>
          <span className="block-meta">{rec.visits.length ? count(rec.visits.length, 'call') : ''}</span>
        </div>
        {rec.visits.length === 0 ? <p className="block-empty">No visit recorded yet. Visits appear here as the field logs them.</p> : (
          <ul className="rows">
            {rec.visits.map(v => {
              const st = STATUS_WORD[v.status] ?? { word: v.status, tone: 'neutral' as const };
              const ver = v.mocked ? VERDICT.suspect : v.verdict ? VERDICT[v.verdict] : null;
              return (
                <li key={v.id} className="row">
                  <div className="row-main">
                    <p className="row-title"><Link className="cell-link" to={`/field/${v.personId}/${dayOf(v.at)}`}>{longDay(dayOf(v.at))}</Link> <span className="row-title-sub">· {timeOf(v.at)} · {v.person}</span></p>
                    {(v.purpose || v.feedback) && <p className="row-sub">{[v.purpose, v.feedback].filter(Boolean).join(' · ')}</p>}
                  </div>
                  <span className="pill-row">
                    {st.tone !== 'good' && <Pill tone={st.tone}>{st.word}</Pill>}
                    {ver && v.status === 'completed' && <Pill tone={ver.tone}>{ver.word}</Pill>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Arrive>

      <div className="record-grid">
        <Arrive as="section" className="block" index={4}>
          <div className="block-head"><h3 className="section-title">Orders</h3></div>
          {rec.orders.length === 0 ? <p className="block-empty">No orders from this client yet.</p> : (
            <ul className="rows">
              {rec.orders.map(o => (
                <li key={o.id} className="row">
                  <div className="row-main">
                    <p className="row-title">{allowed('orders') ? <Link className="cell-link" to={`/sales/orders?open=${o.id}`}>Order {o.number}</Link> : `Order ${o.number}`}</p>
                    <p className="row-sub">{[dayMonth(dayOf(o.at)), o.person, o.stockist && `from ${o.stockist}`].filter(Boolean).join(' · ')}</p>
                  </div>
                  <span className="row-figure">{rupees(o.total)} <Pill tone={(ORDER_WORD[o.status] ?? { tone: 'neutral' }).tone}>{(ORDER_WORD[o.status] ?? { word: o.status }).word}</Pill></span>
                </li>
              ))}
            </ul>
          )}
        </Arrive>
        <Arrive as="section" className="block" index={5}>
          <div className="block-head"><h3 className="section-title">Complaints</h3></div>
          {rec.complaints.length === 0 ? <p className="block-empty">No complaint has been raised about this client.</p> : (
            <ul className="rows">
              {rec.complaints.map(x => (
                <li key={x.id} className="row">
                  <div className="row-main">
                    <p className="row-title">{allowed('complaints') ? <Link className="cell-link" to={`/clients/complaints?open=${x.id}`}>{x.subject}</Link> : x.subject}</p>
                    <p className="row-sub">raised {dayMonth(dayOf(x.at))}</p>
                  </div>
                  <Pill tone={(COMPLAINT_STATUS[x.status] ?? { tone: 'neutral' }).tone}>{(COMPLAINT_STATUS[x.status] ?? { word: x.status }).word}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Arrive>
      </div>

      <ClientForm open={editing} model={m} existing={c} onClose={() => setEditing(false)} onSaved={(_, name) => { setEditing(false); invalidate('clients:', 'search:index'); setNotice(`${name} was saved.`); }} />
      <Confirm open={Boolean(ask)} title={ask?.label ?? ''} confirmLabel={ask?.label ?? ''} busy={busy} error={problem} onCancel={() => { setAsk(null); setProblem(''); }} onConfirm={() => void move()}>
        {ask?.body}
      </Confirm>
      {notice && <Notice onDone={() => { setNotice(''); nav('.', { replace: true, state: null }); }}>{notice}</Notice>}
    </div>
  );
}
