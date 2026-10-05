import { useEffect, useMemo, useState, type DragEvent as ReactDragEvent } from 'react';
import { Link } from 'react-router-dom';
import { DotsSixVertical } from '@phosphor-icons/react';
import { changeManager, type Person, type RosterModel } from '../../live/team';
import { IST_TODAY, dayMonth } from '../../lib/days';
import { count } from '../../lib/format';
import { Drawer, Field, Pill, useFocusFirstError } from '../../components/kit';

/**
 * The reporting line as a board, the way the old console had it: one column
 * per manager, a card per person, and a card dragged onto another column.
 *
 * A drag is a gesture; a reassignment is a decision. Drops only stage. Nothing
 * is written until the batch is reviewed and given a date and a reason,
 * because a move changes who approves someone's leave and money.
 * The tree view keeps its Move buttons for the keyboard and the phone.
 */

type Staged = Record<string, string | null>;
type Problem = { id: string; refuse: boolean; text: string };

export function OrgBoard({ m, may, needle, onSaved }: { m: RosterModel; may: boolean; needle: string; onSaved: (msg: string) => void }) {
  const [staged, setStaged] = useState<Staged>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [review, setReview] = useState(false);

  const active = m.people.filter(p => p.status === 'active');
  const byId = useMemo(() => new Map(m.people.map(p => [p.id, p])), [m.people]);
  const managers = active.filter(p => p.role === 'ASM').sort((a, b) => a.name.localeCompare(b.name));
  // Cards are whoever can sit under a manager: field people, and managers who report to a senior one.
  const cards = active.filter(p => p.role === 'MR' || p.role === 'ASM');
  const columnOf = (p: Person) => (p.id in staged ? staged[p.id] : p.managerId);
  const inColumn = (managerId: string | null) => cards.filter(c => columnOf(c) === managerId && c.id !== managerId);

  const moves = Object.entries(staged)
    .filter(([id, to]) => (byId.get(id)?.managerId ?? null) !== to)
    .map(([id, to]) => ({ id, to }));

  /** Counting moves already staged, would `id` end up under somebody who reports to them? */
  const closesCircle = (id: string, to: string | null) => {
    const seen = new Set([id]);
    let cur = to;
    while (cur) {
      if (seen.has(cur)) return true;
      seen.add(cur);
      cur = cur in staged ? staged[cur] : byId.get(cur)?.managerId ?? null;
    }
    return false;
  };
  const problems: Problem[] = moves.flatMap(({ id, to }) => {
    const p = byId.get(id)!;
    const out: Problem[] = [];
    if (to && closesCircle(id, to)) out.push({ id, refuse: true, text: `${p.name} would report to somebody who reports to them.` });
    if (!to) out.push({ id, refuse: false, text: `${p.name} would report to nobody, so their leave, tour plan and claims would wait with no one to decide them.` });
    return out;
  });

  const stage = (id: string, to: string | null) => {
    if (to === id) return;
    const real = byId.get(id)?.managerId ?? null;
    setStaged(s => {
      const next = { ...s };
      // Back where they started is no change; keeping it would ask for a reason to do nothing.
      if (to === real) delete next[id];
      else next[id] = to;
      return next;
    });
  };

  // While a card is dragged, the page scrolls when the pointer nears the top
  // or bottom of the window. Browsers do this unevenly for a drag, and a
  // column below the fold could not otherwise be reached.
  useEffect(() => {
    if (!dragging) return;
    let y = -1;
    let frame = 0;
    const EDGE = 90;
    const track = (e: DragEvent) => { y = e.clientY; };
    const step = () => {
      if (y >= 0) {
        const h = window.innerHeight;
        const speed = y < EDGE ? -(EDGE - y) / 4 : y > h - EDGE ? (y - (h - EDGE)) / 4 : 0;
        if (speed) window.scrollBy(0, speed);
      }
      frame = requestAnimationFrame(step);
    };
    document.addEventListener('dragover', track);
    frame = requestAnimationFrame(step);
    return () => { document.removeEventListener('dragover', track); cancelAnimationFrame(frame); };
  }, [dragging]);

  // A staged batch is unfinished work; leaving the page would lose it.
  useEffect(() => {
    if (!moves.length) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [moves.length]);

  const shows = (p: Person) => !needle || `${p.name} ${p.code} ${p.hq}`.toLowerCase().includes(needle);
  const drop = (to: string | null) => (e: ReactDragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id && byId.has(id)) stage(id, to);
    setOver(null);
    setDragging(null);
  };
  const dragged = dragging ? byId.get(dragging) : null;

  const column = (manager: Person | null) => {
    const key = manager?.id ?? 'none';
    const team = inColumn(manager?.id ?? null);
    const fieldAlone = !manager && team.some(c => c.role === 'MR');
    const canLand = may && dragged && dragged.id !== manager?.id;
    return (
      <section
        key={key}
        className={`board-col${over === key && canLand ? ' is-over' : ''}${manager ? '' : ' is-nobody'}`}
        aria-label={manager ? `${manager.name}'s team` : 'Reporting to nobody'}
        onDragOver={may ? e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== key) setOver(key); } : undefined}
        onDragLeave={may ? e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); } : undefined}
        onDrop={may ? drop(manager?.id ?? null) : undefined}
      >
        <header className="board-head">
          <div className="board-who">
            {manager ? (
              <>
                <Link className="cell-link" to={`/team/${manager.id}`}>{manager.name}</Link>
                <span className="cell-sub">{[manager.code, manager.hq].filter(Boolean).join(' · ')}</span>
              </>
            ) : (
              <>
                <strong>Reporting to nobody</strong>
                <span className="cell-sub">
                  {fieldAlone ? 'Someone here has nobody to approve their leave or claims.' : team.length ? 'Managers at the top of the line.' : 'Empty, as it should be.'}
                </span>
              </>
            )}
          </div>
          <div className="board-meta">
            {fieldAlone ? <Pill tone="warning">{count(team.length, 'person', 'people')}</Pill> : <span className="board-count">{count(team.length, 'person', 'people')}</span>}
          </div>
        </header>
        <ul className="board-body">
          {team.length === 0 && <li className="board-empty">{manager ? 'No reports yet. Drop someone here.' : 'Nobody.'}</li>}
          {team.filter(shows).map(c => {
            const moved = (c.managerId ?? null) !== columnOf(c);
            const was = c.managerId ? byId.get(c.managerId)?.name.split(' ')[0] : 'nobody';
            return (
              <li
                key={c.id}
                className={`board-card${moved ? ' is-moved' : ''}${dragging === c.id ? ' is-dragging' : ''}`}
                draggable={may}
                onDragStart={may ? e => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; setDragging(c.id); } : undefined}
                onDragEnd={() => { setDragging(null); setOver(null); }}
              >
                {may && <DotsSixVertical className="board-grip" size={16} aria-hidden="true" />}
                <span className="board-card-main">
                  <span className="board-name">{c.name}{c.role === 'ASM' && <span className="board-tag">Manager</span>}</span>
                  <span className="cell-sub">{[c.code, c.hq].filter(Boolean).join(' · ')}</span>
                  {moved && <span className="board-was">Was under {was}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  const refusals = problems.filter(p => p.refuse);
  return (
    <>
      {may && (moves.length > 0 ? (
        <div className={`board-stage${refusals.length ? ' is-bad' : ''}`} role="status">
          <p>
            <strong>{count(moves.length, 'change')} staged, nothing saved yet.</strong>{' '}
            {refusals.length ? `${count(refusals.length, 'change')} cannot be made; the review says why.` : 'The review adds the date and the reason.'}
          </p>
          <div className="board-stage-actions">
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setStaged({})}>Discard</button>
            <button type="button" className="btn btn-primary btn-small" onClick={() => setReview(true)}>Review {count(moves.length, 'change')}</button>
          </div>
        </div>
      ) : (
        <p className="form-help board-hint">Drag a person onto another manager's column. Nothing is saved until you review the changes.</p>
      ))}
      <div className="board-scroll">
        <div className="board">
          {managers.map(column)}
          {column(null)}
        </div>
      </div>
      <ReviewMoves open={review} moves={moves} byId={byId} problems={problems} onClose={() => setReview(false)}
        onSaved={msg => { setStaged({}); setReview(false); onSaved(msg); }} onPartial={() => setStaged({})} />
    </>
  );
}

/** The batch, read back with its consequences, then saved one dated move at a time. */
function ReviewMoves({ open, moves, byId, problems, onClose, onSaved, onPartial }: {
  open: boolean; moves: { id: string; to: string | null }[]; byId: Map<string, Person>; problems: Problem[];
  onClose: () => void; onSaved: (msg: string) => void; onPartial: () => void;
}) {
  const today = IST_TODAY();
  const [from, setFrom] = useState(today);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { if (open) { setProblem(''); setAttempt(0); } }, [open]);
  const refusals = problems.filter(p => p.refuse);
  const warnings = problems.filter(p => !p.refuse);
  const errors = {
    reason: reason.trim().length < 3 ? 'Write why; it changes who approves their money.' : undefined,
  };
  const formRef = useFocusFirstError(errors, attempt);
  const name = (id: string | null) => (id ? byId.get(id)?.name ?? 'somebody' : 'nobody');

  const save = async () => {
    setAttempt(a => a + 1);
    if (refusals.length || errors.reason) return;
    setBusy(true);
    setProblem('');
    const done: string[] = [];
    try {
      for (const mv of moves) {
        await changeManager(mv.id, mv.to, from, null, reason.trim());
        done.push(name(mv.id));
      }
      const when = from === today ? '' : ` from ${dayMonth(from)}`;
      onSaved(moves.length === 1
        ? `${done[0]} now reports to ${name(moves[0].to)}${when}.`
        : `${count(done.length, 'change')} to the reporting line saved${when}.`);
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      setProblem(done.length ? `${done.join(', ')} moved; the next one was refused: ${why}` : why);
      if (done.length) onPartial();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onClose={onClose} title={`${count(moves.length, 'change')} to the reporting line`} sub="Nothing is saved until you confirm. Each move is dated, so the old line stays on record."
      footer={<><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>Back to the board</button>
        <button type="button" className="btn btn-primary" disabled={busy || refusals.length > 0} onClick={() => void save()}>{busy ? 'Saving…' : `Save ${count(moves.length, 'change')}`}</button></>}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        {refusals.length > 0 && (
          <div className="form-error" role="alert">
            <strong>{count(refusals.length, 'change')} cannot be made.</strong> {refusals.map(r => r.text).join(' ')}
          </div>
        )}
        <ul className="rows">
          {moves.map(mv => {
            const p = byId.get(mv.id)!;
            return (
              <li key={mv.id} className="row">
                <div className="row-main">
                  <p className="row-title">{p.name}</p>
                  <p className="row-sub">From {name(p.managerId)} to {name(mv.to)}{p.clients ? `, keeps ${count(p.clients, 'client')}` : ''}</p>
                </div>
              </li>
            );
          })}
        </ul>
        {warnings.length > 0 && <div className="form-note">{warnings.map(w => <p key={w.id + w.text}>{w.text}</p>)}</div>}
        <Field label="From" help="Not before today: past approvals keep who made them.">{x => <input {...x} type="date" className="input" min={today} value={from} onChange={e => setFrom(e.target.value)} />}</Field>
        <Field label="Why" error={attempt ? errors.reason : undefined}>{x => <textarea {...x} className="input textarea" rows={3} value={reason} placeholder="For example: Kavya is on leave from 1 November." onChange={e => setReason(e.target.value)} />}</Field>
        {problem && <p className="form-error" role="alert">{problem}</p>}
      </form>
    </Drawer>
  );
}
