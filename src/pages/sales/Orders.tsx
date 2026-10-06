import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { invalidate, useResource } from '../../data/resource';
import { decideOrders, loadOrders, type OrderRow } from '../../live/sales';
import { approvalsStore } from '../../data/approvals';
import { dayMonth, dayOf, timeOf } from '../../lib/days';
import { count, rupees, rupeesShort } from '../../lib/format';
import { Confirm, Drawer, Filter, Notice, Pill, SearchBox, Summary, Toolbar, useShowMore } from '../../components/kit';
import { Segmented } from '../../components/Segmented';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useCan } from '../../app/access';

/**
 * Orders: what the field booked, its approval and whether it was fulfilled.
 * Approval is not delivery, so the two are shown apart: an approved order
 * the stockist has not fulfilled is a promise the rep already made.
 */

export const ORDER_STATUS: Record<string, { word: string; tone: 'good' | 'warning' | 'neutral' | 'critical' ; rank: number }> = {
  pending: { word: 'Waiting for a decision', tone: 'neutral', rank: 0 },
  approved: { word: 'Approved, not fulfilled', tone: 'warning', rank: 1 },
  fulfilled: { word: 'Fulfilled', tone: 'good', rank: 2 },
  rejected: { word: 'Rejected', tone: 'neutral', rank: 3 },
  cancelled: { word: 'Cancelled', tone: 'neutral', rank: 4 },
  draft: { word: 'Draft on the phone', tone: 'neutral', rank: 5 },
};
type Status = 'all' | 'pending' | 'approved' | 'fulfilled' | 'rejected';

