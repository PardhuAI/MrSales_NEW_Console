import { useState } from 'react';
import { KIND_LABEL, approvalsStore, useApprovals, type Kind } from '../data/approvals';
import { count, rupees } from '../lib/format';

/**
 * Decided: what was approved or rejected, by whom, when and why. Read only;
 * a decision is part of the record and is never edited (append-only history).
 */

const KINDS: Kind[] = ['expense', 'order', 'tour', 'leave'];

const dayKey = (iso: string) => {
  const d = new Date(iso);
  const today = new Date(approvalsStore.now());
  const diff = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
};

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toLowerCase();

export function ApprovalsDecided() {
  const store = useApprovals();
  const [outcome, setOutcome] = useState<'all' | 'approved' | 'rejected'>('all');
  const [kind, setKind] = useState<Kind | 'all'>('all');

  const list = store.decided().filter(d =>
    (outcome === 'all' || (outcome === 'approved') === d.approved) && (kind === 'all' || d.kind === kind));

  const days = [...new Set(list.map(d => dayKey(d.at)))];

  return (
    <div className="approvals-page">
      <p className="ap-summary">
        {list.length === 0 ? 'Nothing decided matches these filters.' : <>{count(list.length, 'decision')}, newest first. Decisions are kept as they were made and cannot be edited.</>}
      </p>

      <div className="ap-toolbar">
        <div className="segmented" role="radiogroup" aria-label="Outcome">
          {(['all', 'approved', 'rejected'] as const).map(o => (
            <button key={o} type="button" role="radio" aria-checked={outcome === o} onClick={() => setOutcome(o)}>
              {o === 'all' ? 'All' : o === 'approved' ? 'Approved' : 'Rejected'}
            </button>
          ))}
        </div>
        <div className="segmented" role="radiogroup" aria-label="Kind">
          <button type="button" role="radio" aria-checked={kind === 'all'} onClick={() => setKind('all')}>Every kind</button>
          {KINDS.map(k => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
          ))}
        </div>
      </div>

      {days.map(d => (
        <section key={d} className="dec-day">
          <h2 className="dec-day-title">{d}</h2>
          <ul className="dec-list">
            {list.filter(x => dayKey(x.at) === d).map(x => {
              const p = store.person(x.personId);
              return (
                <li key={x.id} className="dec-row">
                  <span className={`pill ${x.approved ? 'good' : 'critical'}`}>{x.approved ? 'Approved' : 'Rejected'}</span>
                  <div className="dec-main">
                    <p className="dec-title">{p.name} · {x.summary}</p>
                    <p className="dec-meta">{KIND_LABEL[x.kind]} · decided by {x.by} at {time(x.at)}</p>
                    {x.reason && <p className="ap-row-quote">“{x.reason}”</p>}
                  </div>
                  {x.value ? <span className="ap-amount">{rupees(x.value)}</span> : <span />}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
