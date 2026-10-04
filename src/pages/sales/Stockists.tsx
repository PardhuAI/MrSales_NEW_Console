import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Plus } from '@phosphor-icons/react';
import { invalidate, useResource } from '../../data/resource';
import { createStockist, loadStockists, setStockistStatus, updateStockist, type Stockist, type StockistInput } from '../../live/sales';
import { dayMonth, dayOf } from '../../lib/days';
import { count, rupeesShort } from '../../lib/format';
import { Confirm, Drawer, Field, Filter, Notice, Pill, SearchBox, Summary, Toolbar, useFocusFirstError } from '../../components/kit';
import { Segmented } from '../../components/Segmented';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useMe } from '../../live/session';

/**
 * Stockists: the distributors that supply what the field orders, and which
 * of them the phone may offer. Taking one off the list keeps every order that
 * already names it.
 */
export function Stockists() {
  const r = useResource('sales:stockists', loadStockists);
  if (r.status === 'error' && !r.data) return <LoadError what="Stockists" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading stockists" lines={1} />;
  return <View data={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function View({ data, at, error, reload }: { data: Awaited<ReturnType<typeof loadStockists>>; at: Date | null; error: string; reload: () => void }) {
  const me = useMe();
  const loc = useLocation();
  const nav = useNavigate();
  const may = ['owner', 'admin', 'management'].includes(me.role);
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [territory, setTerritory] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Stockist | 'new' | null>(loc.pathname.endsWith('/new') ? 'new' : null);
  const [notice, setNotice] = useState('');
  const list = data.stockists;
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return list.filter(s => (status === 'all' || s.status === status) && (territory === 'all' || s.territoryId === territory) && (!n || `${s.code} ${s.name} ${s.city ?? ''} ${s.gstin ?? ''}`.toLowerCase().includes(n)));
  }, [list, status, territory, q]);
  const on = list.filter(s => s.status === 'active').length;
  const close = () => { setOpen(null); if (loc.pathname.endsWith('/new')) nav('/sales/stockists', { replace: true }); };

  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read stockists again" />}>
        {list.length === 0 ? 'No stockists yet.' : <><strong>{count(on, 'stockist')} on the phone's list</strong>{list.length - on ? `, ${list.length - on} off it` : ''}.
          {data.ordersWithout ? <> <Link className="link" to="/sales/orders">{count(data.ordersWithout, 'order names', 'orders name')} no stockist</Link>.</> : ' Every order names one.'}</>}
      </Summary>
      <Toolbar>
        {may && <button type="button" className="btn btn-primary btn-small" onClick={() => setOpen('new')}><Plus size={14} weight="bold" aria-hidden="true" /> Add a stockist</button>}
      </Toolbar>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Code, name, city or GSTIN" label="Find a stockist" />
        <Segmented label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All', count: list.length }, { value: 'active', label: 'On the list', count: on }, { value: 'inactive', label: 'Off the list', count: list.length - on }]} />
        <Filter label="Territory" value={territory} onChange={setTerritory} options={[{ value: 'all', label: 'All' }, ...data.territories.map(t => ({ value: t.id, label: t.name }))]} />
      </Toolbar>
      {list.length === 0 ? (
        <Empty title="No stockists yet">Add the distributors who supply your orders; the phone offers them when an order is booked.</Empty>
      ) : rows.length === 0 ? (
        <div className="list-empty"><Empty title="No stockists match">Try another status, territory or search.</Empty></div>
      ) : (
        <Arrive>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">Stockist</th><th scope="col">Territory</th><th scope="col" className="hide-narrow">Contact</th><th scope="col" className="num">Orders</th><th scope="col" className="hide-narrow">Last order</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {rows.map(s => (
                  <tr key={s.id} className="clickable" onClick={() => setOpen(s)}>
                    <th scope="row"><button type="button" className="cell-link cell-button" aria-haspopup="dialog" onClick={e => { e.stopPropagation(); setOpen(s); }}>{s.name}</button><span className="cell-sub">{[s.code, s.city, s.state].filter(Boolean).join(' · ')}</span></th>
                    <td>{s.territory || <span className="cell-quiet">Not set</span>}</td>
                    <td className="hide-narrow">{s.contactPerson ?? <span className="cell-quiet">Not given</span>}<span className="cell-sub">{s.phone ?? ''}</span></td>
                    <td className="num">{s.orders}<span className="cell-sub">{s.orderValue ? rupeesShort(s.orderValue) : ''}</span></td>
                    <td className="hide-narrow">{s.lastOrder ? dayMonth(dayOf(s.lastOrder)) : <span className="cell-quiet">None</span>}</td>
                    <td>{s.status === 'active' ? <Pill tone="good">On the list</Pill> : <Pill>Off the list</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Arrive>
      )}
      <StockistDrawer open={open} may={may} territories={data.territories} onClose={close} onSaved={m => { setNotice(m); invalidate('sales:'); }} />
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

const empty: StockistInput = { code: '', name: '', city: '', state: '', gstin: '', contactPerson: '', phone: '', email: '', address: '', territoryId: null };

function StockistDrawer({ open, may, territories, onClose, onSaved }: { open: Stockist | 'new' | null; may: boolean; territories: { id: string; name: string }[]; onClose: () => void; onSaved: (m: string) => void }) {
  const s = open && open !== 'new' ? open : null;
  const [f, setF] = useState<StockistInput>(empty);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(s ? { code: s.code, name: s.name, city: s.city ?? '', state: s.state ?? '', gstin: s.gstin ?? '', contactPerson: s.contactPerson ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '', territoryId: s.territoryId } : empty);
    setProblem('');
    setAttempt(0);
  }, [open, s]);
  const set = <K extends keyof StockistInput>(k: K, v: StockistInput[K]) => setF(x => ({ ...x, [k]: v }));
  const errors = {
    code: !f.code.trim() ? 'Give the stockist its code.' : undefined,
    name: !f.name.trim() ? 'Give the stockist its name.' : undefined,
    gstin: f.gstin.trim() && f.gstin.trim().length !== 15 ? `A GSTIN is 15 characters; this is ${f.gstin.trim().length}.` : undefined,
    email: f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email) ? 'That does not look like an email address.' : undefined,
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
      if (s) onSaved(await updateStockist(s.id, f));
      else {
        await createStockist(f);
        onSaved(`${f.name.trim()} is added and on the phone's list.`);
      }
      onClose();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const toggle = async () => {
    if (!s) return;
    setBusy(true);
    try {
      onSaved(await setStockistStatus(s.id, s.status === 'active' ? 'inactive' : 'active'));
      setAsk(false);
      onClose();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const ro = !may;
  return (
    <Drawer open={Boolean(open)} onClose={onClose} title={s ? s.name : 'Add a stockist'} sub={s ? `${s.code}${s.territory ? ` · ${s.territory}` : ''} · ${count(s.orders, 'order')}` : 'A distributor the phone can name on an order.'}
      footer={may ? (
        <>
          {s && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setAsk(true)}>{s.status === 'active' ? 'Take off the list' : 'Put back on the list'}</button>}
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : s ? 'Save changes' : 'Add the stockist'}</button>
        </>
      ) : undefined}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        <div className="form-row">
          <Field label="Code" error={shown('code')} help={s ? 'Fixed once the stockist exists, because orders name it.' : 'Your own code; it must be unique.'}>{x => <input {...x} className="input" value={f.code} readOnly={Boolean(s) || ro} placeholder="STK-HYD-03" onChange={e => set('code', e.target.value)} />}</Field>
          <Field label="Territory" optional>{x => (
            <select {...x} className="input" value={f.territoryId ?? ''} disabled={ro} onChange={e => set('territoryId', e.target.value || null)}>
              <option value="">Not set</option>
              {territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}</Field>
        </div>
        <Field label="Name" error={shown('name')}>{x => <input {...x} className="input" value={f.name} readOnly={ro} onChange={e => set('name', e.target.value)} />}</Field>
        <div className="form-row">
          <Field label="Contact person" optional>{x => <input {...x} className="input" value={f.contactPerson} readOnly={ro} onChange={e => set('contactPerson', e.target.value)} />}</Field>
          <Field label="Phone" optional>{x => <input {...x} className="input" inputMode="tel" value={f.phone} readOnly={ro} onChange={e => set('phone', e.target.value)} />}</Field>
        </div>
        <div className="form-row">
          <Field label="Email" optional error={shown('email')}>{x => <input {...x} className="input" type="email" value={f.email} readOnly={ro} onChange={e => set('email', e.target.value)} />}</Field>
          <Field label="GSTIN" optional error={shown('gstin')}>{x => <input {...x} className="input" value={f.gstin} readOnly={ro} maxLength={15} onChange={e => set('gstin', e.target.value.toUpperCase())} />}</Field>
        </div>
        <Field label="Address" optional>{x => <input {...x} className="input" value={f.address} readOnly={ro} onChange={e => set('address', e.target.value)} />}</Field>
        <div className="form-row">
          <Field label="City" optional>{x => <input {...x} className="input" value={f.city} readOnly={ro} onChange={e => set('city', e.target.value)} />}</Field>
          <Field label="State" optional>{x => <input {...x} className="input" value={f.state} readOnly={ro} onChange={e => set('state', e.target.value)} />}</Field>
        </div>
        {s && <p className="form-help">A field left empty keeps what is on record.</p>}
        {ro && <p className="form-note">Owner, admin and management logins change stockists.</p>}
        {problem && <p className="form-error" role="alert">That was not saved. {problem}</p>}
      </form>
      {s && (
        <Confirm open={ask} title={s.status === 'active' ? `Take ${s.name} off the phone's list?` : `Put ${s.name} back on the list?`} confirmLabel={s.status === 'active' ? 'Take off the list' : 'Put back on the list'} busy={busy} error={problem} onCancel={() => setAsk(false)} onConfirm={() => void toggle()}>
          {s.status === 'active' ? `The phone stops offering it on new orders. The ${count(s.orders, 'order')} that already name it are untouched.` : 'The phone offers it again on new orders.'}
        </Confirm>
      )}
    </Drawer>
  );
}
