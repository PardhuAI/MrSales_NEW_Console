import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Plus } from '@phosphor-icons/react';
import { invalidate, useResource } from '../../data/resource';
import { assignTargets, loadTargets, monthName, type TargetsModel } from '../../live/sales';
import { IST_TODAY } from '../../lib/days';
import { count, percent, rupees, rupeesShort } from '../../lib/format';
import { Drawer, Field, Notice, SearchBox, Summary, Toolbar, useFocusFirstError } from '../../components/kit';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useMe } from '../../live/session';

/**
 * Targets: each person's target by month, and what they sold against it.
 * Assigned by a manager, never entered by the rep. Achievement counts every
 * recorded sale, as on Sales and the Dashboard.
 */
export function Targets() {
  const r = useResource<TargetsModel>('sales:targets', loadTargets);
  if (r.status === 'error' && !r.data) return <LoadError what="Targets" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading targets" lines={1} />;
  return <View m={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function View({ m, at, error, reload }: { m: TargetsModel; at: Date | null; error: string; reload: () => void }) {
  const me = useMe();
  const loc = useLocation();
  const nav = useNavigate();
  const may = ['owner', 'admin', 'hr', 'management'].includes(me.role);
  const [assigning, setAssigning] = useState(loc.pathname === '/sales/targets/new');
  const [notice, setNotice] = useState('');
  const [q, setQ] = useState('');
  const cur = IST_TODAY().slice(0, 7);
  const next = m.months[m.months.length - 1];
  const rows = m.people.filter(p => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const without = (k: string) => m.people.filter(p => !p.cells[k]?.target).length;

  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read targets again" />}>
        {m.people.length === 0 ? 'Nobody in the field to set a target for yet.' : <>
          <strong>{monthName(cur)}</strong>: {without(cur) ? <><span className="warn-text">{count(without(cur), 'person has', 'people have')}</span> no target.</> : 'everyone has a target.'}{' '}
          <strong>{monthName(next)}</strong>: {without(next) === m.people.length ? 'none set yet.' : without(next) ? `${without(next)} still to set.` : 'every target is set.'}
        </>}
      </Summary>
      <Toolbar>
        {may && <button type="button" className="btn btn-primary btn-small" onClick={() => setAssigning(true)}><Plus size={14} weight="bold" aria-hidden="true" /> Assign a target</button>}
        <SearchBox value={q} onChange={setQ} placeholder="Find a person" label="Find a person" />
      </Toolbar>
      {m.people.length === 0 ? (
        <Empty title="Nobody to set a target for">Field people appear here once they are added. <Link className="link" to="/team/new">Add a person</Link></Empty>
      ) : (
        <Arrive>
          <div className="table-wrap">
            <table className="table target-grid">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  {m.months.map(k => <th key={k} scope="col" className={`num${k === cur ? ' tg-now' : ''}`}>{monthName(k, false)}{k === cur ? ', now' : ''}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p.id}>
                    <th scope="row"><span className="cell-main">{p.name}</span><span className="cell-sub">{[p.code, p.hq].filter(Boolean).join(' · ')}</span></th>
                    {m.months.map(k => {
                      const c = p.cells[k];
                      const future = k > cur;
                      return (
                        <td key={k} className={`num${k === cur ? ' tg-now' : ''}`}>
                          {c.target ? (
                            <>
                              <span className="tg-target">{rupeesShort(c.target)}</span>
                              {!future && <span className={`tg-share${c.sold >= c.target ? ' met' : ''}`}>{percent(c.sold, c.target)} sold</span>}
                            </>
                          ) : <span className="cell-quiet">{c.sold && !future ? `${rupeesShort(c.sold)} sold` : 'None'}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="block-note">Each cell is the target for the month, and the share of it sold. A target set per product is added into the person's month.</p>
        </Arrive>
      )}
      <AssignDrawer open={assigning} m={m} onClose={() => { setAssigning(false); if (loc.pathname.endsWith('/new')) nav('/sales/targets', { replace: true }); }} onDone={msg => { setAssigning(false); setNotice(msg); invalidate('sales:'); if (loc.pathname.endsWith('/new')) nav('/sales/targets', { replace: true }); }} />
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

function AssignDrawer({ open, m, onClose, onDone }: { open: boolean; m: TargetsModel; onClose: () => void; onDone: (msg: string) => void }) {
  const [who, setWho] = useState<'everyone' | string>('everyone');
  const [month, setMonth] = useState(m.months[m.months.length - 1]);
  const [product, setProduct] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (open) {
      setProblem('');
      setAttempt(0);
    }
  }, [open]);
  const value = Number(amount.replace(/[,\s₹]/g, ''));
  const people = who === 'everyone' ? m.people : m.people.filter(p => p.id === who);
  const replacing = useMemo(() => people.filter(p => p.cells[month]?.target && !product).length, [people, month, product]);
  const errors = { amount: !amount.trim() ? 'Write the target, in rupees.' : !Number.isFinite(value) || value <= 0 ? 'Write the target as a number above zero.' : undefined };
  const formRef = useFocusFirstError(errors, attempt);
  const save = async () => {
    setAttempt(a => a + 1);
    if (errors.amount || !people.length) return;
    setBusy(true);
    setProblem('');
    try {
      await assignTargets(people.map(p => p.id), product || null, month, value);
      onDone(`${rupees(value)} set for ${who === 'everyone' ? count(people.length, 'person', 'people') : people[0].name} for ${monthName(month)}${product ? `, ${m.products.find(p => p.id === product)?.name}` : ''}.`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const futureMonths = [...m.months.slice(-3)];
  return (
    <Drawer open={open} onClose={onClose} title="Assign a target" sub="One figure, for one person or everyone in the field, for one month."
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={busy || !people.length} onClick={() => void save()}>{busy ? 'Assigning…' : who === 'everyone' ? `Assign to ${count(people.length, 'person', 'people')}` : 'Assign the target'}</button>
        </>
      )}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        <Field label="For">{p => (
          <select {...p} className="input" value={who} onChange={e => setWho(e.target.value)}>
            <option value="everyone">Everyone in the field ({m.people.length})</option>
            {m.people.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}</Field>
        <div className="form-row">
          <Field label="Month">{p => (
            <select {...p} className="input" value={month} onChange={e => setMonth(e.target.value)}>
              {futureMonths.map(k => <option key={k} value={k}>{monthName(k)} {k.slice(0, 4)}</option>)}
            </select>
          )}</Field>
          <Field label="Product" optional help="Leave it on the whole month to set one overall figure.">{p => (
            <select {...p} className="input" value={product} onChange={e => setProduct(e.target.value)}>
              <option value="">The whole month, every product</option>
              {m.products.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}</Field>
        </div>
        <Field label={who === 'everyone' ? 'Target for each person' : 'Target'} error={attempt ? errors.amount : undefined}
          help={Number.isFinite(value) && value > 0 && who === 'everyone' ? `${count(people.length, 'person', 'people')} × ${rupees(value)}, ${rupees(value * people.length)} in all.` : 'In rupees, for the month.'}>{p => (
          <input {...p} className="input" inputMode="numeric" value={amount} placeholder="1,50,000" onChange={e => setAmount(e.target.value)} />
        )}</Field>
        {replacing > 0 && <p className="form-note">{count(replacing, 'person already has', 'people already have')} an overall target for {monthName(month)}. Assigning replaces it.</p>}
        {problem && <p className="form-error" role="alert">That was not assigned. {problem}</p>}
      </form>
    </Drawer>
  );
}
