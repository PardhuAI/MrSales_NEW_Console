import { useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Plus } from '@phosphor-icons/react';
import { invalidate, useResource } from '../../data/resource';
import { audienceFrom, loadAnnouncements, remindAnnouncement, sendAnnouncement, type Announcement, type AudienceKind } from '../../live/share';
import { loadRoster, type RosterModel } from '../../live/team';
import { IST_TODAY, ago, dayMonth, dayOf, timeOf } from '../../lib/days';
import { count } from '../../lib/format';
import { Confirm, Drawer, Field, Notice, Pill, SearchBox, Summary, Toolbar, useShowMore } from '../../components/kit';
import { Segmented } from '../../components/Segmented';
import { Empty, Freshness, LoadError, Loading } from '../../components/States';
import { Arrive } from '../../components/motion';
import { useMe } from '../../live/session';

/**
 * Announcements: one message to the whole field, a team, a role or a
 * territory, on every phone it is meant for, and who has read it. The list of
 * what was sent is the page; each line says who it went to and how many have
 * opened it, as a figure and a thin bar in ink. Opening one names who has not
 * read it, so a manager can follow up, and reminds them in one step.
 */

const TITLE_MAX = 120;
const BODY_MAX = 2000;

export function Announcements() {
  const r = useResource<Announcement[]>('share:announcements', loadAnnouncements);
  const roster = useResource<RosterModel>('team:roster', loadRoster);
  if (r.status === 'error' && !r.data) return <LoadError what="The announcements" error={r.error} retry={() => void r.reload()} />;
  if (!r.data) return <Loading label="Reading the announcements" lines={1} />;
  return <View list={r.data} roster={roster.data ?? null} rosterError={roster.status === 'error' && !roster.data ? roster.error : ''} at={r.at} error={r.error} reload={() => void r.reload()} />;
}

const reachLine = (a: Announcement) => `${a.audience}, ${count(a.to.length, 'person', 'people')}`;
const pinnedNow = (a: Announcement) => Boolean(a.pinnedUntil && a.pinnedUntil >= IST_TODAY());

function ReadFigure({ read, of }: { read: number; of: number }) {
  return (
    <span className="ann-read">
      <span className="ann-read-figure">{read} of {of}</span>
      <span className="ann-bar" aria-hidden="true"><span className="ann-bar-fill" style={{ transform: `scaleX(${of ? read / of : 0})` }} /></span>
    </span>
  );
}

