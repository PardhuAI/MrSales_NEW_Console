import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus } from '@phosphor-icons/react';
import { invalidate, useResource } from '../../data/resource';
import { createProduct, importProducts, loadProducts, productSheet, setProductStatus, updateProduct, type Product } from '../../live/sales';
import { PRODUCT_COLUMNS } from '../../data/sheets';
import { count, rupees } from '../../lib/format';
import { Drawer, Field, Notice, Pill, SearchBox, Summary, Toolbar, useFocusFirstError } from '../../components/kit';
import { Segmented } from '../../components/Segmented';
import { SheetImport } from '../../components/SheetImport';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useMe } from '../../live/session';

/**
 * Products: what the phone takes orders from, and at what price. A product
 * starts as a draft nobody can order, goes on sale, and is retired rather
 * than deleted, so orders that name it keep their meaning.
 */

const STATUS: Record<Product['status'], { word: string; tone: 'good' | 'neutral' | 'warning' }> = {
  active: { word: 'On sale', tone: 'good' }, draft: { word: 'Draft', tone: 'warning' }, retired: { word: 'Retired', tone: 'neutral' },
};

export function Products() {
  const r = useResource<Product[]>('sales:products', loadProducts);
  if (r.status === 'error' && !r.data) return <LoadError what="Products" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading products" lines={1} />;
  return <View list={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function View({ list, at, error, reload }: { list: Product[]; at: Date | null; error: string; reload: () => void }) {
  const me = useMe();
  const loc = useLocation();
  const nav = useNavigate();
  const mayEdit = me.role === 'owner' || me.role === 'admin';
  const [status, setStatus] = useState<'all' | Product['status']>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Product | 'new' | null>(loc.pathname.endsWith('/new') ? 'new' : null);
  const [notice, setNotice] = useState('');
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return list.filter(p => (status === 'all' || p.status === status) && (!n || `${p.sku} ${p.name}`.toLowerCase().includes(n)));
  }, [list, status, q]);
  const by = (s: Product['status']) => list.filter(p => p.status === s).length;
  const close = () => { setOpen(null); if (loc.pathname.endsWith('/new')) nav('/sales/products', { replace: true }); };

  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read products again" />}>
        {list.length === 0 ? 'No products yet.' : <><strong>{count(by('active'), 'product')} on sale</strong>{by('draft') ? `, ${by('draft')} in draft that nobody can order yet` : ''}{by('retired') ? `, ${by('retired')} retired` : ''}.</>}
      </Summary>
      <Toolbar>
        {mayEdit && <button type="button" className="btn btn-primary btn-small" onClick={() => setOpen('new')}><Plus size={14} weight="bold" aria-hidden="true" /> Add a product</button>}
        {mayEdit && <SheetImport name="products" columns={PRODUCT_COLUMNS} load={productSheet} run={importProducts} onDone={m => { invalidate('sales:'); setNotice(`Product sheet imported: ${m}`); }} />}
      </Toolbar>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Code or name" label="Find a product" />
        <Segmented label="Status" value={status} onChange={setStatus} options={[
          { value: 'all', label: 'All', count: list.length }, { value: 'active', label: 'On sale', count: by('active') },
          { value: 'draft', label: 'Draft', count: by('draft') }, { value: 'retired', label: 'Retired', count: by('retired') },
        ]} />
      </Toolbar>
      {list.length === 0 ? (
        <Empty title="No products yet">Add the products the field sells, one at a time or from a sheet. The phone prices orders from this list.</Empty>
      ) : rows.length === 0 ? (
        <div className="list-empty"><Empty title="No products match">Try another code, name or status.</Empty></div>
      ) : (
        <Arrive>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Pack</th>
                  <th scope="col" className="num">MRP</th>
                  <th scope="col" className="num">Stockist price</th>
                  <th scope="col" className="num hide-narrow">GST</th>
                  <th scope="col" className="num hide-narrow">Ordered</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p.id} className="clickable" onClick={() => setOpen(p)}>
                    <th scope="row"><button type="button" className="cell-link cell-button" aria-haspopup="dialog" onClick={e => { e.stopPropagation(); setOpen(p); }}>{p.name}</button><span className="cell-sub">{p.sku}</span></th>
                    <td>{p.pack ?? <span className="cell-quiet">Not set</span>}</td>
                    <td className="num">{p.mrp != null ? rupees(p.mrp) : <span className="cell-quiet">None</span>}</td>
                    <td className="num">{p.pts != null ? rupees(p.pts) : <span className="cell-quiet">Priced at MRP</span>}</td>
                    <td className="num hide-narrow">{p.gst}%</td>
                    <td className="num hide-narrow">{p.ordered ? count(p.ordered, 'time') : <span className="cell-quiet">Never</span>}</td>
                    <td><Pill tone={STATUS[p.status].tone}>{STATUS[p.status].word}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Arrive>
      )}
      <ProductDrawer open={open} mayEdit={mayEdit} mayMove={mayEdit || me.role === 'management'} onClose={close} onSaved={m => { setNotice(m); invalidate('sales:'); }} />
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

