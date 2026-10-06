import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, CaretDown, MagnifyingGlass, Paperclip } from '@phosphor-icons/react';
import {
  KIND_LABEL,
  ageDays,
  approvalsStore,
  needsLook,
  requestCount,
  requestKey,
  useApprovals,
  valueOf,
  type ExpenseDay,
  type Kind,
  type LeaveRequest,
  type Order,
  type Pending,
  type Person,
  type TourMonth,
} from '../data/approvals';
import { count, rupees } from '../lib/format';
import { EASE } from '../components/motion';
import { ConfirmDialog, RejectDialog } from '../components/DecisionDialogs';

/**
 * Waiting for you: everything sent for a decision, grouped by the person who
 * sent it.
 *
 * The question an official brings here is "what is waiting, and can I clear it
 * quickly and safely?" So: people on the left, oldest wait first; one person's
 * requests on the right, the ones that need a real look first, the routine
 * ones folded into a single line that can be approved in one go. Every reject
 * asks for a reason. Nothing is decided by accident: approving several at once
 * says exactly what will be approved before it is.
 */

const KINDS: Kind[] = ['expense', 'order', 'tour', 'leave'];

type Group = {
  person: Person;
  items: Pending[];
  value: number;
  oldest: number;
  looks: number;
};

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const monthOf = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { month: 'long' });
const sentAgo = (d: number) => (d === 0 ? 'sent today' : d === 1 ? 'sent yesterday' : `sent ${d} days ago`);

const kindsLine = (items: Pending[]) =>
  KINDS.map(k => {
    const of = items.filter(i => i.kind === k);
    if (!of.length) return null;
    if (k === 'expense') return `${requestCount(of) === 1 ? 'Expense claim' : `${requestCount(of)} expense claims`}, ${count(of.length, 'day')}`;
    return k === 'order' ? count(of.length, 'order') : k === 'tour' ? 'Tour plan' : count(of.length, 'leave request');
  }).filter(Boolean).join(' · ');

