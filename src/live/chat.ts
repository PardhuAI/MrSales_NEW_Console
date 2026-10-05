import { db } from './client';

/**
 * Messages with the field: the same conversations the phone app has, through
 * the same functions (chat_threads_for_me, chat_messages_for_thread,
 * send_chat_message, find_or_create_direct_chat, mark_chat_read). A message
 * comes from a person on the roster, so a login takes part only when it is
 * linked to one; the database refuses the rest.
 */

const call = async (fn: string, args: Record<string, unknown> = {}) => {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(error.message.replace(/^./, x => x.toUpperCase()));
  return data;
};

export type Thread = {
  id: string; title: string; subtitle: string; isGroup: boolean; unread: number;
  last: string; lastAt: string; kind: string;
};

export type Message = {
  id: string; sender: string; body: string; at: string; mine: boolean; kind: string;
};

export type Contact = { id: string; name: string; code: string; designation: string; hq: string };

export async function loadThreads(): Promise<Thread[]> {
  const rows = (await call('chat_threads_for_me', { p_query: null })) as {
    id: string; title: string; subtitle: string; is_group: boolean; unread_count: number;
    last_message: string; last_message_at: string; thread_kind: string;
  }[];
  return (rows ?? []).map(r => ({
    id: r.id, title: r.title, subtitle: r.subtitle, isGroup: r.is_group, unread: r.unread_count,
    last: r.last_message, lastAt: r.last_message_at, kind: r.thread_kind,
  }));
}

/** What a message that is not text says, in words. */
const SAID: Record<string, string> = { image: 'Sent a photo', location: 'Shared a location', live_location: 'Shared their live location' };

export async function loadMessages(threadId: string): Promise<Message[]> {
  const rows = (await call('chat_messages_for_thread', { p_thread_id: threadId })) as {
    id: string; sender_name: string; body: string | null; sent_at: string; is_mine: boolean; kind: string;
  }[];
  return (rows ?? [])
    .map(r => ({ id: r.id, sender: r.sender_name, body: r.body?.trim() || SAID[r.kind] || '', at: r.sent_at, mine: r.is_mine, kind: r.kind }))
    .sort((a, b) => a.at.localeCompare(b.at));
}

export const sendMessage = async (threadId: string, body: string) => { await call('send_chat_message', { p_thread_id: threadId, p_body: body }); };
export const markRead = async (threadId: string) => { await call('mark_chat_read', { p_thread_id: threadId }).catch(() => undefined); };
export const openDirect = async (employeeId: string) => (await call('find_or_create_direct_chat', { p_employee_id: employeeId })) as string;

export async function loadContacts(): Promise<Contact[]> {
  const rows = (await call('chat_directory', { p_query: null })) as { id: string; name: string; employee_code: string; designation: string | null; headquarters: string | null }[];
  return (rows ?? []).map(r => ({ id: r.id, name: r.name, code: r.employee_code, designation: r.designation ?? '', hq: r.headquarters ?? '' }));
}