function ProductDrawer({ open, mayEdit, mayMove, onClose, onSaved }: { open: Product | 'new' | null; mayEdit: boolean; mayMove: boolean; onClose: () => void; onSaved: (m: string) => void }) {
  const p = open && open !== 'new' ? open : null;
  const [f, setF] = useState({ sku: '', name: '', pack: '', mrp: '', pts: '', gst: '12' });
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    setF(p ? { sku: p.sku, name: p.name, pack: p.pack ?? '', mrp: p.mrp == null ? '' : String(p.mrp), pts: p.pts == null ? '' : String(p.pts), gst: String(p.gst) } : { sku: '', name: '', pack: '', mrp: '', pts: '', gst: '12' });
    setProblem('');
    setAttempt(0);
  }, [open, p]);
  const set = (k: keyof typeof f, v: string) => setF(x => ({ ...x, [k]: v }));
  const num = (s: string) => Number(s.replace(/[,\s₹]/g, ''));
  const errors = {
    sku: !f.sku.trim() ? 'Give the product its code; the sheet matches on it.' : undefined,
    name: !f.name.trim() ? 'Give the product its name.' : undefined,
    mrp: !f.mrp.trim() || !(num(f.mrp) > 0) ? 'Write the MRP as a number.' : undefined,
    pts: f.pts.trim() && !(num(f.pts) >= 0) ? 'Write the stockist price as a number, or leave it empty.' : undefined,
    gst: !(num(f.gst) >= 0 && num(f.gst) <= 100) ? 'GST is a percentage from 0 to 100.' : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);
  const formRef = useFocusFirstError(errors, attempt);
  const shown = (k: keyof typeof errors) => (attempt ? errors[k] : undefined);
  const save = async () => {
    setAttempt(a => a + 1);
    if (invalid) return;
    setBusy('save');
    setProblem('');
    try {
      const body = { sku: f.sku.trim(), name: f.name.trim(), mrp: num(f.mrp), pts: f.pts.trim() ? num(f.pts) : null, gst: num(f.gst) };
      if (p) onSaved(await updateProduct(p.id, body));
      else {
        await createProduct({ ...body, pack: f.pack.trim() || null });
        onSaved(`${body.name} is added and on sale: the phone can take orders for it now.`);
      }
      onClose();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };
  const move = async (to: Product['status']) => {
    if (!p) return;
    setBusy(to);
    setProblem('');
    try {
      onSaved(await setProductStatus(p.id, to));
      onClose();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };
  const readOnly = Boolean(p) && !mayEdit;

  return (
    <Drawer open={Boolean(open)} onClose={onClose} title={p ? p.name : 'Add a product'} sub={p ? `${p.sku}${p.pack ? ` · ${p.pack}` : ''}` : 'What the phone prices an order from. It goes on sale as soon as it is added; everything but the pack can be changed later.'}
      footer={(mayEdit || !p) ? (
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={busy !== ''} onClick={() => void save()}>{busy === 'save' ? 'Saving…' : p ? 'Save changes' : 'Add the product'}</button>
        </>
      ) : undefined}>
      {p && mayMove && (
        <section className="status-move">
          <p className="form-label">Status</p>
          <div className="choice-row">
            {(['draft', 'active', 'retired'] as const).map(to => (
              <button key={to} type="button" className={`btn btn-small ${p.status === to ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={p.status === to} disabled={busy !== '' || p.status === to || (to === 'draft' && p.ordered > 0)} onClick={() => void move(to)}>
                {busy === to ? 'Saving…' : STATUS[to].word}
              </button>
            ))}
          </div>
          <p className="form-help">A draft cannot be ordered. Retiring keeps every order that already names it, which is why there is no delete.{p.ordered > 0 ? ` It has been ordered ${count(p.ordered, 'time')}, so it cannot go back to draft.` : ''}</p>
        </section>
      )}
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        <div className="form-row">
          <Field label="Code" error={shown('sku')} help={p ? undefined : 'Your own code. It must be unique.'}>{x => <input {...x} className="input" value={f.sku} readOnly={readOnly} placeholder="CLC-017" onChange={e => set('sku', e.target.value)} />}</Field>
          <Field label="Pack" optional={!p} help={p ? 'Fixed once the product exists, because orders are priced per pack.' : 'How it is sold, as you quote it: 10 tablets, 100 ml.'}>{x => <input {...x} className="input" value={f.pack} readOnly={Boolean(p)} placeholder="10 tablets" onChange={e => set('pack', e.target.value)} />}</Field>
        </div>
        <Field label="Name" error={shown('name')}>{x => <input {...x} className="input" value={f.name} readOnly={readOnly} placeholder="Cleopan 40" onChange={e => set('name', e.target.value)} />}</Field>
        <div className="form-row">
          <Field label="MRP" error={shown('mrp')}>{x => <input {...x} className="input" inputMode="decimal" value={f.mrp} readOnly={readOnly} onChange={e => set('mrp', e.target.value)} />}</Field>
          <Field label="Stockist price" optional error={shown('pts')}>{x => <input {...x} className="input" inputMode="decimal" value={f.pts} readOnly={readOnly} onChange={e => set('pts', e.target.value)} />}</Field>
          <Field label="GST %" error={shown('gst')}>{x => <input {...x} className="input" inputMode="decimal" value={f.gst} readOnly={readOnly} onChange={e => set('gst', e.target.value)} />}</Field>
        </div>
        <p className="form-help">MRP is what the patient pays; the stockist price is what the stockist pays. Leave the stockist price empty and orders are priced at MRP.</p>
        {f.pts.trim() && num(f.pts) > num(f.mrp) && <p className="form-error">The stockist price is above the MRP, so every line sells at a loss. Check the two figures.</p>}
        {readOnly && <p className="form-note">Only owner and admin logins change a product's details.</p>}
        {problem && <p className="form-error" role="alert">That was not saved. {problem}</p>}
      </form>
    </Drawer>
  );
}