export function Approvals() {
  const store = useApprovals();
  const [params, setParams] = useSearchParams();
  const kind = (KINDS as string[]).includes(params.get('kind') ?? '') ? (params.get('kind') as Kind) : 'all';
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<number>();

  const all = store.pending();
  const status = store.status();
  const visible = all.filter(p => kind === 'all' || p.kind === kind);

  const groups = useMemo<Group[]>(() => {
    const byPerson = new Map<string, Pending[]>();
    for (const p of visible) byPerson.set(p.personId, [...(byPerson.get(p.personId) ?? []), p]);
    const q = query.trim().toLowerCase();
    return [...byPerson.entries()]
      .map(([id, items]) => {
        const person = store.person(id);
        return {
          person,
          items,
          value: items.reduce((s, i) => s + valueOf(i), 0),
          oldest: items.reduce((m, i) => Math.max(m, ageDays(i.submittedAt)), 0),
          looks: items.filter(needsLook).length,
        };
      })
      .filter(g => !q || `${g.person.name} ${g.person.hq} ${g.person.territory}`.toLowerCase().includes(q))
      // Oldest wait first: whoever has waited longest is seen first.
      .sort((a, b) => b.oldest - a.oldest || b.looks - a.looks || a.person.name.localeCompare(b.person.name));
  }, [visible, query, store]);

  const selectedId = params.get('person');
  const selected = groups.find(g => g.person.id === selectedId) ?? null;
  const desktop = useDesktop();
  // On a wide screen someone is always open; on a phone the list comes first.
  const open = selected ?? (desktop ? groups[0] ?? null : null);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: key !== 'person' });
  };

  const say = (text: string) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 6000);
  };

  // After the last request of a person is decided, open the next person.
  const afterDecide = (message: string, person: Person) => {
    say(message);
    const left = store.pending().filter(p => p.personId === person.id && (kind === 'all' || p.kind === kind));
    if (!left.length) {
      const next = groups.find(g => g.person.id !== person.id);
      setParam('person', next && desktop ? next.person.id : null);
    }
  };

  const totalValue = visible.reduce((s, p) => s + valueOf(p), 0);
  const overdue = new Set(visible.filter(p => ageDays(p.submittedAt) > 5).map(requestKey)).size;
  const looks = visible.filter(needsLook).length;
  const requests = requestCount(visible);

  return (
    <div className="approvals-page">
      <p className="ap-summary">
        {visible.length === 0 ? (
          'Nothing is waiting for you.'
        ) : (
          <>
            <strong>{count(requests, 'request')}</strong> from {count(groups.length, 'person', 'people')}
            {totalValue > 0 && <> · {rupees(totalValue)}</>}
            {looks > 0 && <> · <span className="ap-look-word">{count(looks, 'item')} to look at closely</span></>}
            {overdue > 0 && <> · <span className="ap-overdue-word">{count(overdue, 'request')} waiting over 5 days</span></>}
          </>
        )}
      </p>

      <div className="ap-toolbar">
        <div className="segmented" role="radiogroup" aria-label="Show">
          <button type="button" role="radio" aria-checked={kind === 'all'} onClick={() => setParam('kind', null)}>
            All <span className="seg-count">{requestCount(all)}</span>
          </button>
          {KINDS.map(k => {
            const n = requestCount(all.filter(p => p.kind === k));
            return (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setParam('kind', k)} disabled={n === 0}>
                {KIND_LABEL[k]} <span className="seg-count">{n}</span>
              </button>
            );
          })}
        </div>
        <label className="field-search">
          <MagnifyingGlass size={15} aria-hidden="true" />
          <span className="visually-hidden">Find a person</span>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a person…" type="search" />
        </label>
      </div>

      <div className="ap-notice" role="status" aria-live="polite">
        <AnimatePresence>
          {notice && (
            <motion.p
              key={notice}
              className="ap-notice-text"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24, ease: EASE }}
            >
              {notice}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {status === 'error' ? (
        <div className="ap-empty" role="alert">
          <p className="ap-empty-title">The approvals could not be read</p>
          <p className="ap-empty-text">{store.error()} Check the connection and try again.</p>
          <button type="button" className="btn btn-secondary ap-retry" onClick={() => void store.load()}>Try again</button>
        </div>
      ) : status !== 'ready' ? (
        <div className="ap-loading" aria-busy="true" aria-label="Reading what is waiting">
          {[0, 1, 2].map(i => <span key={i} className="skeleton" />)}
        </div>
      ) : all.length === 0 ? (
        <div className="ap-empty">
          <p className="ap-empty-title">Nothing is waiting</p>
          <p className="ap-empty-text">
            Expense claims, orders, tour plans and leave appear here as soon as someone sends them.
            What you decided is under Decided.
          </p>
        </div>
      ) : groups.length === 0 ? (
        <div className="ap-empty">
          <p className="ap-empty-title">Nobody matches “{query}”</p>
          <p className="ap-empty-text">Try a first name, a headquarters or a territory.</p>
        </div>
      ) : (
        <div className={`ap-split${open && !desktop ? ' ap-detail-only' : ''}`}>
          <ul className="ap-people" aria-label="People with requests, oldest wait first">
            {groups.map(g => (
              <li key={g.person.id}>
                <button
                  type="button"
                  className="ap-person"
                  aria-current={open?.person.id === g.person.id ? 'true' : undefined}
                  onClick={() => setParam('person', g.person.id)}
                >
                  <span className="ap-person-top">
                    <span className="ap-person-name">{g.person.name}</span>
                    {g.value > 0 && <span className="ap-person-value">{rupees(g.value)}</span>}
                  </span>
                  <span className="ap-person-what">{kindsLine(g.items)}</span>
                  <span className="ap-person-meta">
                    <span className={g.oldest > 5 ? 'ap-overdue-word' : undefined}>{sentAgo(g.oldest)}</span>
                    {g.looks > 0 && <span className="ap-look">{g.looks} to look at</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {open && (
            <PersonPanel
              key={open.person.id}
              group={open}
              onBack={() => setParam('person', null)}
              showBack={!desktop}
              onDecided={afterDecide}
            />
          )}
        </div>
      )}
    </div>
  );
}

function useDesktop() {
  const q = '(min-width: 1024px)';
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

// ── one person's requests ──────────────────────────────────────────────

type Ask =
  | { mode: 'reject'; items: Pending[]; what: string }
  | { mode: 'approve'; items: Pending[]; what: string; lines: string[] };

function PersonPanel({
  group,
  onBack,
  showBack,
  onDecided,
}: {
  group: Group;
  onBack: () => void;
  showBack: boolean;
  onDecided: (message: string, person: Person) => void;
}) {
  const store = useApprovals();
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { person, items } = group;
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (showBack) heading.current?.focus();
  }, [showBack]);

  const byKind = KINDS.map(k => ({ kind: k, items: items.filter(i => i.kind === k) })).filter(x => x.items.length);

  /** Decide, one call per kind, and say what happened in words. */
  const decide = async (list: Pending[], approve: boolean, reason?: string) => {
    setBusy(true);
    setError('');
    try {
      for (const k of KINDS) {
        const ids = list.filter(i => i.kind === k).map(i => i.id);
        if (ids.length) await store.decide(ids, approve, reason);
      }
      setAsk(null);
      onDecided(`${approve ? 'Approved' : 'Rejected'} ${describeList(list)} for ${person.name}.`, person);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const approveAllLines = byKind.map(({ items: ks }) => summaryLine(ks));

  return (
    <section className="ap-panel" aria-labelledby="ap-person-heading">
      {showBack && (
        <button type="button" className="link ap-back" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden="true" /> Everyone waiting
        </button>
      )}

      <header className="ap-panel-head">
        <div>
          <h2 id="ap-person-heading" className="ap-panel-name" tabIndex={-1} ref={heading}>{person.name}</h2>
          <p className="ap-panel-sub">{person.hq} · {person.territory} · reports to {person.manager}</p>
        </div>
        {/* Only when there is more than one kind; otherwise the block's own button says it. */}
        {byKind.length > 1 && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => setAsk({ mode: 'approve', items, what: `everything from ${person.name}`, lines: approveAllLines })}
          >
            Approve all {items.length}
          </button>
        )}
      </header>

      {error && <p className="ap-error" role="alert">{error}</p>}

      <div className="ap-kinds">
        {byKind.map(({ kind, items: ks }) => (
          <KindBlock
            key={kind}
            kind={kind}
            items={ks}
            busy={busy}
            onApprove={(list, what) =>
              list.length === 1
                ? decide(list, true)
                : setAsk({ mode: 'approve', items: list, what, lines: [summaryLine(list)] })
            }
            onReject={(list, what) => setAsk({ mode: 'reject', items: list, what })}
          />
        ))}
      </div>

      <ConfirmDialog
        open={ask?.mode === 'approve'}
        title={ask?.mode === 'approve' ? `Approve ${ask.what}?` : ''}
        lines={ask?.mode === 'approve' ? ask.lines : []}
        confirmLabel={ask?.mode === 'approve' ? `Approve ${ask.items.length}` : ''}
        busy={busy}
        onCancel={() => setAsk(null)}
        onConfirm={() => ask && decide(ask.items, true)}
      />
      <RejectDialog
        open={ask?.mode === 'reject'}
        title={ask?.mode === 'reject' ? `Reject ${ask.what}` : ''}
        kind={ask?.items[0]?.kind ?? 'expense'}
        confirmLabel={ask?.mode === 'reject' ? `Reject ${describeList(ask.items)}` : ''}
        busy={busy}
        error={error}
        onCancel={() => {
          setAsk(null);
          setError('');
        }}
        onConfirm={reason => ask && decide(ask.items, false, reason)}
      />
    </section>
  );
}

const describeList = (list: Pending[]) => {
  const k = list[0]?.kind;
  if (new Set(list.map(i => i.kind)).size > 1) return count(list.length, 'request');
  if (k === 'expense') return count(list.length, 'expense day');
  if (k === 'order') return count(list.length, 'order');
  if (k === 'tour') return list.length === 1 ? 'the tour plan' : count(list.length, 'tour plan');
  return list.length === 1 ? 'the leave request' : count(list.length, 'leave request');
};

/** What will be approved, in one line, and what in it is marked to look at. */
const summaryLine = (list: Pending[]) => {
  const v = list.reduce((s, i) => s + valueOf(i), 0);
  const look = list.filter(needsLook).length;
  const flag = look === 0 ? '' : list[0].kind === 'expense'
    ? `, including ${count(look, 'day')} above the allowance`
    : `, including ${look} marked to look at`;
  return `${describeList(list)}${v ? `, ${rupees(v)}` : ''}${flag}`;
};

function KindBlock({
  kind,
  items,
  busy,
  onApprove,
  onReject,
}: {
  kind: Kind;
  items: Pending[];
  busy: boolean;
  onApprove: (list: Pending[], what: string) => void;
  onReject: (list: Pending[], what: string) => void;
}) {
  if (kind === 'expense') return <ExpenseBlock items={items as ExpenseDay[]} busy={busy} onApprove={onApprove} onReject={onReject} />;
  const total = items.reduce((s, i) => s + valueOf(i), 0);
  return (
    <section className="ap-kind">
      <header className="ap-kind-head">
        <h3 className="ap-kind-title">{KIND_LABEL[kind]}</h3>
        <span className="ap-kind-meta">
          {kind === 'order' ? `${count(items.length, 'order')} · ${rupees(total)}` : null}
        </span>
        {items.length > 1 && (
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => onApprove(items, describeList(items))}>
            Approve all {items.length}
          </button>
        )}
      </header>
      <Rows>
        {items.map(i => (
          <Row key={i.id} item={i} busy={busy} onApprove={() => onApprove([i], describeList([i]))} onReject={() => onReject([i], describeList([i]))}>
            {i.kind === 'order' && <OrderRow o={i} />}
            {i.kind === 'tour' && <TourRow t={i} />}
            {i.kind === 'leave' && <LeaveRow l={i} />}
          </Row>
        ))}
      </Rows>
    </section>
  );
}

