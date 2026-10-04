/**
 * The columns of each data sheet — the contract with a customer's office.
 *
 * `key` is what the import function in the database expects; `header` is what
 * the person editing the file reads. Change a header and every sheet already
 * out there stops matching that column, so they are worth arguing about once
 * and then leaving alone.
 */
import type { Column } from '../lib/sheet';

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
/** An embedded row comes back as an object, or null when there is none. */
const nested = (v: unknown, key: string): string => {
  const o = Array.isArray(v) ? v[0] : v;
  return o && typeof o === 'object' ? s((o as Record<string, unknown>)[key]) : '';
};

export const PRODUCT_COLUMNS: Column[] = [
  { key: 'id',     header: 'Id',     get: r => s(r.id) },
  { key: 'code',   header: 'Code',   get: r => s(r.sku) },
  { key: 'name',   header: 'Name',   get: r => s(r.name) },
  { key: 'pack',   header: 'Pack',   get: r => s(r.pack_size) },
  { key: 'mrp',    header: 'MRP',    get: r => s(r.mrp) },
  { key: 'pts',    header: 'PTS',    get: r => s(r.pts) },
  { key: 'gst',    header: 'GST %',  get: r => s(r.gst_percent) },
  { key: 'active', header: 'Active', get: r => (r.is_active ? 'Yes' : 'No') },
];

export const CLIENT_COLUMNS: Column[] = [
  { key: 'id',          header: 'Id',             get: r => s(r.id) },
  { key: 'name',        header: 'Name',           get: r => s(r.name) },
  { key: 'type',        header: 'Type',           get: r => s(r.type) },
  { key: 'category',    header: 'Category',       get: r => s(r.category) },
  { key: 'listing',     header: 'Listing',        get: r => s(r.listing) },
  // Blank rather than "No" when unlisted: the flag genuinely does not apply,
  // and a "No" there would come back as a contradiction the database refuses.
  { key: 'active',      header: 'Active',         get: r => (r.is_active === null || r.is_active === undefined ? '' : r.is_active ? 'Yes' : 'No') },
  { key: 'specialty',   header: 'Specialty',      get: r => s(r.specialty) },
  { key: 'designation', header: 'Designation',    get: r => s(r.designation) },
  // Export-only in effect: the Area decides the territory, and a Territory
  // that disagrees with it is rejected rather than quietly ignored.
  { key: 'territory',   header: 'Territory',      get: r => nested((r.areas as Record<string, unknown>)?.territories, 'name') },
  { key: 'area',        header: 'Area',           get: r => nested(r.areas, 'name') },
  { key: 'cluster',     header: 'Cluster',        get: r => nested(r.clusters, 'name') },
  { key: 'owner',       header: 'Owner',          get: r => nested(r.employees, 'code') },
  { key: 'mobile',      header: 'Mobile',         get: r => s(r.mobile) },
  { key: 'email',       header: 'Email',          get: r => s(r.email) },
  { key: 'contact',     header: 'Contact person', get: r => s(r.contact_person) },
  { key: 'address',     header: 'Address',        get: r => s(r.address_line) },
  { key: 'city',        header: 'City',           get: r => s(r.city) },
  { key: 'pincode',     header: 'Pincode',        get: r => s(r.pincode) },
  { key: 'lat',         header: 'Latitude',       get: r => s(r.lat) },
  { key: 'lng',         header: 'Longitude',      get: r => s(r.lng) },
];
