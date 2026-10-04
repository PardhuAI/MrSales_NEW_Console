import { db, readAll } from './client';
import { loadEmployees } from './people';

/**
 * Share with field: the files on every phone, the surveys the field asks
 * clients, and every notification the phones received. Writes go through the
 * old console's functions (publish_resource, archive_resource,
 * delete_resource, create_survey, set_survey_active).
 */

const call = async (fn: string, args: Record<string, unknown>) => {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(error.message.replace(/^./, x => x.toUpperCase()));
  return data;
};

// ── resources ─────────────────────────────────────────────────────────

/** The five the phone filters by. The database refuses anything else. */
export const RESOURCE_CATEGORIES = ['E-Detailing', 'Product Information', 'Price List', 'Training', 'Document'] as const;
export const CATEGORY_WORD: Record<string, string> = {
  'E-Detailing': 'Visual aids', 'Product Information': 'Product information', 'Price List': 'Price lists', Training: 'Training', Document: 'Documents',
};

export type Resource = {
  id: string; title: string; category: string; description: string; file: string; mime: string; size: number;
  version: number; family: string; status: 'active' | 'superseded' | 'archived'; at: string; path: string;
};

export async function loadResources(): Promise<Resource[]> {
  const rows = await readAll<{ id: string; title: string; category: string; description: string | null; storage_path: string; file_name: string | null; mime_type: string | null; size_bytes: number | null; version: number; family_id: string; status: string; published_at: string }>((a, b) =>
    db().from('resources').select('id, title, category, description, storage_path, file_name, mime_type, size_bytes, version, family_id, status, published_at')
      .order('published_at', { ascending: false }).range(a, b));
  return rows.map(r => ({
    id: r.id, title: r.title, category: r.category, description: r.description ?? '', path: r.storage_path,
    file: r.file_name ?? r.storage_path.split('/').pop() ?? '', mime: r.mime_type ?? '', size: Number(r.size_bytes ?? 0),
    version: r.version, family: r.family_id, status: r.status as Resource['status'], at: r.published_at,
  }));
}

const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const BY_EXT: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
export const RESOURCE_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp';
const MAX = 50 * 1024 * 1024;

/** Some systems hand over a PDF with no type; the extension decides then. */
const mimeOf = (f: File) => (EXT[f.type] ? f.type : BY_EXT[f.name.split('.').pop()?.toLowerCase() ?? ''] ?? null);

export function resourceProblem(f: File): string | null {
  if (!mimeOf(f)) return 'Only PDF, JPG, PNG or WebP files can be sent to the phones.';
  if (f.size === 0) return 'That file is empty.';
  if (f.size > MAX) return `That file is ${(f.size / 1048576).toFixed(1)} MB. The limit is 50 MB.`;
  return null;
}

/** Uploads the file, then publishes it; a failed publish takes the file back out. */
export async function publishResource(orgId: string, p: { file: File; title: string; category: string; description: string; replaces?: string }) {
  const problem = resourceProblem(p.file);
  if (problem) throw new Error(problem);
  const mime = mimeOf(p.file)!;
  const sb = db();
  const path = `${orgId}/resources/${crypto.randomUUID()}.${EXT[mime]}`;
  const { error } = await sb.storage.from('resources').upload(path, p.file, { contentType: mime, upsert: false });
  if (error) throw new Error(`The upload did not finish: ${error.message}`);
  try {
    return (await call('publish_resource', {
      p_title: p.title, p_category: p.category, p_storage_path: path, p_file_name: p.file.name, p_mime_type: mime,
      p_size_bytes: p.file.size, p_description: p.description.trim() || null, p_replaces: p.replaces ?? null,
    })) as string;
  } catch (e) {
    await sb.storage.from('resources').remove([path]);
    throw e;
  }
}

export const archiveResource = async (id: string) => { await call('archive_resource', { p_id: id }); };

/** Removes every version from the phones and the history, then erases the files. */
export async function deleteResource(id: string) {
  const paths = ((await call('delete_resource', { p_id: id })) as string[] | null) ?? [];
  if (!paths.length) return 0;
  const { error } = await db().storage.from('resources').remove(paths);
  if (error) throw new Error(`Removed from the phones, but ${paths.length === 1 ? 'the file' : 'the files'} could not be erased: ${error.message}`);
  return paths.length;
}