function View({ list, roster, rosterError, at, error, reload }: { list: Announcement[]; roster: RosterModel | null; rosterError: string; at: Date | null; error: string; reload: () => void }) {
  const me = useMe();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return list.filter(a => !n || `${a.title} ${a.body} ${a.audience} ${a.by}`.toLowerCase().includes(n));
  }, [list, q]);
  const { shown, more } = useShowMore(rows, 40);
  const latest = list[0];
  const pinned = list.filter(pinnedNow).length;
  const opened = list.find(a => a.id === open) ?? null;
  const writing = pathname === '/share/announcements/new';

  return (
    <div className="page-body">
      <Summary aside={<Freshness at={at} error={error} reload={reload} label="Read the announcements again" />}>
        {list.length === 0 ? 'Nothing has been announced yet.' : <>
          <strong>{count(list.length, 'announcement')}</strong> sent. The latest, “{latest.title}”, is read by {latest.to.filter(t => t.readAt).length} of {latest.to.length}.
          {pinned ? ` ${pinned === 1 ? 'One is' : `${pinned} are`} pinned to the top of their phones.` : ''}
        </>}
      </Summary>
      <Toolbar>
        <Link className="btn btn-primary btn-small" to="/share/announcements/new"><Plus size={14} weight="bold" aria-hidden="true" /> Write an announcement</Link>
        {list.length > 6 && <SearchBox value={q} onChange={setQ} placeholder="Title, words in it, or who it went to" label="Find an announcement" />}
      </Toolbar>
      {list.length === 0 ? (
        <Empty title="Nothing announced yet">
          Write one to tell the whole field, a team, a role or a territory something. Each person gets it on their phone, and this page shows who has read it.
        </Empty>
      ) : rows.length === 0 ? (
        <div className="list-empty"><Empty title="Nothing matches">Try other words.</Empty></div>
      ) : (
        <Arrive>
          <div className="table-wrap">
            <table className="table ann-table">
              <thead>
                <tr><th scope="col">Announcement</th><th scope="col" className="ann-col-to">Sent to</th><th scope="col" className="hide-narrow">Sent</th><th scope="col" className="num">Read by</th></tr>
              </thead>
              <tbody>
                {shown.map(a => {
                  const read = a.to.filter(t => t.readAt).length;
                  return (
                    <tr key={a.id} className="clickable" onClick={() => setOpen(a.id)}>
                      <th scope="row">
                        <button type="button" className="cell-link cell-button" aria-haspopup="dialog" onClick={e => { e.stopPropagation(); setOpen(a.id); }}>{a.title}</button>
                        {pinnedNow(a) && <> <Pill>Pinned</Pill></>}
                        <span className="cell-sub ann-first-line">{a.body.split('\n')[0]}</span>
                        <span className="cell-sub ann-to-narrow">To {reachLine(a)}</span>
                      </th>
                      <td className="ann-col-to">{a.audience}<span className="cell-sub">{count(a.to.length, 'person', 'people')}</span></td>
                      <td className="hide-narrow nowrap">{dayMonth(dayOf(a.at))}<span className="cell-sub">{a.by ? `by ${a.by}` : timeOf(a.at)}</span></td>
                      <td className="num"><ReadFigure read={read} of={a.to.length} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {more}
        </Arrive>
      )}

      <Detail a={opened} onClose={() => setOpen(null)} onReminded={() => invalidate('share:')} />
      <WriteDrawer open={writing} roster={roster} rosterError={rosterError} me={me}
        onClose={() => nav('/share/announcements')}
        onSent={m => { invalidate('share:'); setNotice(m); nav('/share/announcements'); }} />
      {notice && <Notice onDone={() => setNotice('')}>{notice}</Notice>}
    </div>
  );
}

// ── one announcement: who has read it, and who has not ────────────────

function Detail({ a, onClose, onReminded }: { a: Announcement | null; onClose: () => void; onReminded: () => void }) {
  const me = useMe();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [done, setDone] = useState<{ id: string; text: string } | null>(null);
  const unread = a ? a.to.filter(t => !t.readAt).sort((x, y) => x.name.localeCompare(y.name)) : [];
  const read = a ? a.to.filter(t => t.readAt).sort((x, y) => String(x.readAt).localeCompare(String(y.readAt))) : [];
  const mayRemind = a && (['owner', 'admin', 'hr'].includes(me.role) || a.byMe);
  const remind = async () => {
    if (!a) return;
    setBusy(true); setProblem('');
    try {
      const n = await remindAnnouncement(a.id);
      setAsking(false);
      // Confirmed in place, beside the names it went to (console-motion: settle).
      setDone({ id: a.id, text: `${count(n, 'person was', 'people were')} reminded just now.` });
      onReminded();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer open={Boolean(a)} onClose={onClose} title={a?.title ?? ''}
      sub={a ? `To ${reachLine(a)}. Sent ${dayMonth(dayOf(a.at))}, ${timeOf(a.at)}${a.by ? ` by ${a.by}` : ''}.${pinnedNow(a) ? ` Pinned until ${dayMonth(a.pinnedUntil!)}.` : ''}` : ''}>
      {a && <>
        <p className="drawer-copy ann-body">{a.body}</p>
        <section className="drawer-section" aria-labelledby="ann-unread">
          <h3 id="ann-unread" className="section-title">{unread.length ? `Not read yet: ${unread.length}` : 'Everyone has read it'}</h3>
          {unread.length > 0 && <>
            {done?.id === a.id && <p className="ann-remind-done" role="status">{done.text}</p>}
            {mayRemind && done?.id !== a.id && (
              <div className="ann-remind">
                <button type="button" className="btn btn-secondary btn-small" onClick={() => setAsking(true)}>
                  Remind the {unread.length === 1 ? 'one person' : `${unread.length}`} who {unread.length === 1 ? 'has' : 'have'} not read it
                </button>
              </div>
            )}
            <ul className="rows">
              {unread.map(t => (
                <li key={t.id} className="row">
                  <div className="row-main"><Link className="cell-link" to={`/team/${t.id}`}>{t.name}</Link></div>
                  <span className="row-meta">{t.remindedAt ? `Reminded ${ago(t.remindedAt)}` : 'Not read yet'}</span>
                </li>
              ))}
            </ul>
          </>}
        </section>
        {read.length > 0 && (
          <section className="drawer-section" aria-labelledby="ann-read">
            <h3 id="ann-read" className="section-title">Read: {read.length}</h3>
            <ul className="rows">
              {read.map(t => (
                <li key={t.id} className="row">
                  <div className="row-main"><Link className="cell-link" to={`/team/${t.id}`}>{t.name}</Link></div>
                  <span className="row-meta">{dayMonth(dayOf(t.readAt!))}, {timeOf(t.readAt!)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </>}
      <Confirm open={asking} title={unread.length === 1 ? `Remind ${unread[0]?.name ?? ''}?` : `Remind ${unread.length} people?`}
        confirmLabel={unread.length === 1 ? 'Send the reminder' : `Remind ${unread.length} people`} busy={busy} error={problem}
        onCancel={() => { setAsking(false); setProblem(''); }} onConfirm={() => void remind()}>
        Each gets one more notification on their phone. People who have read it get nothing.
      </Confirm>
    </Drawer>
  );
}

// ── writing one ───────────────────────────────────────────────────────

const KIND_LABEL: Record<AudienceKind, string> = { everyone: 'Everyone', team: 'A team', role: 'A role', territory: 'A territory' };

function WriteDrawer({ open, roster, rosterError, me, onClose, onSent }: {
  open: boolean; roster: RosterModel | null; rosterError: string; me: ReturnType<typeof useMe>; onClose: () => void; onSent: (m: string) => void;
}) {
  const manager = me.role === 'management';
  // A manager writes to their own team. The demo's management login has no
  // employee record of its own, so it is matched by name there.
  const myId = me.employeeId ?? (me.demo ? roster?.people.find(p => p.name === me.name)?.id ?? null : null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<AudienceKind>(manager ? 'team' : 'everyone');
  const [choice, setChoice] = useState('');
  const [pin, setPin] = useState('');
  const [tried, setTried] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const today = IST_TODAY();

  const audienceId = kind === 'everyone' ? null : manager ? myId : choice || null;
  const people = roster ? audienceFrom(roster.people, kind, audienceId) : [];
  const managers = useMemo(() => (roster?.people ?? []).filter(p => p.status === 'active' && p.reports > 0).sort((a, b) => a.name.localeCompare(b.name)), [roster]);
  const audienceName = kind === 'everyone' ? 'Everyone'
    : kind === 'team' ? (roster?.people.find(p => p.id === audienceId)?.name ? `${roster.people.find(p => p.id === audienceId)!.name}'s team` : '')
      : kind === 'role' ? roster?.roles.find(r => r.id === audienceId)?.name ?? ''
        : roster?.territories.find(t => t.id === audienceId)?.name ?? '';

  const errors = {
    title: title.trim().length < 2 ? 'Give it a title, as the phone will show it.' : title.trim().length > TITLE_MAX ? `Keep the title under ${TITLE_MAX} characters.` : undefined,
    body: !body.trim() ? 'Write the message.' : body.trim().length > BODY_MAX ? `Keep the message under ${BODY_MAX.toLocaleString('en-IN')} characters.` : undefined,
    choice: kind !== 'everyone' && !audienceId ? (manager ? 'Your login is not linked to a person on the roster, so it has no team to write to.' : `Choose which ${kind}.`) : roster && people.length === 0 ? `Nobody is in ${audienceName || 'that'} today.` : undefined,
    pin: pin && pin < today ? 'Choose today or a later date.' : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);
  const shown = (k: keyof typeof errors) => (tried ? errors[k] : undefined);

  const reset = () => { setTitle(''); setBody(''); setKind(manager ? 'team' : 'everyone'); setChoice(''); setPin(''); setTried(false); setProblem(''); };
  const close = () => { reset(); onClose(); };
  const ask = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (invalid) {
      (e.currentTarget as HTMLFormElement).querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setAsking(true);
  };
  const send = async () => {
    setBusy(true); setProblem('');
    try {
      const r = await sendAnnouncement({ title: title.trim(), body: body.trim(), kind, audienceId, pinnedUntil: pin || null });
      setAsking(false);
      reset();
      onSent(`Sent to ${count(r.count, 'person', 'people')}. Who has read it shows here as they open it.`);
    } catch (e) {
      setAsking(false);
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onClose={close} wide title="Write an announcement"
      sub="It goes to every phone you choose, as a notification and in their announcements, and you see who has read it."
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
          <button type="submit" form="ann-form" className="btn btn-primary" disabled={busy || !roster}>
            {roster && !errors.choice && people.length ? `Send to ${count(people.length, 'person', 'people')}` : 'Send'}
          </button>
        </>
      )}>
      {rosterError ? <p className="form-error" role="alert">The roster could not be read, so nobody can be chosen. {rosterError}</p>
        : !roster ? <Loading label="Reading who it can go to" lines={1} /> : (
          <div className="ann-write">
            <form id="ann-form" className="form" onSubmit={ask} noValidate>
              <Field label="Title" error={shown('title')} help={`${title.trim().length} of ${TITLE_MAX} characters`}>
                {x => <input {...x} className="input" value={title} maxLength={TITLE_MAX + 20} onChange={e => setTitle(e.target.value)} />}
              </Field>
              <Field label="Message" error={shown('body')} help={`${body.trim().length.toLocaleString('en-IN')} of ${BODY_MAX.toLocaleString('en-IN')} characters. Line breaks are kept.`}>
                {x => <textarea {...x} className="input textarea" rows={7} value={body} onChange={e => setBody(e.target.value)} />}
              </Field>
              {manager ? (
                <div className="form-field">
                  <p className="form-label">Who it goes to</p>
                  <p className="ann-to">Your team{roster && audienceId ? `, ${count(people.length, 'person', 'people')}` : ''}</p>
                  {shown('choice') && <p className="form-error">{errors.choice}</p>}
                </div>
              ) : (
                <>
                  <div className="form-field">
                    <p className="form-label" aria-hidden="true">Who it goes to</p>
                    <Segmented label="Who it goes to" value={kind} onChange={v => { setKind(v); setChoice(''); }}
                      options={(['everyone', 'team', 'role', 'territory'] as AudienceKind[]).map(k => ({ value: k, label: KIND_LABEL[k] }))} />
                  </div>
                  {kind !== 'everyone' && (
                    <Field label={kind === 'team' ? 'Whose team' : kind === 'role' ? 'Which role' : 'Which territory'} error={shown('choice')}
                      help={kind === 'team' ? 'Everyone under that manager, however far down the line.' : undefined}>
                      {x => (
                        <select {...x} className="input" value={choice} onChange={e => setChoice(e.target.value)}>
                          <option value="">Choose</option>
                          {kind === 'team' && managers.map(p => <option key={p.id} value={p.id}>{p.name}'s team ({audienceFrom(roster.people, 'team', p.id).length})</option>)}
                          {kind === 'role' && roster.roles.filter(r => r.active).map(r => <option key={r.id} value={r.id}>{r.name} ({audienceFrom(roster.people, 'role', r.id).length})</option>)}
                          {kind === 'territory' && roster.territories.map(t => <option key={t.id} value={t.id}>{t.name} ({audienceFrom(roster.people, 'territory', t.id).length})</option>)}
                        </select>
                      )}
                    </Field>
                  )}
                </>
              )}
              <Field label="Keep it at the top of their phone until" optional error={shown('pin')} help="Until then it stays above everything else on their Home screen.">
                {x => <input {...x} className="input ann-date" type="date" min={today} value={pin} onChange={e => setPin(e.target.value)} />}
              </Field>
              {problem && <p className="form-error" role="alert">It was not sent. {problem}</p>}
            </form>

            <aside className="ann-preview" aria-label="How it will look on the phone">
              <p className="ann-preview-label">On their phone</p>
              <div className="ann-phone">
                {pin && <p className="ann-phone-pin">Pinned</p>}
                <p className="ann-phone-title">{title.trim() || 'Your title'}</p>
                <p className="ann-phone-body">{body.trim() || 'The first lines of your message appear here.'}</p>
                <p className="ann-phone-read">Read</p>
              </div>
              <p className="form-help">{audienceName ? `${audienceName}${people.length ? `, ${count(people.length, 'person', 'people')}` : ''}.` : ''}</p>
            </aside>
          </div>
        )}
      <Confirm open={asking} title={`Send to ${count(people.length, 'person', 'people')}?`} confirmLabel="Send the announcement" busy={busy}
        onCancel={() => setAsking(false)} onConfirm={() => void send()}>
        “{title.trim()}” goes to {audienceName === 'Everyone' ? 'everyone in the company' : audienceName} now, as a notification on each phone. It cannot be taken back once sent.
      </Confirm>
    </Drawer>
  );
}
