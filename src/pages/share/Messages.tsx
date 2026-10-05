import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, PaperPlaneRight, Plus } from '@phosphor-icons/react';
import { loadContacts, loadMessages, loadThreads, markRead, openDirect, sendMessage, setChatName, type Contact, type Message, type Thread } from '../../live/chat';
import { useMe, useSession } from '../../live/session';
import { ROLE_LABEL } from '../../app/access';
import { IST_TODAY, dayMonth, dayOf, shortDay, timeOf } from '../../lib/days';
import { count } from '../../lib/format';
import { Drawer, Field, SearchBox, Summary } from '../../components/kit';
import { Empty, LoadError, Loading } from '../../components/States';

/**
 * Messages with the field, in the same conversations the phone app holds.
 *
 * Read again every few seconds while the page is open and in front, and not at
 * all otherwise, so it costs nothing when nobody is looking. A message comes
 * from a person on the roster or, for an office login, under the name it
 * chose the first time it came here.
 */
export function Messages() {
  const me = useMe();
  if (me.demo) return <DemoNote />;
  // An office login writes under a name of its own, chosen once.
  if (!me.employeeId && !me.chatName) return <ChooseName role={ROLE_LABEL[me.role]} />;
  return <Inbox />;
}

function DemoNote() {
  return (
    <div className="page-body">
      <Empty title="Messages work on a live account">
        The demo company has no conversations. Signed in to your own company, this is where you write to your team.
      </Empty>
    </div>
  );
}

function ChooseName({ role }: { role: string }) {
  const { refresh } = useSession();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setProblem('Write the name your team knows you by.');
    setBusy(true);
    setProblem('');
    try {
      await setChatName(name.trim());
      await refresh();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };
  return (
    <div className="page-body">
      <form className="chat-name" onSubmit={save} noValidate>
        <h2 className="section-title">Write to your team</h2>
        <p className="form-help">
          Message anyone under you; it reaches their phone at once, and their replies come here. You see only your own conversations, never theirs with each other.
        </p>
        <Field label="Your name, as your team will see it" help={`Shown with your role: “${name.trim() || 'Pardhu'}, ${role}”.`} error={problem || undefined}>
          {x => <input {...x} className="input" value={name} maxLength={60} autoFocus placeholder="For example: Pardhu" onChange={e => setName(e.target.value)} />}
        </Field>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Start writing'}</button>
      </form>
    </div>
  );
}

