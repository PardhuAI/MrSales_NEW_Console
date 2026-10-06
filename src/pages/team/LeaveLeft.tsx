import { Link } from 'react-router-dom';
import { useResource } from '../../data/resource';
import { LEAVE_TYPES, leaveLabel, loadLeaveBalances, type LeaveBalance } from '../../live/team';
import { IST_TODAY } from '../../lib/days';

const days = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** One person's leave left this year, by type, on their record. */
export function LeaveLeft({ personId }: { personId: string }) {
  const year = Number(IST_TODAY().slice(0, 4));
  const r = useResource<LeaveBalance[]>(`team:person:${personId}:leave-left:${year}`, () => loadLeaveBalances(year, personId));
  const tracked = (r.data ?? []).filter(b => b.tracked).sort((a, b) => LEAVE_TYPES.indexOf(a.type as never) - LEAVE_TYPES.indexOf(b.type as never));
  if (!r.data) return null;
  if (tracked.length === 0) return <p className="block-note">No leave type has a yearly allowance, so nothing is counted. <Link className="link" to="/settings/hr">HR rules</Link></p>;
  return (
    <dl className="facts leave-left" aria-label={`Leave left in ${year}`}>
      {tracked.map(b => (
        <div key={b.type} className="leave-left-row">
          <dt>{leaveLabel(b.type)}</dt>
          <dd>
            {b.left < 0 ? <span className="warn-text">over by {days(-b.left)}</span> : <strong>{days(b.left)} left</strong>}
            <span className="cell-sub">{[`of ${days(b.allowed)} in ${year}`, b.adjusted > 0 && `${days(b.adjusted)} added`, b.adjusted < 0 && `${days(-b.adjusted)} taken off`, b.taken > 0 && `${days(b.taken)} taken`, b.waiting > 0 && `${days(b.waiting)} waiting`].filter(Boolean).join(', ')}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