export async function resourceUrl(path: string) {
  const { data, error } = await db().storage.from('resources').createSignedUrl(path, 3600);
  if (error) throw new Error(`The file could not be opened: ${error.message}`);
  return data.signedUrl;
}

// ── surveys ───────────────────────────────────────────────────────────

export type SurveyAnswer = { id: string; person: string; personId: string; client: string; clientType: string; place: string; rating: number | null; feedback: string; at: string };
export type Survey = { id: string; title: string; body: string; active: boolean; at: string; answers: SurveyAnswer[] };

export async function loadSurveys(): Promise<Survey[]> {
  const sb = db();
  const [people, surveys, responses] = await Promise.all([
    loadEmployees(),
    readAll<{ id: string; title: string; body: string | null; is_active: boolean; created_at: string }>((a, b) =>
      sb.from('surveys').select('id, title, body, is_active, created_at').order('created_at', { ascending: false }).range(a, b)),
    readAll<{ id: string; survey_id: string; employee_id: string; answers: Record<string, unknown> | null; submitted_at: string }>((a, b) =>
      sb.from('survey_responses').select('id, survey_id, employee_id, answers, submitted_at').order('submitted_at', { ascending: false }).range(a, b)),
  ]);
  // The phone keeps the client's name with the answer, so a client renamed later still reads as it was.
  const missing = [...new Set(responses.map(r => r.answers?.client_name ? null : r.answers?.client_id).filter(Boolean) as string[])];
  const names = new Map<string, string>();
  if (missing.length) {
    const { data } = await sb.from('clients').select('id, name').in('id', missing);
    for (const c of data ?? []) names.set(c.id as string, c.name as string);
  }
  return surveys.map(s => ({
    id: s.id, title: s.title, body: s.body ?? '', active: s.is_active, at: s.created_at,
    answers: responses.filter(r => r.survey_id === s.id).map(r => {
      const a = r.answers ?? {};
      const rating = a.rating ?? a.score;
      return {
        id: r.id, personId: r.employee_id, person: people.get(r.employee_id)?.name ?? 'Someone no longer here',
        client: String(a.client_name ?? names.get(String(a.client_id)) ?? 'A client'), clientType: String(a.client_type ?? ''),
        place: String(a.location_name ?? ''), rating: rating == null || rating === '' ? null : Number(rating),
        feedback: [a.feedback, a.remarks, a.answer].filter(x => typeof x === 'string' && x.trim()).join(' ').trim(), at: r.submitted_at,
      };
    }),
  }));
}

export const createSurvey = async (title: string, body: string, open: boolean) =>
  (await call('create_survey', { p_title: title, p_body: body, p_active: open })) as string;
export const setSurveyOpen = async (id: string, open: boolean) => { await call('set_survey_active', { p_id: id, p_active: open }); };

// ── notifications sent ────────────────────────────────────────────────

export const NOTIFICATION_KIND: Record<string, string> = {
  approval: 'Decisions', task: 'Tasks', document: 'Files and documents', message: 'Messages', device: 'Phone and login',
  location: 'Location', client: 'Clients', target: 'Targets', info: 'Notices', complaint: 'Complaints',
};

/** One event as people think of it: the same message to many phones at once is one line. */
export type Sent = { key: string; title: string; body: string; kind: string; at: string; to: { id: string; name: string; read: boolean }[] };

export async function loadSent(days: number): Promise<Sent[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [people, rows] = await Promise.all([
    loadEmployees(),
    readAll<{ id: string; employee_id: string; title: string; body: string | null; kind: string; is_read: boolean; created_at: string }>((a, b) =>
      db().from('notifications').select('id, employee_id, title, body, kind, is_read, created_at').gte('created_at', since)
        .order('created_at', { ascending: false }).range(a, b)),
  ]);
  const out = new Map<string, Sent>();
  for (const r of rows) {
    const key = `${r.kind}|${r.title}|${r.body ?? ''}|${r.created_at.slice(0, 16)}`;
    const s = out.get(key) ?? out.set(key, { key, title: r.title, body: r.body ?? '', kind: r.kind, at: r.created_at, to: [] }).get(key)!;
    s.to.push({ id: r.employee_id, name: people.get(r.employee_id)?.name ?? 'Someone no longer here', read: r.is_read });
  }
  return [...out.values()];
}