/** Runs `f` now and every `ms` while the tab is visible. */
function usePoll(f: () => void, ms: number, on = true) {
  const ref = useRef(f);
  ref.current = f;
  useEffect(() => {
    if (!on) return;
    ref.current();
    const tick = () => { if (document.visibilityState === 'visible') ref.current(); };
    const t = window.setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [ms, on]);
}

function Inbox() {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [starting, setStarting] = useState(false);

  const read = useCallback(async () => {
    try {
      setThreads(await loadThreads());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  usePoll(() => void read(), 15000);

  if (!threads && error) return <LoadError what="Messages" error={error} retry={() => void read()} />;
  if (!threads) return <Loading label="Reading messages" lines={2} />;

  const unread = threads.reduce((n, t) => n + t.unread, 0);
  const needle = q.trim().toLowerCase();
  const shown = threads.filter(t => !needle || `${t.title} ${t.subtitle} ${t.last}`.toLowerCase().includes(needle));
  const current = threads.find(t => t.id === open) ?? null;

  return (
    <div className="page-body">
      <Summary>
        {threads.length === 0 ? 'No conversations yet.' : <><strong>{count(threads.length, 'conversation')}</strong>{unread ? <>, <strong>{count(unread, 'unread message')}</strong></> : ', all read'}.</>}
      </Summary>
      <div className={`chat${current ? ' is-open' : ''}`}>
        <section className="chat-list" aria-label="Conversations">
          <div className="chat-list-head">
            <SearchBox value={q} onChange={setQ} placeholder="Person or message" label="Find a conversation" />
            <button type="button" className="btn btn-primary btn-small" onClick={() => setStarting(true)}><Plus size={14} weight="bold" aria-hidden="true" /> New</button>
          </div>
          {threads.length === 0 ? (
            <Empty title="Nobody has written yet">Start a conversation with anyone on your team; it reaches their phone at once.</Empty>
          ) : (
            <ul className="chat-threads">
              {shown.map(t => (
                <li key={t.id}>
                  <button type="button" className={`chat-thread${t.id === open ? ' is-current' : ''}`} aria-current={t.id === open ? 'true' : undefined} onClick={() => setOpen(t.id)}>
                    <span className="chat-thread-top">
                      <span className={`chat-thread-name${t.unread ? ' is-unread' : ''}`}>{t.title}</span>
                      <span className="chat-thread-at">{dayOf(t.lastAt) === IST_TODAY() ? timeOf(t.lastAt) : shortDay(dayOf(t.lastAt))}</span>
                    </span>
                    <span className="chat-thread-bottom">
                      <span className="chat-thread-last">{t.last || t.subtitle}</span>
                      {t.unread > 0 && <span className="chat-unread" aria-label={count(t.unread, 'unread message')}>{t.unread}</span>}
                    </span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="chat-none">No conversation matches.</li>}
            </ul>
          )}
        </section>
        <section className="chat-pane" aria-label={current ? `Conversation with ${current.title}` : 'Conversation'}>
          {current
            ? <Conversation key={current.id} thread={current} onBack={() => setOpen(null)} onSent={() => void read()} />
            : <div className="chat-pick"><p>Choose a conversation, or start a new one.</p></div>}
        </section>
      </div>
      <NewMessage open={starting} onClose={() => setStarting(false)} onOpen={id => { setStarting(false); setOpen(id); void read(); }} />
    </div>
  );
}

function Conversation({ thread, onBack, onSent }: { thread: Thread; onBack: () => void; onSent: () => void }) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const seen = useRef(0);

  const read = useCallback(async () => {
    try {
      const list = await loadMessages(thread.id);
      setMessages(list);
      setError('');
      if (list.length !== seen.current) {
        seen.current = list.length;
        void markRead(thread.id);
        requestAnimationFrame(() => end.current?.scrollIntoView({ block: 'end' }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [thread.id]);
  usePoll(() => void read(), 5000);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await sendMessage(thread.id, body);
      setText('');
      await read();
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const today = IST_TODAY();
  let lastDay = '';
  return (
    <>
      <header className="chat-pane-head">
        <button type="button" className="icon-btn chat-back" aria-label="Back to conversations" onClick={onBack}><ArrowLeft size={18} /></button>
        <div>
          <h2 className="section-title">{thread.title}</h2>
          <p className="cell-sub">{thread.subtitle}</p>
        </div>
      </header>
      <div className="chat-messages" role="log" aria-live="polite">
        {!messages ? <p className="chat-wait">Reading the conversation…</p> : messages.length === 0 ? <p className="chat-wait">No messages yet. Say hello.</p> : messages.map(m => {
          const day = dayOf(m.at);
          const divider = day !== lastDay ? (lastDay = day, <p key={`d-${day}`} className="chat-day">{day === today ? 'Today' : dayMonth(day)}</p>) : null;
          return [
            divider,
            <div key={m.id} className={`chat-msg${m.mine ? ' is-mine' : ''}`}>
              {!m.mine && thread.isGroup && <span className="chat-msg-who">{m.sender}</span>}
              <p className={m.kind === 'text' ? '' : 'chat-msg-other'}>{m.body}</p>
              <span className="chat-msg-at">{timeOf(m.at)}</span>
            </div>,
          ];
        })}
        <div ref={end} />
      </div>
      {error && <p className="form-error chat-error" role="alert">{error}</p>}
      {thread.kind === 'announcement' && <p className="form-help chat-note">An announcement channel: only admins post here.</p>}
      <form className="chat-compose" onSubmit={send}>
        <label className="visually-hidden" htmlFor="chat-text">Message to {thread.title}</label>
        <textarea id="chat-text" className="input chat-input" rows={1} value={text} placeholder="Write a message" disabled={busy}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(e); } }} />
        <button type="submit" className="btn btn-primary chat-send" disabled={busy || !text.trim()} aria-label="Send"><PaperPlaneRight size={18} weight="fill" /></button>
      </form>
    </>
  );
}

function NewMessage({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen: (threadId: string) => void }) {
  const [people, setPeople] = useState<Contact[] | null>(null);
  const [q, setQ] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    if (!open) return;
    setQ(''); setProblem('');
    loadContacts().then(setPeople, e => setProblem(e instanceof Error ? e.message : String(e)));
  }, [open]);
  const needle = q.trim().toLowerCase();
  const shown = (people ?? []).filter(p => !needle || `${p.name} ${p.code} ${p.hq} ${p.designation}`.toLowerCase().includes(needle));
  const start = async (p: Contact) => {
    setBusy(p.id);
    setProblem('');
    try {
      onOpen(await openDirect(p.id));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };
  return (
    <Drawer open={open} onClose={onClose} title="New message" sub="Choose who to write to. An earlier conversation with them opens where it left off.">
      <div className="form">
        <SearchBox value={q} onChange={setQ} placeholder="Name, code or HQ" label="Find a person" />
        {problem && <p className="form-error" role="alert">{problem}</p>}
        {!people ? <p className="form-help">Reading your team…</p> : (
          <ul className="rows">
            {shown.map(p => (
              <li key={p.id} className="row">
                <button type="button" className="row-button" disabled={Boolean(busy)} onClick={() => void start(p)}>
                  <span className="row-main">
                    <span className="row-title">{p.name}</span>
                    <span className="row-sub">{[p.designation, p.code, p.hq].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="row-meta">{busy === p.id ? 'Opening…' : 'Write'}</span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="form-help">Nobody matches.</li>}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
