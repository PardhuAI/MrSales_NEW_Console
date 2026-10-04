import { useMemo, useState } from 'react';
import { useResource } from '../../data/resource';
import { loadRcpa, type RcpaModel } from '../../live/sales';
import { count, percent } from '../../lib/format';
import { Filter, Toolbar } from '../../components/kit';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';

/**
 * Prescription audit: of everything prescribed where a rep counted, how much
 * was ours, and who is taking the rest. Every figure here was typed by a rep
 * standing at a chemist's counter; it is the one measure of the market rather
 * than of the sales force.
 */
export function Rcpa() {
  const r = useResource<RcpaModel>('sales:rcpa', () => loadRcpa(90));
  if (r.status === 'error' && !r.data) return <LoadError what="The prescription audit" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading the prescription audit" />;
  return <View m={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function View({ m, at, error, reload }: { m: RcpaModel; at: Date | null; error: string; reload: () => void }) {
  const [who, setWho] = useState('all');
  const entries = m.entries.filter(e => who === 'all' || e.personId === who);
  const byProduct = useMemo(() => {
    const map = new Map<string, { name: string; ours: number; theirs: number; readings: number }>();
    for (const e of entries) {
      const x = map.get(e.productId) ?? { name: e.product, ours: 0, theirs: 0, readings: 0 };
      x.ours += e.ours;
      x.theirs += e.theirs;
      x.readings++;
      map.set(e.productId, x);
    }
    return [...map.values()].map(x => ({ ...x, share: x.ours + x.theirs ? x.ours / (x.ours + x.theirs) : 0 })).sort((a, b) => a.share - b.share);
  }, [entries]);
  const byCompetitor = useMemo(() => {
    const map = new Map<string, { name: string; theirs: number; ours: number; readings: number }>();
    for (const e of entries) {
      if (!e.competitor) continue;
      const x = map.get(e.competitor.toLowerCase()) ?? { name: e.competitor, theirs: 0, ours: 0, readings: 0 };
      x.theirs += e.theirs;
      x.ours += e.ours;
      x.readings++;
      map.set(e.competitor.toLowerCase(), x);
    }
    return [...map.values()].sort((a, b) => b.theirs - a.theirs);
  }, [entries]);
  const ours = entries.reduce((s, e) => s + e.ours, 0);
  const theirs = entries.reduce((s, e) => s + e.theirs, 0);
  const behind = byProduct.filter(p => Math.round(p.share * 100) < 45);
  const unnamed = entries.filter(e => !e.competitor && e.theirs > 0).length;
  const maxTheirs = Math.max(1, ...byCompetitor.map(c => c.theirs));

  return (
    <div className="page-body">
      <Toolbar>
        <Filter label="Person" value={who} onChange={setWho} options={[{ value: 'all', label: 'Everyone' }, ...m.people.map(p => ({ value: p.id, label: p.name }))]} />
        <span className="toolbar-end"><Freshness at={at} error={error} reload={reload} label="Read the audit again" /></span>
      </Toolbar>
      {m.entries.length === 0 ? (
        <Empty title="No audits recorded in the last 90 days">When a rep counts prescriptions at a chemist and records ours against a competitor's on the call report, the share appears here.</Empty>
      ) : (
        <>
          <Arrive className="hero">
            <p className="hero-line sales-hero"><span className="hero-figure">{percent(ours, ours + theirs)}</span> of prescriptions counted were ours</p>
            <p className="hero-sub">
              {count(ours, 'unit')} of {(ours + theirs).toLocaleString('en-IN')} across {count(entries.length, 'reading')} in the last 90 days.
              {' '}{behind.length ? `${count(behind.length, 'product is', 'products are')} behind the competition (under 45%).` : 'Every product holds its own.'}
              {' '}{m.callsDone ? `${percent(m.callsWithAudit, m.callsDone)} of completed calls carried an audit.` : ''}
            </p>
          </Arrive>
          <div className="pair">
            <Arrive as="section" className="block" index={1}>
              <div className="block-head"><h2 className="section-title">Our share by product</h2><span className="block-meta">weakest first</span></div>
              {byProduct.length === 0 ? <p className="block-empty">No readings for this person.</p> : (
                <ul className="share-list">
                  {byProduct.map(p => (
                    <li key={p.name}>
                      <span className="share-name">{p.name}<span className="cell-sub">{p.ours} ours, {p.theirs} theirs · {count(p.readings, 'reading')}</span></span>
                      <span className="share-bar" aria-hidden="true"><span className="share-ours" style={{ flexGrow: p.share }} /><span className="share-theirs" style={{ flexGrow: 1 - p.share }} /></span>
                      <span className={`share-pct${Math.round(p.share * 100) < 45 ? ' warn-text' : ''}`}>{percent(p.ours, p.ours + p.theirs)}{Math.round(p.share * 100) < 45 ? ', behind' : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Arrive>
            <Arrive as="section" className="block" index={2}>
              <div className="block-head"><h2 className="section-title">Units going to competitors</h2></div>
              {byCompetitor.length === 0 ? <p className="block-empty">No competitor was named on these readings.</p> : (
                <ul className="share-list">
                  {byCompetitor.map(c => (
                    <li key={c.name}>
                      <span className="share-name">{c.name}<span className="cell-sub">{count(c.readings, 'reading')}, their share {percent(c.theirs, c.theirs + c.ours)}</span></span>
                      <span className="share-bar" aria-hidden="true"><span className="share-theirs solid" style={{ flexGrow: c.theirs / maxTheirs }} /><span style={{ flexGrow: 1 - c.theirs / maxTheirs }} /></span>
                      <span className="share-pct">{c.theirs.toLocaleString('en-IN')}</span>
                    </li>
                  ))}
                </ul>
              )}
              {unnamed > 0 && <p className="block-note">{count(unnamed, 'reading')} counted competitor units without naming the competitor.</p>}
            </Arrive>
          </div>
        </>
      )}
    </div>
  );
}