export function Orders() {
  const r = useResource('sales:orders', loadOrders);
  if (r.status === 'error' && !r.data) return <LoadError what="Orders" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading orders" lines={1} />;
  return <View data={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function View({ data, at, error, reload }: { data: Awaited<ReturnType<typeof loadOrders>>; at: Date | null; error: string; reload: () => void }) {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<Status>('all');
  const [stockist, setStockist] = useState('all');
  const [q, setQ] = useState('');
  const [notice, setNotice] = useState('');
  const open = data.orders.find(o => o.id === params.get('open')) ?? null;
  const setOpen = (o: OrderRow | null) => setParams(p => { if (o) p.set('open', o.id); else p.delete('open'); return p; }, { replace: true });
  const live = data.orders.filter(o => o.status !== 'draft');
  const by = (s: string) => live.filter(o => o.status === s);
  const noStockist = live.filter(o => !o.stockistId && o.status !== 'rejected');
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return live
      .filter(o => status === 'all' || o.status === status)
      .filter(o => stockist === 'all' || (stockist === 'none' ? !o.stockistId : o.stockistId === stockist))
      .filter(o => !needle || `${o.number} ${o.client} ${o.person} ${o.stockist}`.toLowerCase().includes(needle))
      .sort((a, b) => (ORDER_STATUS[a.status]?.rank ?? 9) - (ORDER_STATUS[b.status]?.rank ?? 9) || b.at.localeCompare(a.at));
  }, [live, status, stockist, q]);
  const { shown, more } = useShowMore(rows, 50);
  const value = (l: OrderRow[]) => l.reduce((s, o) => s + o.total, 0);

  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read orders again" />}>
        {live.length === 0 ? 'No orders yet.' : <>
          {/* Orders are shown with GST; Sales counts them before it. Say which, so the two agree. */}
          <strong>{count(live.length, 'order')}</strong> worth {rupeesShort(value(live.filter(o => o.status !== 'rejected')))} with GST
          {' '}({rupeesShort(live.filter(o => o.status !== 'rejected').reduce((s, o) => s + o.subtotal, 0))} before it).
          {by('pending').length ? <> {by('pending').length} waiting for a decision ({rupeesShort(value(by('pending')))}).</> : ''}
          {by('approved').length ? <> <span className="warn-text">{count(by('approved').length, 'approved order')}</span> not yet fulfilled.</> : ''}
          {noStockist.length ? <> {count(noStockist.length, 'order names', 'orders name')} no stockist.</> : ''}
        </>}
      </Summary>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Order number, client, person or stockist" label="Find an order" />
        <Segmented label="Status" value={status} onChange={setStatus} options={[
          { value: 'all', label: 'All', count: live.length },
          { value: 'pending', label: 'Waiting', count: by('pending').length },
          { value: 'approved', label: 'Not fulfilled', count: by('approved').length },
          { value: 'fulfilled', label: 'Fulfilled', count: by('fulfilled').length },
          { value: 'rejected', label: 'Rejected', count: by('rejected').length },
        ]} />
        <Filter label="Stockist" value={stockist} onChange={setStockist} options={[{ value: 'all', label: 'Any' }, { value: 'none', label: 'None named' }, ...data.stockists.map(s => ({ value: s.id, label: s.name }))]} />
      </Toolbar>
      {live.length === 0 ? (
        <Empty title="No orders yet">Orders booked on the phone at a chemist or hospital appear here for approval.</Empty>
      ) : rows.length === 0 ? (
        <div className="list-empty"><Empty title="No orders match">Try another status, stockist or search.</Empty></div>
      ) : (
        <Arrive>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Client</th>
                  <th scope="col" className="hide-narrow">Stockist</th>
                  <th scope="col" className="num">Lines</th>
                  <th scope="col" className="num">Total</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(o => {
                  const st = ORDER_STATUS[o.status] ?? { word: o.status, tone: 'neutral' as const };
                  return (
                    <tr key={o.id} className="clickable" onClick={() => setOpen(o)}>
                      <th scope="row">
                        <button type="button" className="cell-link cell-button" aria-haspopup="dialog" onClick={e => { e.stopPropagation(); setOpen(o); }}>Order {o.number}</button>
                        <span className="cell-sub">{dayMonth(dayOf(o.at))} · {o.person}</span>
                      </th>
                      <td>{o.client}</td>
                      <td className="hide-narrow">{o.stockist || <span className="warn-text">None named</span>}</td>
                      <td className="num">{o.lines.length}</td>
                      <td className="num">{rupees(o.total)}</td>
                      <td><Pill tone={st.tone}>{st.word}</Pill></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {more}
        </Arrive>
      )}
      <OrderDrawer o={open} onClose={() => setOpen(null)} onDecided={msg => { setNotice(msg); invalidate('sales:'); void approvalsStore.load(); }} />
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

function OrderDrawer({ o, onClose, onDecided }: { o: OrderRow | null; onClose: () => void; onDecided: (m: string) => void }) {
  const allowed = useCan();
  const [ask, setAsk] = useState<'approve' | 'reject' | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const decide = async (approve: boolean, reason: string) => {
    if (!o) return;
    setBusy(true);
    setProblem('');
    try {
      await decideOrders([o.id], approve, reason);
      setAsk(null);
      onClose();
      onDecided(approve ? `Order ${o.number} is approved; ${o.person} gets a message.` : `Order ${o.number} was rejected; ${o.person} gets your reason.`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const st = o ? ORDER_STATUS[o.status] ?? { word: o.status, tone: 'neutral' as const } : null;
  const free = o?.lines.filter(l => l.free).reduce((s, l) => s + l.quantity, 0) ?? 0;
  const discountValue = o ? o.subtotal * (o.discount / 100) : 0;
  return (
    <Drawer
      open={Boolean(o)}
      onClose={onClose}
      title={o ? `Order ${o.number}` : ''}
      sub={o ? `${o.client} · ${dayMonth(dayOf(o.at))}, ${timeOf(o.at)} · ${o.person}` : ''}
      wide
      footer={o?.status === 'pending' && allowed('approvals') ? (
        <>
          <button type="button" className="btn btn-secondary" onClick={() => setAsk('reject')}>Reject</button>
          <button type="button" className="btn btn-primary" onClick={() => setAsk('approve')}>Approve the order</button>
        </>
      ) : undefined}
    >
      {o && st && (
        <>
          <div className="pill-row"><Pill tone={st.tone}>{st.word}</Pill>{!o.stockistId && <Pill tone="warning">No stockist named</Pill>}</div>
          {!o.stockistId && <p className="drawer-note">Nobody is named to supply this order. It was booked before the phone asked, so there is no route to infer; the month-end sheet lists it apart rather than guessing one.</p>}
          {o.status === 'approved' && <p className="drawer-note">Approved, and not yet marked fulfilled. The rep has already told the client it went through.</p>}
          <section className="drawer-section">
            <h3>Lines</h3>
            <div className="table-wrap">
              <table className="table table-compact">
                <thead><tr><th scope="col">Product</th><th scope="col" className="num">Quantity</th><th scope="col" className="num">Rate</th><th scope="col" className="num">Amount</th></tr></thead>
                <tbody>
                  {o.lines.map((l, i) => (
                    <tr key={i}><td>{l.product}<span className="cell-sub">{[l.sku, l.free && 'free of cost'].filter(Boolean).join(' · ')}</span></td><td className="num">{l.quantity}</td><td className="num">{rupees(l.unitPrice)}</td><td className="num">{l.free ? <span className="cell-quiet">Free</span> : rupees(l.lineTotal)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="drawer-section">
            <h3>Totals</h3>
            <dl className="facts totals">
              <dt>Subtotal</dt><dd>{rupees(o.subtotal)}</dd>
              <dt>Discount</dt><dd>{o.discount ? `${o.discount}%, ${rupees(discountValue)} off` : 'None'}</dd>
              <dt>GST</dt><dd>{rupees(o.gstAmount)}</dd>
              <dt><strong>Total</strong></dt><dd><strong>{rupees(o.total)}</strong></dd>
              {free > 0 && <><dt>Free units</dt><dd>{free}, shipped and never charged</dd></>}
              <dt>Stockist</dt><dd>{o.stockist || 'None named'}</dd>
              <dt>Client</dt><dd>{allowed('clients') ? <Link className="link" to={`/clients/${o.clientId}`}>{o.client}</Link> : o.client}</dd>
            </dl>
          </section>
          <section className="drawer-section">
            <h3>Approval</h3>
            {o.trail.filter(t => t.action !== 'applied').length === 0 ? <p className="drawer-note">{o.status === 'pending' ? 'Waiting for a decision. Rejecting needs a written reason.' : 'No decision is on record.'}</p> : (
              <ul className="rows">
                {o.trail.filter(t => t.action !== 'applied').map((t, i) => (
                  <li key={i} className="row"><div className="row-main"><p className="row-title">{t.by} {t.action} it</p>{t.reason && <p className="row-sub">“{t.reason}”</p>}</div><span className="row-meta">{dayMonth(dayOf(t.at))}</span></li>
                ))}
              </ul>
            )}
          </section>
          {problem && <p className="form-error" role="alert">{problem}</p>}
          <Confirm open={ask === 'approve'} title={`Approve order ${o.number}?`} confirmLabel="Approve the order" busy={busy} error={problem} onCancel={() => setAsk(null)} onConfirm={() => void decide(true, '')}>
            {rupees(o.total)} for {o.client}. Approving records it as sales today, and {o.person} gets a message.
          </Confirm>
          <Confirm open={ask === 'reject'} title={`Reject order ${o.number}?`} confirmLabel="Reject the order" danger busy={busy} error={problem} onCancel={() => setAsk(null)} onConfirm={reason => void decide(false, reason)}
            reason={{ label: 'Why it is rejected', required: true, placeholder: 'For example: the discount is above the slab for this stockist.' }}>
            {o.person} gets a message with your reason.
          </Confirm>
        </>
      )}
    </Drawer>
  );
}
