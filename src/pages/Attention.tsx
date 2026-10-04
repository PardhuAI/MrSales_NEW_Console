import { ArrowClockwise } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { dashboardStore, useDashboard, type Attention as Item } from '../data/dashboard';
import { useApprovals, type Kind } from '../data/approvals';
import { queues } from '../data/queues';
import { useCan } from '../app/access';
import { count } from '../lib/format';
import { Arrive } from '../components/motion';

/**
 * Needs attention: everything in the records that looks wrong, ranked, each
 * with the reason and where to look. The list is the Dashboard's own (one
 * definition, read once), plus the decisions waiting, as in the old console's
 * pullAttention. The words describe the situation, never a verdict on a person.
 */

const GROUPS: { severity: Item['severity']; title: string; about: string }[] = [
  { severity: 'critical', title: 'Act today', about: 'Location and travel the records cannot explain.' },
  { severity: 'warning', title: 'This week', about: 'Work that stalled, people who went quiet, and decisions waiting.' },
  { severity: 'info', title: 'Worth knowing', about: 'Gaps in the client list that stop visits being checked.' },
];

/** What each queue holds, singular and plural, for "1 expense claim, 3 orders". */
const NOUN: Record<Kind, [string, string]> = {
  expense: ['expense claim', 'expense claims'],
  order: ['order', 'orders'],
  tour: ['tour plan', 'tour plans'],
  leave: ['leave request', 'leave requests'],
};

const ago = (d: Date | null) => {
  if (!d) return '';
  const m = Math.round((Date.now() - d.getTime()) / 60_000);
  return m < 1 ? 'just now' : m === 1 ? 'a minute ago' : m < 60 ? `${m} minutes ago` : `${Math.round(m / 60)} hours ago`;
};

export function Attention() {
  const { status, model, error, at } = useDashboard();
  const allowed = useCan();
  const approvals = useApprovals();

  if (status === 'error' && !model) {
    return (
      <div className="dash-state" role="alert">
        <p className="dash-state-title">The list could not be read</p>
        <p className="dash-state-text">{error} Check the connection and try again.</p>
        <button type="button" className="btn btn-secondary" onClick={() => void dashboardStore.load()}>Try again</button>
      </div>
    );
  }
  if (!model) {
    return (
      <div className="dash-loading" aria-busy="true" aria-label="Reading what needs attention">
        <span className="skeleton sk-line" />
        <span className="skeleton sk-block" />
      </div>
    );
  }

  const items: Item[] = [...model.attention];
  // The demo world already names its overdue claims; never say the same thing twice.
  if (allowed('approvals') && approvals.status() === 'ready' && !items.some(i => i.to.startsWith('/approvals'))) {
    const q = queues(approvals.pending());
    const waiting = q.reduce((s, x) => s + x.count, 0);
    if (waiting) {
      const oldest = Math.max(...q.map(x => x.oldestDays));
      items.push({
        id: 'approvals',
        severity: 'warning',
        title: `${count(waiting, 'request')} waiting for a decision`,
        reason: `${q.map(x => count(x.count, NOUN[x.kind][0], NOUN[x.kind][1])).join(', ')}.`
          + (oldest > 5 ? ` The oldest has waited ${count(oldest, 'day')}.` : '')
          + ' A claim is money someone in the field is waiting for.',
        action: 'Decide',
        to: '/approvals',
      });
    }
  }
  const rank = { critical: 0, warning: 1, info: 2 };
  items.sort((a, b) => rank[a.severity] - rank[b.severity]);
  const urgent = items.filter(i => i.severity === 'critical').length;

  return (
    <div className="attn-page">
      <Arrive className="attn-head">
        <p className="eyebrow">
          {model.demo ? (
            <span className="demo-tag">Demo data</span>
          ) : (
            <span className="live-tag">
              Updated {ago(at)}
              <button type="button" className="live-refresh" onClick={() => void dashboardStore.load()} aria-label="Refresh the list">
                <ArrowClockwise size={13} aria-hidden="true" />
              </button>
            </span>
          )}
          {error && <span className="live-error" role="status">The last refresh failed; showing what was read before.</span>}
        </p>
        <p className="attn-lede">
          {items.length === 0
            ? 'Nothing needs you.'
            : urgent
              ? <>{count(items.length, 'thing')} to look at. <span className="attn-lede-strong">{urgent === 1 ? 'One needs' : `${urgent} need`} you today.</span></>
              : <>{count(items.length, 'thing')} to look at, none urgent.</>}
        </p>
        <p className="attn-sub">
          {items.length === 0
            ? 'Fake locations, journeys that do not add up, quiet days, unfinished visits, decisions waiting and gaps in the client list appear here as soon as the records show them.'
            : 'Ranked, most pressing first. Each says what the records show and where to look. A flag is a reason for a conversation, not a conclusion.'}
        </p>
      </Arrive>

      {GROUPS.map((g, gi) => {
        const rows = items.filter(i => i.severity === g.severity);
        if (!rows.length) return null;
        return (
          <Arrive as="section" key={g.severity} className="attn-group" index={gi + 1}>
            <header className="attn-group-head">
              <h2 className="section-title">{g.title}</h2>
              <p className="attn-group-meta">{count(rows.length, 'thing')}</p>
              <p className="attn-group-about">{g.about}</p>
            </header>
            <ol className="attn-list">
              {rows.map(a => (
                <li key={a.id} className="attn-row">
                  <div className="attn-text">
                    <p className="att-title">{a.title}</p>
                    <p className="attn-reason">{a.reason}</p>
                  </div>
                  <Link className="link attn-go" to={a.to}>{a.action}</Link>
                </li>
              ))}
            </ol>
          </Arrive>
        );
      })}
    </div>
  );
}
