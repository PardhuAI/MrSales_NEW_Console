import { db, readAll } from './client';

/**
 * What global search looks through besides pages: people (name, code), clients
 * (name) and orders (number), as the old console's GlobalBar did. Read once
 * when search first opens, scoped by row-level security like everything else.
 */
export type SearchIndex = {
  people: { id: string; name: string; code: string; hq: string; active: boolean }[];
  clients: { id: string; name: string; type: string; city: string }[];
  orders: { id: string; number: string; client: string }[];
};

export const orderNumber = (id: string) => id.slice(0, 8).toUpperCase();

export async function loadSearchIndex(): Promise<SearchIndex> {
  const sb = db();
  const [people, clients, orders] = await Promise.all([
    readAll<{ id: string; name: string; code: string | null; hq: string | null; status: string }>((a, b) =>
      sb.from('employees').select('id, name, code, hq, status').order('name').range(a, b)),
    readAll<{ id: string; name: string; type: string; city: string | null }>((a, b) =>
      sb.from('clients').select('id, name, type, city').order('name').range(a, b)),
    readAll<{ id: string; clients: { name: string } | null }>((a, b) =>
      sb.from('orders').select('id, clients(name)').order('created_at', { ascending: false }).range(a, b) as never),
  ]);
  return {
    people: people.map(p => ({ id: p.id, name: p.name, code: p.code ?? '', hq: p.hq ?? '', active: p.status === 'active' })),
    clients: clients.map(c => ({ id: c.id, name: c.name, type: c.type, city: c.city ?? '' })),
    orders: orders.map(o => ({ id: o.id, number: orderNumber(o.id), client: o.clients?.name ?? 'Client' })),
  };
}
