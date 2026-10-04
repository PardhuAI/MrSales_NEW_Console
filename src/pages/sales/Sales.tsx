import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useResource } from '../../data/resource';
import { loadSales, monthName, type SalesModel } from '../../live/sales';
import { IST_TODAY } from '../../lib/days';
import { count, percent, rupees, rupeesShort } from '../../lib/format';
import { Drawer, Filter, Toolbar } from '../../components/kit';
import { MonthBars, ShareBar } from '../../components/charts';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive, CountUp } from '../../components/motion';
import { useCan } from '../../app/access';

/**
 * Sales: is the month on track to target, and who is carrying it. Primary
 * sales are the recorded sales; field orders are approved orders, which the
 * database turns into sales when they are approved. Each is shown as itself.
 */
export function Sales() {
  const r = useResource<SalesModel>('sales:sales', loadSales);
  if (r.status === 'error' && !r.data) return <LoadError what="Sales" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading sales" />;
  return <View m={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function View({ m, at, error, reload }: { m: SalesModel; at: Date | null; error: string; reload: () => void }) {
  const allowed = useCan();
  const current = m.months[m.months.length - 1];
  const [month, setMonth] = useState(current);
  const [team, setTeam] = useState('all');
  const [open, setOpen] = useState<SalesModel['people'][number] | null>(null);
  const y = m.year.find(x => x.month === month)!;
  const total = y.primary + y.orders;
  const day = Number(IST_TODAY().slice(8));
  const daysIn = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const isCurrent = month === current;
  const managers = useMemo(() => {
    const ids = new Map<string, string>();
    for (const p of m.people) if (p.managerId) ids.set(p.managerId, p.manager);
    return [...ids.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [m]);
  const rows = m.people
    .filter(p => team === 'all' || p.managerId === team)
    .map(p => {
      const c = p.byMonth[month] ?? { primary: 0, orders: 0, target: 0 };
      return { p, ...c, total: c.primary + c.orders };
    })
    .filter(x => x.total || x.target)
    .sort((a, b) => (b.target ? b.total / b.target : -1) - (a.target ? a.total / a.target : -1) || b.total - a.total);
  const withTarget = rows.filter(x => x.target);
  const behind = withTarget.filter(x => x.total / x.target < (isCurrent ? day / daysIn : 1) * 0.85).length;

  return (
    <div className="page-body">
      <Toolbar>
        <Filter label="Month" value={month} onChange={setMonth} options={[...m.months].reverse().map(k => ({ value: k, label: `${monthName(k)} ${k.slice(0, 4)}` }))} />
        {managers.length > 1 && <Filter label="Team" value={team} onChange={setTeam} options={[{ value: 'all', label: 'Everyone' }, ...managers.map(x => ({ value: x.id, label: `${x.name}'s team` }))]} />}
        <span className="toolbar-end"><Freshness at={at} error={error} reload={reload} label="Read sales again" /></span>
      </Toolbar>

      <Arrive className="hero">
        <p className="hero-line sales-hero">
          {total || y.target ? <><span className="hero-figure"><CountUp value={total} format={rupeesShort} /></span> sold in {monthName(month)}{y.target ? <>, {percent(total, y.target)} of {rupeesShort(y.target)}</> : ''}</> : <>Nothing sold in {monthName(month)} yet</>}
        </p>
        <p className="hero-sub">
          {total ? `${rupeesShort(y.primary)} in primary sales and ${rupeesShort(y.orders)} from approved field orders, before GST. ` : ''}
          {!y.target ? 'No target was set for this month. ' : isCurrent ? `${count(daysIn - day, 'day')} of the month left; at this pace it closes near ${rupeesShort((total / Math.max(day, 1)) * daysIn)}. ` : ''}
          {withTarget.length ? `${behind ? `${count(behind, 'person is', 'people are')} well behind ${isCurrent ? 'the pace' : 'target'}.` : 'Everyone with a target is on pace.'}` : ''}
          {!y.target && allowed('targets') && <> <Link className="link" to="/sales/targets">Assign targets</Link></>}
        </p>
      </Arrive>

      {m.year.some(x => x.primary || x.orders || x.target) && (
        <Arrive as="section" className="block sales-chart" index={1}>
          <MonthBars
            caption="Each month's sales, with the target marked. Choose a month to read it."
            data={m.year.map(x => ({ key: x.month, label: monthName(x.month, false), a: x.primary, b: x.orders, target: x.target }))}
            format={rupees}
            partA="Primary sales"
            partB="Field orders"
            highlight={month}
            onPick={setMonth}
          />
        </Arrive>
      )}

      <Arrive as="section" className="block" index={2}>
        <div className="block-head">
          <h2 className="section-title">By person, {monthName(month)}</h2>
          <span className="block-meta">furthest ahead first</span>
        </div>
        {rows.length === 0 ? (
          <Empty title={`No sales or targets for ${monthName(month)}`}>Sales arrive as they are recorded and as field orders are approved; targets are set under Targets.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col" className="num">Target</th>
                  <th scope="col" className="num hide-narrow">Primary</th>
                  <th scope="col" className="num hide-narrow">Field orders</th>
                  <th scope="col" className="num">Sold</th>
                  <th scope="col" className="num">Of target</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(x => (
                  <tr key={x.p.id} className="clickable" onClick={() => setOpen(x.p)}>
                    <th scope="row">
                      <button type="button" className="cell-link cell-button" aria-haspopup="dialog" onClick={e => { e.stopPropagation(); setOpen(x.p); }}>{x.p.name}</button>
                      <span className="cell-sub">{[x.p.hq, x.p.manager && `reports to ${x.p.manager}`].filter(Boolean).join(' · ')}</span>
                    </th>
                    <td className="num">{x.target ? rupeesShort(x.target) : <span className="cell-quiet">None</span>}</td>
                    <td className="num hide-narrow">{rupeesShort(x.primary)}</td>
                    <td className="num hide-narrow">{x.orders ? rupeesShort(x.orders) : <span className="cell-quiet">0</span>}</td>
                    <td className="num"><strong>{rupeesShort(x.total)}</strong></td>
                    <td className="num">{x.target ? <ShareBar part={x.total} whole={x.target} label={percent(x.total, x.target)} /> : <span className="cell-quiet">No target</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {m.unassigned[month] ? <p className="block-note">{rupees(m.unassigned[month])} in recorded sales names nobody, so it counts in the company total and in no one's row.</p> : null}
      </Arrive>

      <Drawer open={Boolean(open)} onClose={() => setOpen(null)} title={open?.name ?? ''} sub={open ? [open.code, open.hq].filter(Boolean).join(' · ') : ''} wide>
        {open && (
          <>
            <MonthBars
              caption={`${open.name.split(' ')[0]}'s sales each month, with the target marked`}
              data={m.months.map(k => ({ key: k, label: monthName(k, false), a: open.byMonth[k]?.primary ?? 0, b: open.byMonth[k]?.orders ?? 0, target: open.byMonth[k]?.target ?? 0 }))}
              format={rupees}
              partA="Primary sales"
              partB="Field orders"
              highlight={month}
            />
            <div className="table-wrap drawer-section">
              <table className="table table-compact">
                <thead><tr><th scope="col">Month</th><th scope="col" className="num">Target</th><th scope="col" className="num">Sold</th><th scope="col" className="num">Of target</th></tr></thead>
                <tbody>
                  {[...m.months].reverse().map(k => {
                    const c = open.byMonth[k] ?? { primary: 0, orders: 0, target: 0 };
                    const t = c.primary + c.orders;
                    return <tr key={k}><th scope="row">{monthName(k)} {k.slice(0, 4)}</th><td className="num">{c.target ? rupees(c.target) : <span className="cell-quiet">None</span>}</td><td className="num">{rupees(t)}</td><td className="num">{c.target ? percent(t, c.target) : ''}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
            {allowed('people') && <p className="drawer-note"><Link className="link" to={`/team/${open.id}`}>Open {open.name.split(' ')[0]}'s record</Link></p>}
          </>
        )}
      </Drawer>
    </div>
  );
}