function ExpenseBlock({
  items,
  busy,
  onApprove,
  onReject,
}: {
  items: ExpenseDay[];
  busy: boolean;
  onApprove: (list: Pending[], what: string) => void;
  onReject: (list: Pending[], what: string) => void;
}) {
  const [showDays, setShowDays] = useState(false);
  const toCheck = items.filter(needsLook);
  const standard = items.filter(i => !needsLook(i));
  const total = items.reduce((s, i) => s + i.amount, 0);
  const months = [...new Set(items.map(i => monthOf(i.date)))].join(' and ');
  const standardTotal = standard.reduce((s, i) => s + i.amount, 0);
  const checkTotal = toCheck.reduce((s, i) => s + i.amount, 0);

  return (
    <section className="ap-kind">
      <header className="ap-kind-head">
        <h3 className="ap-kind-title">Expense claim, {months}</h3>
        <span className="ap-kind-meta">{count(items.length, 'day')} · {rupees(total)}</span>
        {items.length > 1 && (
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => onApprove(items, `the ${months} claim`)}>
            Approve all {items.length}
          </button>
        )}
      </header>

      {/* How the claim splits: routine days against days that need a look. */}
      {toCheck.length > 0 && standard.length > 0 && (
        <div className="ap-split-bar" role="img" aria-label={`${rupees(standardTotal)} at the allowance, ${rupees(checkTotal)} above it`}>
          <span className="sb-standard" style={{ flexGrow: standardTotal }} />
          <span className="sb-check" style={{ flexGrow: checkTotal }} />
        </div>
      )}

      {toCheck.length > 0 && (
        <>
          <p className="ap-sub-title">Above the {rupees(toCheck[0].allowance ?? approvalsStore.allowance())} allowance · {count(toCheck.length, 'day')} to look at</p>
          <Rows>
            {toCheck.map(i => (
              <Row key={i.id} item={i} busy={busy} look onApprove={() => onApprove([i], 'this day')} onReject={() => onReject([i], `${dayLabel(i.date)}`)}>
                <div className="ap-row-main">
                  <p className="ap-row-title">{dayLabel(i.date)} · {i.station}</p>
                  <p className="ap-row-text">{i.categories.join(', ')}</p>
                  {i.reason && <p className="ap-row-quote">“{i.reason}”</p>}
                  {i.bills.length > 0 ? (
                    <Bills paths={i.bills} />
                  ) : i.bill ? (
                    <p className="ap-row-bill"><Paperclip size={13} aria-hidden="true" /> {i.bill}</p>
                  ) : (
                    <p className="ap-row-bill ap-look-word">No bill attached</p>
                  )}
                </div>
                <div className="ap-row-figure">
                  <span className="ap-amount">{rupees(i.amount)}</span>
                  <span className="ap-amount-note">{rupees(i.amount - (i.allowance ?? approvalsStore.allowance()))} over</span>
                </div>
              </Row>
            ))}
          </Rows>
        </>
      )}

      {standard.length > 0 && (
        <div className="ap-standard">
          <div className="ap-standard-line">
            <button type="button" className="ap-standard-toggle" aria-expanded={showDays} onClick={() => setShowDays(s => !s)}>
              <CaretDown size={12} weight="bold" className="caret" aria-hidden="true" />
              <span>
                <strong>{count(standard.length, 'day')} at the allowance</strong> · {rupees(standardTotal)} · no bill needed
              </span>
            </button>
            {toCheck.length > 0 && (
              <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => onApprove(standard, count(standard.length, 'standard day'))}>
                Approve these {standard.length}
              </button>
            )}
          </div>
          {showDays && (
            <ul className="ap-days">
              {standard.map(i => (
                <li key={i.id}>
                  <span>{dayLabel(i.date)}</span>
                  <span className="ap-days-station">{i.station}</span>
                  <span className="ap-days-amount">{rupees(i.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return (
    <ul className="ap-rows">
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </ul>
  );
}

function Row({
  item,
  look,
  busy,
  onApprove,
  onReject,
  children,
}: {
  item: Pending;
  look?: boolean;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const flagged = look ?? needsLook(item);
  return (
    <motion.li
      layout={!reduce}
      className={`ap-row${flagged ? ' look' : ''}`}
      data-request={item.id}
      exit={reduce ? { opacity: 0 } : { opacity: 0, x: 12 }}
      transition={{ duration: 0.24, ease: EASE }}
    >
      {children}
      <div className="ap-row-actions">
        <button type="button" className="text-btn" disabled={busy} onClick={onReject}>Reject</button>
        <button type="button" className="text-btn strong" disabled={busy} onClick={onApprove}>Approve</button>
      </div>
    </motion.li>
  );
}

function OrderRow({ o }: { o: Order }) {
  const high = o.slab !== undefined && o.discount > o.slab;
  return (
    <>
      <div className="ap-row-main">
        <p className="ap-row-title">{o.client}</p>
        <p className="ap-row-text">{o.number} · {count(o.lines, 'product')} · from {o.stockist}</p>
        <p className={`ap-row-text${high ? ' ap-look-word' : ''}`}>
          {o.discount}% discount{high ? `, above the ${o.slab}% slab for this stockist` : ''}
        </p>
      </div>
      <div className="ap-row-figure">
        <span className="ap-amount">{rupees(o.value)}</span>
      </div>
    </>
  );
}

function TourRow({ t }: { t: TourMonth }) {
  const gap = t.workingDays - t.plannedDays;
  return (
    <div className="ap-row-main">
      <p className="ap-row-title">{t.month}</p>
      <p className="ap-row-text">
        {t.plannedDays} of {t.workingDays} working days planned · {count(t.clients, 'client visit')} · {count(t.outstation, 'day')} outstation
      </p>
      {gap > 0 && <p className="ap-row-text ap-look-word">{count(gap, 'working day')} with nothing planned</p>}
    </div>
  );
}

function LeaveRow({ l }: { l: LeaveRequest }) {
  const same = l.from === l.to;
  return (
    <div className="ap-row-main">
      <p className="ap-row-title">{l.leaveType}, {count(l.days, 'day')}</p>
      <p className="ap-row-text">
        {same ? dayLabel(l.from) : `${dayLabel(l.from)} to ${dayLabel(l.to)}`}
        {l.balanceAfter !== undefined && <> · {l.balanceAfter} left after this</>}
      </p>
      <p className="ap-row-quote">“{l.reason}”</p>
    </div>
  );
}

/** Each bill opens in a new tab through a short-lived signed link. */
function Bills({ paths }: { paths: string[] }) {
  const [error, setError] = useState('');
  const open = async (path: string) => {
    setError('');
    // Opened first, filled after: browsers block a tab opened after an await.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const url = await approvalsStore.billUrl(path);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch (e) {
      tab?.close();
      setError(e instanceof Error ? e.message : 'The bill could not be opened.');
    }
  };
  return (
    <div className="ap-bills">
      {paths.map((p, i) => (
        <button key={p} type="button" className="ap-bill" onClick={() => void open(p)}>
          <Paperclip size={13} aria-hidden="true" /> {paths.length === 1 ? 'Open the bill' : `Bill ${i + 1}`}
        </button>
      ))}
      {error && <span className="ap-bill-error" role="alert">{error}</span>}
    </div>
  );
}
