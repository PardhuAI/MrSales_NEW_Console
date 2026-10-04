import { KIND_LABEL, ageDays, requestCount, valueOf, type Kind, type Pending } from './approvals';

/** The queue by kind, computed once from what is pending: the Dashboard and the top bar read this. */
export type Queue = { kind: Kind; label: string; count: number; days: number; value: number; oldestDays: number };

const ORDER: Kind[] = ['expense', 'order', 'tour', 'leave'];

export function queues(pending: Pending[]): Queue[] {
  return ORDER.map(kind => {
    const items = pending.filter(p => p.kind === kind);
    return {
      kind,
      label: kind === 'tour' && items[0]?.kind === 'tour' ? `Tour plans for ${items[0].month.split(' ')[0]}` : KIND_LABEL[kind],
      count: requestCount(items),
      days: items.length,
      value: items.reduce((s, i) => s + valueOf(i), 0),
      oldestDays: items.reduce((m, i) => Math.max(m, ageDays(i.submittedAt)), 0),
    };
  }).filter(q => q.count > 0);
}
