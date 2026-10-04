import type { ApprovalsSource, Decision, Pending } from '../data/approvals';
import { valueOf } from '../data/approvals';
import { DEMO_ALLOWANCE, DEMO_NOW, demoDecided, demoPeople, demoPending } from './approvals';

/** The demo queue in memory: deciding removes it here and writes a Decision. */
let pending: Pending[] = [...demoPending];
let decided: Decision[] = [...demoDecided];

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });

const describe = (items: Pending[]) => {
  const first = items[0];
  switch (first.kind) {
    case 'expense':
      return items.length === 1 ? `${fmtDay(first.date)} · expense day` : `${items.length} expense days`;
    case 'order':
      return items.length === 1 ? `${first.number} · ${first.client}` : `${items.length} orders`;
    case 'tour':
      return first.month;
    case 'leave':
      return `${first.leaveType}, ${first.days} ${first.days === 1 ? 'day' : 'days'}`;
  }
};

export const demoApprovals: ApprovalsSource = {
  async load() {
    return {
      pending,
      decided,
      people: new Map(demoPeople.map(p => [p.id, p])),
      allowance: DEMO_ALLOWANCE,
      now: DEMO_NOW,
    };
  },
  async decide(items, approve, reason) {
    const ids = new Set(items.map(i => i.id));
    pending = pending.filter(p => !ids.has(p.id));
    const value = items.reduce((s, i) => s + valueOf(i), 0);
    decided = [
      {
        id: `d-${Date.now()}`,
        kind: items[0].kind,
        personId: items[0].personId,
        summary: describe(items),
        value: value || undefined,
        approved: approve,
        reason,
        by: 'Pardhu Karnati',
        at: new Date().toISOString(),
      },
      ...decided,
    ];
  },
  async billUrl() {
    throw new Error('The demo has no bill files.');
  },
};
