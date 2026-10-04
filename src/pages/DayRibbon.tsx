import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { CallState, RibbonGroup } from '../data/dashboard';
import { clock } from '../lib/format';
import { EASE } from '../components/motion';

/**
 * The team's day on one timeline: a row per field person, a mark per call, a
 * line for now. Everyone is on it, including the people with no calls,
 * because an empty row is the thing a manager most needs to see.
 */

const LABEL: Record<CallState, string> = {
  done: 'Visited',
  planned: 'Still to visit',
  started: 'Started, not finished',
  missed: 'Missed',
  flagged: 'Fake location',
};
const ORDER: CallState[] = ['done', 'planned', 'started', 'missed', 'flagged'];

/** Teams longer than this fold, so the Dashboard stays a Dashboard. */
const FOLD = 8;

export function DayRibbon({
  title,
  groups,
  startHour,
  endHour,
  nowHour,
}: {
  title: string;
  groups: RibbonGroup[];
  startHour: number;
  endHour: number;
  /** Where to draw "now"; omitted for a day that has ended. */
  nowHour?: number;
}) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const span = endHour - startHour;
  const x = (h: number) => `${Math.min(100, Math.max(0, ((h - startHour) / span) * 100))}%`;
  const hours = Array.from({ length: span + 1 }, (_, i) => startHour + i)
    .filter(h => nowHour === undefined || Math.abs(h - nowHour) > 0.55);
  const present = new Set(groups.flatMap(g => g.people.flatMap(p => p.calls.map(c => c.state))));

  return (
    <figure className="ribbon" aria-labelledby="ribbon-title">
      <figcaption className="ribbon-head">
        <h2 id="ribbon-title" className="section-title">{title}</h2>
        <ul className="legend" aria-label="Key">
          {ORDER.filter(s => present.has(s)).map(s => (
            <li key={s}><span className={`mark ${s}`} aria-hidden="true" />{LABEL[s]}</li>
          ))}
        </ul>
      </figcaption>

      <div className="ribbon-scroll">
        <div className="ribbon-grid">
          <div className="ribbon-axis" aria-hidden="true">
            <span className="ribbon-name" />
            <div className="ribbon-track">
              {hours.map(h => (
                <span key={h} className="tick" style={{ left: x(h) }}>
                  {h === 12 ? '12 pm' : h > 12 ? `${h - 12}` : `${h}`}
                </span>
              ))}
            </div>
          </div>

          {groups.map(g => {
            const folded = g.people.length > FOLD && !open.has(g.label);
            const people = folded ? g.people.slice(0, FOLD) : g.people;
            return (
              <div className="ribbon-group" key={g.label} role="group" aria-label={g.label}>
                <div className="ribbon-team"><span>{g.label}</span></div>
                {people.map(r => {
                  const done = r.calls.filter(c => c.state === 'done').length;
                  return (
                    <div className={`ribbon-row${r.calls.length === 0 ? ' quiet' : ''}`} key={r.id}>
                      <span className="ribbon-name">
                        <span className="n">{r.name}</span>
                        <span className="c">{r.calls.length ? `${done}/${r.calls.length}` : ''}</span>
                      </span>
                      <div className="ribbon-track">
                        <span className="rail" aria-hidden="true" />
                        {r.calls.length === 0 ? (
                          <span className="ribbon-none">No calls</span>
                        ) : (
                          <ol className="ribbon-calls" aria-label={`${r.name}: ${done} of ${r.calls.length} calls done`}>
                            {r.calls.map((c, i) => (
                              <motion.li
                                key={i}
                                className={`mark ${c.state}`}
                                style={{ left: x(c.at) }}
                                title={`${clock(c.at)} · ${c.client} · ${LABEL[c.state]}${c.note ? `. ${c.note}` : ''}`}
                                initial={reduce ? false : { opacity: 0, scale: 0.4 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.3, ease: EASE, delay: reduce ? 0 : 0.25 + ((c.at - startHour) / span) * 0.6 }}
                              >
                                <span className="visually-hidden">
                                  {clock(c.at)}, {c.client}, {LABEL[c.state]}{c.note ? `. ${c.note}` : ''}
                                </span>
                              </motion.li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </div>
                  );
                })}
                {g.people.length > FOLD && (
                  <button
                    type="button"
                    className="link ribbon-more"
                    onClick={() => setOpen(o => {
                      const n = new Set(o);
                      if (n.has(g.label)) n.delete(g.label);
                      else n.add(g.label);
                      return n;
                    })}
                  >
                    {folded ? `Show all ${g.people.length}` : 'Show fewer'}
                  </button>
                )}
              </div>
            );
          })}

          {nowHour !== undefined && nowHour >= startHour && nowHour <= endHour && (
            <div className="ribbon-now-layer" aria-hidden="true">
              <span className="ribbon-name" />
              <div className="ribbon-track">
                <span className="now" style={{ left: x(nowHour) }}>
                  <span className="now-label">{clock(nowHour)}</span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </figure>
  );
}
