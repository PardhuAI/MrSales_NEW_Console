import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CaretDown, CaretRight } from '@phosphor-icons/react';
import { invalidate, useResource } from '../../data/resource';
import { changeManager, loadRoster, type Person, type RosterModel } from '../../live/team';
import { IST_TODAY, dayMonth } from '../../lib/days';
import { count } from '../../lib/format';
import { Drawer, Field, Notice, Pill, SearchBox, Summary, Toolbar, useFocusFirstError } from '../../components/kit';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useMe } from '../../live/session';
import { ManagerDrawer } from './PersonRecord';
import { mayManagePeople } from './People';

/**
 * The org chart: who reports to whom, as a tree, and moving people between
 * managers. Reporting is dated, so every move leaves a trail, and nothing
 * moves until it has been read back and confirmed with a reason.
 */
export function OrgChart() {
  const r = useResource<RosterModel>('team:roster', loadRoster);
  if (r.status === 'error' && !r.data) return <LoadError what="The org chart" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Drawing the org chart" lines={1} />;
  return <View m={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function View({ m, at, error, reload }: { m: RosterModel; at: Date | null; error: string; reload: () => void }) {
  const me = useMe();
  const may = mayManagePeople(me.role);
  const [q, setQ] = useState('');
  const [moving, setMoving] = useState<Person | null>(null);
  const [bulk, setBulk] = useState(false);
  const [notice, setNotice] = useState('');
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const active = m.people.filter(p => p.status === 'active');
  const byManager = useMemo(() => {
    const map = new Map<string, Person[]>();
    for (const p of active) if (p.managerId) map.set(p.managerId, [...(map.get(p.managerId) ?? []), p]);
    for (const l of map.values()) l.sort((a, b) => b.reports - a.reports || a.name.localeCompare(b.name));
    return map;
  }, [active]);
  const ids = new Set(active.map(p => p.id));
  const roots = active.filter(p => !p.managerId || !ids.has(p.managerId)).sort((a, b) => b.reports - a.reports || a.name.localeCompare(b.name));
  const tops = roots.filter(p => p.reports > 0 || p.role === 'ASM');
  const alone = roots.filter(p => !(p.reports > 0 || p.role === 'ASM') && p.role);
  const office = roots.filter(p => !p.role && p.reports === 0);
  const needle = q.trim().toLowerCase();
  const matches = (p: Person): boolean => !needle || `${p.name} ${p.code} ${p.hq}`.toLowerCase().includes(needle) || (byManager.get(p.id) ?? []).some(matches);
  const toggle = (id: string) => setClosed(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const done = (msg: string) => { setMoving(null); setBulk(false); setNotice(msg); invalidate('team:', 'home:', 'field:'); };

  const node = (p: Person, depth: number): JSX.Element | null => {
    if (!matches(p)) return null;
    const kids = byManager.get(p.id) ?? [];
    const open = !closed.has(p.id) || Boolean(needle);
    return (
      <li key={p.id} className="org-node" style={{ ['--d' as string]: depth }}>
        <div className="org-row">
          {kids.length ? (
            <button type="button" className="org-toggle" aria-expanded={open} aria-label={`${open ? 'Fold' : 'Open'} ${p.name}'s team`} onClick={() => toggle(p.id)}>{open ? <CaretDown size={12} /> : <CaretRight size={12} />}</button>
          ) : <span className="org-toggle" aria-hidden="true" />}
          <span className="org-who">
            <Link className="cell-link" to={`/team/${p.id}`}>{p.name}</Link>
            <span className="cell-sub">{[p.designation, p.hq, kids.length ? count(kids.length, 'report') : ''].filter(Boolean).join(' · ')}</span>
          </span>
          {may && p.role && <button type="button" className="link org-move" onClick={() => setMoving(p)}>Move</button>}
        </div>
        {kids.length > 0 && open && <ul className="org-list">{kids.map(k => node(k, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read the org chart again" />}>
        {active.length === 0 ? 'Nobody is on the roster yet.' : <>
          <strong>{count(tops.length, 'line', 'lines')} of reporting</strong> covering {count(active.length - office.length - alone.length, 'person', 'people')}.
          {alone.length ? <> <span className="warn-text">{count(alone.length, 'person reports', 'people report')} to nobody</span>, so their leave and claims have nobody to decide them.</> : ' Everyone in the field reports to somebody.'}
        </>}
      </Summary>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Find a person in the chart" label="Find a person" />
        {may && <button type="button" className="btn btn-secondary btn-small" onClick={() => setBulk(true)}>Move a whole team</button>}
      </Toolbar>
      {active.length === 0 ? <Empty title="Nobody to chart yet">Add your managers first, then the people who report to them.</Empty> : (
        <Arrive>
          {alone.length > 0 && (
            <section className="block org-alone">
              <div className="block-head"><h2 className="section-title">Reporting to nobody</h2><Pill tone="warning">{count(alone.length, 'person', 'people')}</Pill></div>
              <ul className="org-list">{alone.map(p => node(p, 0))}</ul>
            </section>
          )}
          <section className="block">
            {alone.length > 0 && <div className="block-head"><h2 className="section-title">The reporting line</h2></div>}
            <ul className="org-list org-tree">{tops.map(p => node(p, 0))}</ul>
          </section>
          {office.length > 0 && (
            <section className="block">
              <div className="block-head"><h2 className="section-title">In the office</h2><span className="block-meta">no phone app, so outside the reporting line</span></div>
              <ul className="org-list">{office.map(p => node(p, 0))}</ul>
            </section>
          )}
        </Arrive>
      )}
      {moving && <ManagerDrawer open p={moving} m={m} onClose={() => setMoving(null)} onDone={done} />}
      <BulkMove open={bulk} m={m} onClose={() => setBulk(false)} onDone={done} />
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

/** Everyone under one manager moves to another, each with the same date and reason, after a read-back. */
function BulkMove({ open, m, onClose, onDone }: { open: boolean; m: RosterModel; onClose: () => void; onDone: (msg: string) => void }) {
  const today = IST_TODAY();
  const managers = m.people.filter(p => p.status === 'active' && p.role === 'ASM').sort((a, b) => a.name.localeCompare(b.name));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState('');
  const [step, setStep] = useState<'pick' | 'review'>('pick');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { if (open) { setFrom(''); setTo(''); setDate(today); setReason(''); setStep('pick'); setProblem(''); setAttempt(0); } }, [open, today]);
  const team = m.people.filter(p => p.status === 'active' && p.managerId === from);
  const errors = {
    from: !from ? 'Choose whose team moves.' : !team.length ? 'Nobody reports to them.' : undefined,
    to: !to ? 'Choose the new manager.' : to === from ? 'Choose a different manager.' : team.some(t => t.id === to) ? 'Someone cannot manage the team they are moving with.' : undefined,
    reason: reason.trim().length < 3 ? 'Write why; it changes who approves their money.' : undefined,
  };
  const formRef = useFocusFirstError(errors, attempt);
  const fromName = managers.find(x => x.id === from)?.name ?? '';
  const toName = managers.find(x => x.id === to)?.name ?? '';
  const run = async () => {
    setBusy(true);
    setProblem('');
    let moved = 0;
    try {
      for (const p of team) {
        await changeManager(p.id, to, date, null, reason.trim());
        moved++;
      }
      onDone(`${count(moved, 'person', 'people')} moved from ${fromName} to ${toName}${date === today ? '' : ` from ${dayMonth(date)}`}.`);
    } catch (e) {
      setProblem(`${moved ? `${count(moved, 'person was', 'people were')} moved, then it stopped: ` : ''}${e instanceof Error ? e.message : String(e)}`);
      if (moved) invalidate('team:');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} title="Move a whole team" sub="Everyone under one manager goes to another, each with the same date and reason."
      footer={step === 'pick'
        ? <><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" onClick={() => { setAttempt(a => a + 1); if (!Object.values(errors).some(Boolean)) setStep('review'); }}>Review the move</button></>
        : <><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setStep('pick')}>Back</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run()}>{busy ? 'Moving…' : `Move ${count(team.length, 'person', 'people')}`}</button></>}>
      {step === 'pick' ? (
        <form ref={formRef} className="form" noValidate onSubmit={e => e.preventDefault()}>
          <Field label="Move everyone under" error={attempt ? errors.from : undefined}>{x => <select {...x} className="input" value={from} onChange={e => setFrom(e.target.value)}><option value="">Choose a manager</option>{managers.map(p => <option key={p.id} value={p.id}>{p.name} ({p.reports})</option>)}</select>}</Field>
          <Field label="To" error={attempt ? errors.to : undefined}>{x => <select {...x} className="input" value={to} onChange={e => setTo(e.target.value)}><option value="">Choose a manager</option>{managers.filter(p => p.id !== from).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}</Field>
          <Field label="From">{x => <input {...x} type="date" className="input" min={today} value={date} onChange={e => setDate(e.target.value)} />}</Field>
          <Field label="Why" error={attempt ? errors.reason : undefined}>{x => <textarea {...x} className="input textarea" rows={3} value={reason} placeholder="For example: Ravi moves to the Guntur territory." onChange={e => setReason(e.target.value)} />}</Field>
        </form>
      ) : (
        <div className="form">
          <p className="form-note"><strong>Nothing is saved until you confirm.</strong> {count(team.length, 'person', 'people')} will report to {toName} {date === today ? 'from today' : `from ${dayMonth(date)}`}, instead of {fromName}. Each move is dated and kept on record.</p>
          <ul className="rows">{team.map(p => <li key={p.id} className="row"><div className="row-main"><p className="row-title">{p.name}</p><p className="row-sub">{p.designation} · {p.hq}</p></div></li>)}</ul>
          <p className="form-help">Reason: “{reason.trim()}”</p>
          {problem && <p className="form-error" role="alert">{problem}</p>}
        </div>
      )}
    </Drawer>
  );
}
