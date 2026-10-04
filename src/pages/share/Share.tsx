import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Plus } from '@phosphor-icons/react';
import { invalidate, useResource } from '../../data/resource';
import {
  CATEGORY_WORD, NOTIFICATION_KIND, RESOURCE_ACCEPT, RESOURCE_CATEGORIES, archiveResource, createSurvey, deleteResource,
  loadResources, loadSent, loadSurveys, publishResource, resourceProblem, resourceUrl, setSurveyOpen,
  type Resource, type Sent, type Survey,
} from '../../live/share';
import { ago, dayMonth, dayOf, timeOf } from '../../lib/days';
import { count, percent } from '../../lib/format';
import { openFile } from '../../lib/openFile';
import { Confirm, Drawer, Field, Filter, Notice, Pill, SearchBox, Summary, Toolbar, useFocusFirstError, useShowMore } from '../../components/kit';
import { Segmented } from '../../components/Segmented';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useMe } from '../../live/session';

const size = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const mayPublish = (role: string) => ['owner', 'admin', 'hr'].includes(role);

// ── resources ─────────────────────────────────────────────────────────

/** Resources: what is on every phone now, the versions it replaced, and what was taken off. */
export function Resources() {
  const r = useResource<Resource[]>('share:resources', loadResources);
  if (r.status === 'error' && !r.data) return <LoadError what="The resources" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading the resources" lines={1} />;
  return <ResourcesView list={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function ResourcesView({ list, at, error, reload }: { list: Resource[]; at: Date | null; error: string; reload: () => void }) {
  const me = useMe();
  const may = mayPublish(me.role);
  const [show, setShow] = useState<Resource['status']>('active');
  const [q, setQ] = useState('');
  const loc = useLocation();
  const nav = useNavigate();
  const [upload, setUploadState] = useState<Resource | 'new' | null>(loc.pathname.endsWith('/new') ? 'new' : null);
  const setUpload = (v: Resource | 'new' | null) => { setUploadState(v); if (!v && loc.pathname.endsWith('/new')) nav('/share', { replace: true }); };
  const [ask, setAsk] = useState<{ r: Resource; act: 'archive' | 'delete' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const by = (s: Resource['status']) => list.filter(r => r.status === s);
  const live = by('active');
  const newest = live[0];
  const rows = list.filter(r => r.status === show).filter(r => !q.trim() || `${r.title} ${r.file} ${r.description}`.toLowerCase().includes(q.trim().toLowerCase()));
  const groups = RESOURCE_CATEGORIES.map(c => ({ c, items: rows.filter(r => r.category === c) })).filter(g => g.items.length);
  const done = (msg: string) => { setNotice(msg); invalidate('share:'); };
  const act = async () => {
    if (!ask) return;
    setBusy(true);
    setProblem('');
    try {
      if (ask.act === 'archive') {
        await archiveResource(ask.r.id);
        done(`${ask.r.title} is off every phone. It stays on record under Taken off.`);
      } else {
        const n = await deleteResource(ask.r.id);
        done(`${ask.r.title} is deleted, ${count(n, 'version')} and ${n === 1 ? 'its file' : 'their files'}.`);
      }
      setAsk(null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const open = (r: Resource) => { setProblem(''); openFile(() => resourceUrl(r.path)).catch(e => setProblem(e instanceof Error ? e.message : String(e))); };

  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read the resources again" />}>
        {list.length === 0 ? 'Nothing has been sent to the phones yet.' : <>
          <strong>{count(live.length, 'file')} on every phone.</strong>
          {newest ? ` The newest is ${newest.title}, sent ${ago(newest.at)}.` : ''}
          {by('superseded').length ? ` ${count(by('superseded').length, 'older version')} kept on record.` : ''}
        </>}
      </Summary>
      <Toolbar>
        {may && <button type="button" className="btn btn-primary btn-small" onClick={() => setUpload('new')}><Plus size={14} weight="bold" aria-hidden="true" /> Send a file to the phones</button>}
        <SearchBox value={q} onChange={setQ} placeholder="Title or file name" label="Find a file" />
        <Segmented label="Show" value={show} onChange={setShow} options={[{ value: 'active', label: 'On the phones', count: live.length }, { value: 'superseded', label: 'Older versions', count: by('superseded').length }, { value: 'archived', label: 'Taken off', count: by('archived').length }]} />
      </Toolbar>
      {problem && !ask && <p className="form-error" role="alert">{problem}</p>}
      {list.length === 0 ? <Empty title="Nothing on the phones yet">Visual aids, price lists and training files sent from here appear on every phone, in the category you choose.</Empty>
        : groups.length === 0 ? <div className="list-empty"><Empty title="Nothing here">{q ? 'No file matches.' : show === 'superseded' ? 'No file has been replaced yet.' : 'Nothing has been taken off the phones.'}</Empty></div> : (
          <Arrive className="res-groups">
            {groups.map(g => (
              <section key={g.c} className="res-group">
                <h2 className="fig-title">{CATEGORY_WORD[g.c] ?? g.c}</h2>
                <ul className="rows">
                  {g.items.map(r => (
                    <li key={r.id} className="row">
                      <div className="row-main">
                        <p className="row-title">{r.title}{r.version > 1 && <span className="row-title-sub"> · version {r.version}</span>}</p>
                        <p className="row-sub">{[r.description, `${r.file}, ${size(r.size)}`, `sent ${dayMonth(dayOf(r.at))}`].filter(Boolean).join(' · ')}</p>
                      </div>
                      <span className="row-actions">
                        <button type="button" className="link" onClick={() => open(r)}>Open</button>
                        {may && r.status === 'active' && <button type="button" className="link" onClick={() => setUpload(r)}>Replace</button>}
                        {may && r.status === 'active' && <button type="button" className="link" onClick={() => setAsk({ r, act: 'archive' })}>Take off the phones</button>}
                        {may && r.status !== 'active' && <button type="button" className="link danger-link" onClick={() => setAsk({ r, act: 'delete' })}>Delete for good</button>}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </Arrive>
        )}
      <UploadDrawer open={upload != null} replaces={upload === 'new' ? null : upload} onClose={() => setUpload(null)} onDone={msg => { setUpload(null); done(msg); }} />
      <Confirm open={Boolean(ask)} danger={ask?.act === 'delete'} busy={busy} error={problem}
        title={ask?.act === 'delete' ? `Delete ${ask.r.title} for good?` : `Take ${ask?.r.title ?? ''} off the phones?`}
        confirmLabel={ask?.act === 'delete' ? 'Delete for good' : 'Take it off the phones'} onCancel={() => setAsk(null)} onConfirm={() => void act()}>
        {ask?.act === 'delete'
          ? `Every version of it and its files are erased. This cannot be undone.`
          : `It leaves every phone at once and stays on record under Taken off, where it can be deleted for good.`}
      </Confirm>
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

function UploadDrawer({ open, replaces, onClose, onDone }: { open: boolean; replaces: Resource | null; onClose: () => void; onDone: (m: string) => void }) {
  const me = useMe();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    setTitle(replaces?.title ?? ''); setCategory(replaces?.category ?? ''); setDescription(replaces?.description ?? '');
    setFile(null); setProblem(''); setAttempt(0);
  }, [open, replaces]);
  const errors = {
    file: !file ? 'Choose the file to send.' : resourceProblem(file) ?? undefined,
    title: !title.trim() ? 'Give it the title people will see on the phone.' : undefined,
    category: !category ? 'Choose where it goes on the phone.' : undefined,
  };
  const formRef = useFocusFirstError(errors, attempt);
  const save = async () => {
    setAttempt(a => a + 1);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setProblem('');
    try {
      await publishResource(me.orgId, { file: file!, title: title.trim(), category, description, replaces: replaces?.id });
      onDone(replaces ? `${title.trim()} is replaced on every phone; the old version is kept on record.` : `${title.trim()} is on every phone, under ${CATEGORY_WORD[category] ?? category}.`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} title={replaces ? `Replace ${replaces.title}` : 'Send a file to the phones'}
      sub={replaces ? `The new file becomes version ${replaces.version + 1}; version ${replaces.version} leaves the phones and stays on record.` : 'A PDF or an image, up to 50 MB. It reaches every phone at once.'}
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Sending…' : replaces ? 'Replace on every phone' : 'Send to every phone'}</button></>}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        <Field label="File" error={attempt ? errors.file : undefined} help="PDF, JPG, PNG or WebP.">{x => <input {...x} type="file" className="input file-input" accept={RESOURCE_ACCEPT} onChange={e => setFile(e.target.files?.[0] ?? null)} />}</Field>
        <Field label="Title" error={attempt ? errors.title : undefined}>{x => <input {...x} className="input" value={title} placeholder="Price list, November" onChange={e => setTitle(e.target.value)} />}</Field>
        <Field label="Where it goes on the phone" error={attempt ? errors.category : undefined}>{x => (
          <select {...x} className="input" value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">Choose</option>
            {RESOURCE_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_WORD[c]}</option>)}
          </select>
        )}</Field>
        <Field label="What it is for" optional>{x => <textarea {...x} className="input textarea" rows={3} value={description} onChange={e => setDescription(e.target.value)} />}</Field>
        {problem && <p className="form-error" role="alert">It was not sent. {problem}</p>}
      </form>
    </Drawer>
  );
}

// ── surveys ───────────────────────────────────────────────────────────

/** Surveys: the question the field asks clients now, what they answered, and the surveys before. */
export function Surveys() {
  const r = useResource<Survey[]>('share:surveys', loadSurveys);
  if (r.status === 'error' && !r.data) return <LoadError what="The surveys" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading the surveys" lines={1} />;
  return <SurveysView list={r.data} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

function SurveysView({ list, at, error, reload }: { list: Survey[]; at: Date | null; error: string; reload: () => void }) {
  const me = useMe();
  const may = ['owner', 'admin', 'management'].includes(me.role);
  const open = list.find(s => s.active) ?? null;
  const [pick, setPick] = useState(open?.id ?? list[0]?.id ?? '');
  const loc = useLocation();
  const nav = useNavigate();
  const [adding, setAddingState] = useState(loc.pathname.endsWith('/new'));
  const setAdding = (v: boolean) => { setAddingState(v); if (!v && loc.pathname.endsWith('/new')) nav('/share/surveys', { replace: true }); };
  const [ask, setAsk] = useState<Survey | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const s = list.find(x => x.id === pick) ?? open ?? list[0];
  const toggle = async () => {
    if (!ask) return;
    setBusy(true);
    setProblem('');
    try {
      await setSurveyOpen(ask.id, !ask.active);
      setNotice(ask.active ? `${ask.title} is closed; the phones stop asking it.` : `${ask.title} is open again on every phone.`);
      setAsk(null);
      invalidate('share:surveys');
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read the surveys again" />}>
        {list.length === 0 ? 'No survey has been run yet.' : open ? <><strong>{open.title}</strong> is open on every phone: {open.answers.length ? `${count(open.answers.length, 'answer')} from ${count(new Set(open.answers.map(a => a.client)).size, 'client')} so far.` : 'no answers yet.'}</> : 'No survey is open; the phones are not asking anything.'}
      </Summary>
      <Toolbar>
        {may && <button type="button" className="btn btn-primary btn-small" onClick={() => setAdding(true)}><Plus size={14} weight="bold" aria-hidden="true" /> Start a survey</button>}
        {list.length > 1 && <Filter label="Survey" value={s?.id ?? ''} onChange={setPick} options={list.map(x => ({ value: x.id, label: `${x.title}${x.active ? ' (open)' : ''}` }))} />}
      </Toolbar>
      {!s ? <Empty title="No surveys yet">Ask the field to put one question to every client they meet; the answers come back here, in the client's words.</Empty> : <SurveyBody s={s} may={may} onToggle={() => setAsk(s)} />}
      <SurveyDrawer open={adding} hasOpen={Boolean(open)} onClose={() => setAdding(false)} onDone={(id, msg) => { setAdding(false); setPick(id); setNotice(msg); invalidate('share:surveys'); }} />
      <Confirm open={Boolean(ask)} busy={busy} error={problem} title={ask?.active ? `Close ${ask.title}?` : `Open ${ask?.title ?? ''} again?`}
        confirmLabel={ask?.active ? 'Close the survey' : 'Open it again'} onCancel={() => setAsk(null)} onConfirm={() => void toggle()}>
        {ask?.active ? 'The phones stop asking it. The answers stay here.' : open && open.id !== ask?.id ? `Only one survey is open at a time, so ${open.title} closes.` : 'Every phone starts asking it again.'}
      </Confirm>
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

function SurveyBody({ s, may, onToggle }: { s: Survey; may: boolean; onToggle: () => void }) {
  const [q, setQ] = useState('');
  const rated = s.answers.filter(a => a.rating != null);
  const avg = rated.length ? rated.reduce((t, a) => t + (a.rating ?? 0), 0) / rated.length : 0;
  const spread = [1, 2, 3, 4, 5].map(n => ({ n, c: rated.filter(a => a.rating === n).length }));
  const rows = s.answers.filter(a => !q.trim() || `${a.client} ${a.person} ${a.feedback}`.toLowerCase().includes(q.trim().toLowerCase()));
  const { shown, more } = useShowMore(rows, 30);
  return (
    <Arrive>
      <section className="survey-head">
        <div className="survey-q">
          <p className="fig-title">{s.active ? 'Open on every phone' : 'Closed'} · started {dayMonth(dayOf(s.at))}</p>
          <h2 className="section-title">{s.title}</h2>
          {s.body && <p className="survey-body">{s.body}</p>}
          {may && <button type="button" className="link" onClick={onToggle}>{s.active ? 'Close the survey' : 'Open it again'}</button>}
        </div>
        {rated.length > 0 && (
          <div className="survey-score">
            <p className="survey-avg"><span className="hero-fig">{avg.toFixed(1)}</span> <span className="cell-quiet">out of 5, from {count(rated.length, 'rating')}</span></p>
            <ol className="survey-spread" aria-label="How many clients gave each rating">
              {spread.map(x => (
                <li key={x.n}><span className="survey-n">{x.n}</span><span className="inline-meter" aria-hidden="true"><span style={{ transform: `scaleX(${rated.length ? x.c / rated.length : 0})` }} /></span><span className="survey-c">{x.c}</span></li>
              ))}
            </ol>
            {s.answers.length > rated.length && <p className="fig-note">{count(s.answers.length - rated.length, 'answer has', 'answers have')} no rating.</p>}
          </div>
        )}
      </section>
      <section className="block">
        <div className="block-head"><h3 className="section-title">What clients said</h3><span className="block-meta">{count(s.answers.length, 'answer')}, newest first</span></div>
        {s.answers.length === 0 ? <p className="block-empty">No answers yet. The field files them on the phone after a visit.</p> : <>
          {s.answers.length > 8 && <Toolbar><SearchBox value={q} onChange={setQ} placeholder="Client, person or words" label="Find an answer" /></Toolbar>}
          <ul className="rows">
            {shown.map(a => (
              <li key={a.id} className="row">
                <div className="row-main">
                  <p className="row-title">{a.feedback ? `“${a.feedback}”` : <span className="cell-quiet">No words given</span>}</p>
                  <p className="row-sub">{[a.client, a.place, `asked by ${a.person}`].filter(Boolean).join(' · ')}</p>
                </div>
                <span className="row-meta">{a.rating != null ? `${a.rating} of 5 · ` : ''}{ago(a.at)}</span>
              </li>
            ))}
          </ul>
          {more}
        </>}
      </section>
    </Arrive>
  );
}

function SurveyDrawer({ open, hasOpen, onClose, onDone }: { open: boolean; hasOpen: boolean; onClose: () => void; onDone: (id: string, msg: string) => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [now, setNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { if (open) { setTitle(''); setBody(''); setNow(true); setProblem(''); setAttempt(0); } }, [open]);
  const errors = { title: title.trim().length < 3 ? 'Give the survey a title.' : undefined, body: body.trim().length < 8 ? 'Write the question the field will ask.' : undefined };
  const formRef = useFocusFirstError(errors, attempt);
  const save = async () => {
    setAttempt(a => a + 1);
    if (Object.values(errors).some(Boolean)) return;
    setBusy(true);
    setProblem('');
    try {
      const id = await createSurvey(title.trim(), body.trim(), now);
      onDone(id, now ? `${title.trim()} is open on every phone.` : `${title.trim()} is saved, closed, until you open it.`);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={open} onClose={onClose} title="Start a survey" sub="One question the field puts to each client, with a rating from 1 to 5 and their words."
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : now ? 'Open it on every phone' : 'Save it closed'}</button></>}>
      <form ref={formRef} className="form" noValidate onSubmit={e => { e.preventDefault(); void save(); }}>
        <Field label="Title" error={attempt ? errors.title : undefined}>{x => <input {...x} className="input" value={title} placeholder="Telmicure 80 interest" onChange={e => setTitle(e.target.value)} />}</Field>
        <Field label="The question" error={attempt ? errors.body : undefined}>{x => <textarea {...x} className="input textarea" rows={4} value={body} placeholder="Would the doctor prescribe a higher strength of Telmicure? What would they need to see?" onChange={e => setBody(e.target.value)} />}</Field>
        <label className="choice"><input type="checkbox" checked={now} onChange={e => setNow(e.target.checked)} /> Open it on every phone now</label>
        {now && hasOpen && <p className="form-note">Only one survey is open at a time; the one open now closes, and its answers stay here.</p>}
        {problem && <p className="form-error" role="alert">It was not saved. {problem}</p>}
      </form>
    </Drawer>
  );
}

// ── notifications sent ────────────────────────────────────────────────

/** Sent notifications: every message the phones received, grouped as it was sent, and who has read it. */
export function SentNotifications() {
  const [days, setDays] = useState('30');
  const r = useResource<Sent[]>(`share:sent:${days}`, () => loadSent(Number(days)));
  return (
    <div className="page-body">
      <Toolbar>
        <Filter label="Period" value={days} onChange={setDays} options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]} />
        <span className="toolbar-end"><Freshness at={r.at} error={r.error} reload={() => void r.reload()} label="Read the notifications again" /></span>
      </Toolbar>
      {r.status === 'error' && !r.data ? <LoadError what="The notifications" error={r.error} retry={() => void r.reload()} />
        : !r.data ? <Loading label="Reading the notifications" lines={1} />
        : <SentView list={r.data} days={Number(days)} />}
    </div>
  );
}

function SentView({ list, days }: { list: Sent[]; days: number }) {
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Sent | null>(null);
  const all = list.reduce((s, x) => s + x.to.length, 0);
  const read = list.reduce((s, x) => s + x.to.filter(t => t.read).length, 0);
  const people = new Set(list.flatMap(x => x.to.map(t => t.id))).size;
  const kinds = [...new Set(list.map(x => x.kind))].sort((a, b) => (NOTIFICATION_KIND[a] ?? a).localeCompare(NOTIFICATION_KIND[b] ?? b));
  const rows = useMemo(() => list.filter(x => kind === 'all' || x.kind === kind).filter(x => !q.trim() || `${x.title} ${x.body} ${x.to.map(t => t.name).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())), [list, kind, q]);
  const { shown, more } = useShowMore(rows, 50);
  return (
    <Arrive>
      <Summary>
        {all === 0 ? `No notifications in the last ${days} days.` : <><strong>{count(all, 'notification')}</strong> reached {count(people, 'person', 'people')} in the last {days} days; {percent(read, all)} have been read.</>}
      </Summary>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="What it said, or who got it" label="Find a notification" />
        <Filter label="Kind" value={kind} onChange={setKind} options={[{ value: 'all', label: 'Every kind' }, ...kinds.map(k => ({ value: k, label: NOTIFICATION_KIND[k] ?? k }))]} />
      </Toolbar>
      {all === 0 ? <Empty title="Nothing sent in this period">Decisions, tasks, new files and phone alerts are sent automatically; each appears here with who received it.</Empty>
        : rows.length === 0 ? <div className="list-empty"><Empty title="Nothing matches">Try another kind or words.</Empty></div> : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th scope="col">Sent</th><th scope="col">What it said</th><th scope="col" className="hide-narrow">Kind</th><th scope="col" className="num">Reached</th><th scope="col" className="num">Read</th></tr></thead>
                <tbody>
                  {shown.map(x => (
                    <tr key={x.key} className="clickable" onClick={() => setOpen(x)}>
                      <td className="nowrap">{dayMonth(dayOf(x.at))}<span className="cell-sub">{timeOf(x.at)}</span></td>
                      <th scope="row"><button type="button" className="cell-link cell-button" aria-haspopup="dialog" onClick={e => { e.stopPropagation(); setOpen(x); }}>{x.title}</button>{x.body && <span className="cell-sub">{x.body}</span>}</th>
                      <td className="hide-narrow">{NOTIFICATION_KIND[x.kind] ?? x.kind}</td>
                      <td className="num">{x.to.length === 1 ? x.to[0].name : count(x.to.length, 'person', 'people')}</td>
                      <td className="num">{x.to.length === 1 ? (x.to[0].read ? 'Yes' : <span className="cell-quiet">Not yet</span>) : `${x.to.filter(t => t.read).length} of ${x.to.length}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {more}
          </>
        )}
      <Drawer open={Boolean(open)} onClose={() => setOpen(null)} title={open?.title ?? ''} sub={open ? `${NOTIFICATION_KIND[open.kind] ?? open.kind} · sent ${dayMonth(dayOf(open.at))}, ${timeOf(open.at)}` : ''}>
        {open && <>
          {open.body && <p className="drawer-copy">{open.body}</p>}
          <section className="drawer-section">
            <h3 className="section-title">Who received it</h3>
            <ul className="rows">
              {[...open.to].sort((a, b) => Number(a.read) - Number(b.read) || a.name.localeCompare(b.name)).map(t => (
                <li key={t.id} className="row"><div className="row-main"><Link className="cell-link" to={`/team/${t.id}`}>{t.name}</Link></div><span className="row-meta">{t.read ? <Pill tone="good">Read</Pill> : 'Not read yet'}</span></li>
              ))}
            </ul>
          </section>
        </>}
      </Drawer>
    </Arrive>
  );
}
