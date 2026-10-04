import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { EASE } from './motion';

/**
 * Month bars: one bar per month in two stacked parts, with the target as a
 * tick. Drawn with the tokens, once, on first view; changes after that update
 * in place. Every chart carries a table for screen readers.
 */
export function MonthBars({
  data, format, partA, partB, caption, highlight, onPick,
}: {
  data: { key: string; label: string; a: number; b: number; target: number }[];
  format: (n: number) => string;
  partA: string;
  partB: string;
  caption: string;
  highlight?: string;
  onPick?: (key: string) => void;
}) {
  const reduce = useReducedMotion();
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setDrawn(true), 900);
    return () => window.clearTimeout(t);
  }, []);
  const max = Math.max(1, ...data.map(d => Math.max(d.a + d.b, d.target))) * 1.08;
  const H = 160;
  const W = 40;
  return (
    <figure className="mbars">
      <figcaption className="chart-title">{caption}</figcaption>
      <div className="mbars-plot">
        <svg viewBox={`0 0 ${data.length * W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {data.map((d, i) => {
            const ha = (d.a / max) * H;
            const hb = (d.b / max) * H;
            const on = d.key === highlight;
            return (
              <g key={d.key} className={`mbar${on ? ' on' : ''}${onPick ? ' pick' : ''}`} onClick={() => onPick?.(d.key)}>
                <rect className="mbar-hit" x={i * W} y={0} width={W} height={H} />
                <motion.g
                  style={{ transformOrigin: `0 ${H}px`, transformBox: 'view-box' }}
                  initial={reduce || drawn ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.5, ease: EASE, delay: reduce || drawn ? 0 : 0.15 + i * 0.03 }}
                >
                  <rect className="mbar-a" x={i * W + 9} width={22} y={H - ha} height={ha} rx={2} />
                  {hb > 0 && <rect className="mbar-b" x={i * W + 9} width={22} y={H - ha - hb} height={hb} rx={2} />}
                </motion.g>
                {d.target > 0 && <line className="target-tick" x1={i * W + 5} x2={i * W + 35} y1={H - (d.target / max) * H} y2={H - (d.target / max) * H} vectorEffect="non-scaling-stroke" />}
              </g>
            );
          })}
        </svg>
      </div>
      <ol className="mbars-labels" aria-hidden="true">
        {data.map(d => <li key={d.key} className={d.key === highlight ? 'on' : ''}>{d.label}</li>)}
      </ol>
      <p className="mbars-key" aria-hidden="true">
        <span><i className="ka" />{partA}</span>
        <span><i className="kb" />{partB}</span>
        <span><i className="kt" />Target</span>
      </p>
      <table className="visually-hidden">
        <caption>{caption}</caption>
        <thead><tr><th scope="col">Month</th><th scope="col">{partA}</th><th scope="col">{partB}</th><th scope="col">Target</th></tr></thead>
        <tbody>{data.map(d => <tr key={d.key}><th scope="row">{d.label}</th><td>{format(d.a)}</td><td>{format(d.b)}</td><td>{d.target ? format(d.target) : 'none'}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

/** A thin share bar with the share in words beside it. */
export function ShareBar({ part, whole, label }: { part: number; whole: number; label: string }) {
  const v = whole ? Math.min(part / whole, 1) : 0;
  return (
    <span className="share">
      <span className="inline-meter" aria-hidden="true"><span style={{ transform: `scaleX(${v})` }} /></span>
      <span>{label}</span>
    </span>
  );
}
