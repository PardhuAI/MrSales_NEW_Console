import { useEffect, useMemo, useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import { invalidate, useResource } from '../../data/resource';
import { loadStock, recordStock, type Batch } from '../../live/sales';
import { IST_TODAY, dayMonth, shiftDay } from '../../lib/days';
import { count, rupees, rupeesShort } from '../../lib/format';
import { Drawer, Field, Notice, Pill, SearchBox, Summary, Toolbar, useFocusFirstError } from '../../components/kit';
import { Segmented } from '../../components/Segmented';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useMe } from '../../live/session';

/**
 * Stock: batches in the market, what they are worth at the stockist price,
 * and how much of that is close to expiry. Stock arriving is recorded here;
 * a negative figure writes it off, and a batch can never go below zero.
 */
export function Stock() {
  const r = useResource('sales:stock', loadStock);
  if (r.status === 'error' && !r.data) return <LoadError what="Stock" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading stock" lines={1} />;
  return <View data={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

const RISK_DAYS = 90;

function View({ data, at, error, reload }: { data: Awaited<ReturnType<typeof loadStock>>; at: Date | null; error: string; reload: () => void }) {
  const me = useMe();
  const may = ['owner', 'admin', 'management'].includes(me.role);
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'all' | 'risk'>('all');
  const [open, setOpen] = useState<Batch | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  const live = data.batches.filter(b => b.quantity > 0);
  const value = (l: Batch[]) => l.reduce((s, b) => s + b.quantity * (b.pts ?? 0), 0);
  const risk = live.filter(b => b.daysLeft != null && b.daysLeft <= RISK_DAYS);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return live.filter(b => (show === 'all' || (b.daysLeft != null && b.daysLeft <= RISK_DAYS)) && (!n || `${b.product} ${b.sku} ${b.batch}`.toLowerCase().includes(n)));
  }, [live, show, q]);
  const units = live.reduce((s, b) => s + b.quantity, 0);

  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read stock again" />}>
        {live.length === 0 ? 'No stock is recorded.' : <><strong>{count(live.length, 'batch', 'batches')}</strong>, {units.toLocaleString('en-IN')} units worth {rupeesShort(value(live))} at the stockist price.
          {risk.length ? <> <span className="warn-text">{rupeesShort(value(risk))}</span> of it, in {count(risk.length, 'batch', 'batches')}, expires within {RISK_DAYS} days.</> : ` Nothing expires within ${RISK_DAYS} days.`}</>}
      </Summary>
      <Toolbar>
        {may && <button type="button" className="btn btn-primary btn-small" onClick={() => setOpen('new')}><Plus size={14} weight="bold" aria-hidden="true" /> Record stock</button>}
        <SearchBox value={q} onChange={setQ} placeholder="Product, code or batch" label="Find a batch" />
        <Segmented label="Show" value={show} onChange={setShow} options={[{ value: 'all', label: 'Every batch', count: live.length }, { value: 'risk', label: `Expiring in ${RISK_DAYS} days`, count: risk.length }]} />
      </Toolbar>
      {live.length === 0 ? (
        <Empty title="No stock recorded">Record each batch as it arrives: product, batch number, expiry and quantity.</Empty>
      ) : rows.length === 0 ? (
        <div className="list-empty"><Empty title="No batches match">Try another search.</Empty></div>
      ) : (
        <Arrive>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Product</th><th scope="col">Batch</th><th scope="col">Expires</th><th scope="col" className="num">Units</th><th scope="col" className="num">Value</th>{may && <th scope="col"><span className="visually-hidden">Actions</span></th>}</tr></thead>
              <tbody>
                {rows.map(b => (
                  <tr key={b.id}>
                    <th scope="row"><span className="cell-main">{b.product}</span><span className="cell-sub">{b.sku}</span></th>
                    <td>{b.batch}</td>
                    <td>{b.expiry ? dayMonth(b.expiry) + ` ${b.expiry.slice(0, 4)}` : <span className="cell-quiet">Not given</span>}{b.daysLeft != null && b.daysLeft <= RISK_DAYS && <> <Pill tone={b.daysLeft <= 30 ? 'critical' : 'warning'}>{b.daysLeft <= 0 ? 'Expired' : `In ${count(b.daysLeft, 'day')}`}</Pill></>}</td>
                    <td className="num">{b.quantity.toLocaleString('en-IN')}</td>
                    <td className="num">{b.pts != null ? rupees(b.quantity * b.pts) : <span className="cell-quiet">No price</span>}</td>
                    {may && <td className="row-action"><button type="button" className="link" onClick={() => setOpen(b)}>Change</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Arrive>
      )}
      <RecordDrawer open={open} products={data.products} onClose={() => setOpen(null)} onDone={m => { setNotice(m); invalidate('sales:stock'); }} />
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

function RecordDrawer({ open, products, onClose, onDone }: { open: Batch | 'new' | null; products: { id: string; name: string; sku: string; status: string }[]; onClose: () => void; onDone: (m: string) => void }) {
  const b = open && open !== 'new' ? open : null;
  const [mode, setMode] = useState<'in' | 'off'>('in');
  const [f, setF] = useState({ product: '', batch: '', expiry: '', qty: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  const tomorrow = shiftDay(IST_TODAY(), 1);
  useEffect(() => {
    if (!open) return;
    setMode('in');
    setF(b ? { product: b.productId, batch: b.batch, expiry: b.expiry ?? '', qty: '' } : { product: products.find(p => p.status === 'active')?.id ?? '', batch: '', expiry: '', qty: '' });
    setProblem('');
    setAttempt(0);
  }, [open, b, products]);
  const n = Number(f.qty.replace(/[,\s]/g, ''));
  const errors = {
    product: !f.product ? 'Choose the product.' : undefined,
    batch: !f.batch.trim() ? 'Write the batch number from the pack.' : undefined,
    expiry: !f.expiry ? 'Write the expiry date from the pack.' : f.expiry < tomorrow ? 'A batch that has expired is not stock.' : undefined,
    qty: !(Number.isInteger(n) && n > 0) ? 'Write how many units, as a whole number.' : b && mode === 'off' && n > b.quantity ? `Only ${b.quantity.toLocaleString('en-IN')} units are in this batch.` : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);
  const formRef = useFocusFirstError(errors, attempt);
  const shown = (k: keyof typeof errors) => (attempt ? errors[k] : undefined);
  const save = async () => {
    setAttempt(a => a + 1);
    if (invalid) return;
    setBusy(true);
    setProblem('');
    try {
      await recordStock(f.product, f.batch.trim(), f.expiry, mode === 'off' ? -n : n);
      const name = products.find(p => p.id === f.product)?.name ?? 'the product';
      onDone(mode === 'off' ? `${n.toLocaleString('en-IN')} units of ${name}, batch ${f.batch.trim().toUpperCase()}, written off.` : `${n.toLocaleString('en-IN')} units of ${name}, batch ${f.batch.trim().toUpperCase()}, recorded.`);
      onClose();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={Boolean(open)} onClose={onClose} title={b ? `${b.product}, batch ${b.batch}` : 'Record stock'} sub={b ? `${b.quantity.toLocaleString('en-IN')} units in this batch` : 'A batch arriving. The same batch arriving again adds to it.'}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className={`btn ${mode === 'off' ? 'btn-danger' : 'btn-primary'}`} disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : mode === 'off' ? 'Write off' : 'Record the stock'}</button>
        </>
      )}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        {b && <Segmented label="What happened" value={mode} onChange={setMode} options={[{ value: 'in', label: 'More arrived' }, { value: 'off', label: 'Write some off' }]} />}
        {!b && (
          <Field label="Product" error={shown('product')}>{x => (
            <select {...x} className="input" value={f.product} onChange={e => setF(v => ({ ...v, product: e.target.value }))}>
              {products.filter(p => p.status !== 'retired').map(p => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}
            </select>
          )}</Field>
        )}
        <div className="form-row">
          <Field label="Batch number" error={shown('batch')}>{x => <input {...x} className="input" value={f.batch} readOnly={Boolean(b)} onChange={e => setF(v => ({ ...v, batch: e.target.value }))} />}</Field>
          <Field label="Expires" error={shown('expiry')}>{x => <input {...x} className="input" type="date" min={tomorrow} value={f.expiry} onChange={e => setF(v => ({ ...v, expiry: e.target.value }))} />}</Field>
        </div>
        <Field label={mode === 'off' ? 'Units to write off' : 'Units'} error={shown('qty')}>{x => <input {...x} className="input" inputMode="numeric" value={f.qty} onChange={e => setF(v => ({ ...v, qty: e.target.value }))} />}</Field>
        {mode === 'off' && <p className="form-help">Writing off takes units out of the batch for good, for damage or expiry. It is kept in the audit log.</p>}
        {problem && <p className="form-error" role="alert">That was not recorded. {problem}</p>}
      </form>
    </Drawer>
  );
}
