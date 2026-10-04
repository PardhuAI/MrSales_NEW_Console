/** What an import function in the database says it would do, or did, with a sheet (import_clients, import_products). */
export interface SheetReport {
  sheet: string;
  total: number;
  create: number;
  update: number;
  rejected: number;
  committed: boolean;
  errors: { row: number; field: string; message: string }[];
}
