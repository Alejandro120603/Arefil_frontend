/**
 * TypeScript contract mirrored from `Arefil_backend/backend/app/schemas`.
 *
 * Decimal fields on the backend (SQLAlchemy `Numeric` / Pydantic `Decimal`) are
 * serialized as JSON strings, never numbers — do not widen these to `number`.
 * Parse them at render/format time (see `src/lib/format`).
 */

export type DecimalString = string;

export interface PageMeta {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
}

export interface Page<T> {
  items: T[];
  meta: PageMeta;
}

export interface Supplier {
  id: number;
  code: string;
  name: string;
  active: boolean;
  created_at: string;
}

export type PriceListStatus = string;

export interface PriceList {
  id: number;
  supplier: string;
  import_id: number;
  effective_date: string;
  currency: string;
  source_filename: string;
  status: PriceListStatus;
  created_at: string;
}

export interface PriceListDetail extends PriceList {
  items_count: number;
  status_changes_count: number;
}

export interface PriceListItem {
  id: number;
  product_id: number;
  part_number: string;
  item_number: string | null;
  description: string | null;
  sat_code: string | null;
  std_package_qty: number | null;
  unit_weight_kg: DecimalString | null;
  cubes_ft3: DecimalString | null;
  unit_price_cents: number;
  unit_price: DecimalString;
  classification: string | null;
  is_new: boolean;
}

export type StatusChangeStatus = "CANCELLED" | "NON_CATALOG";

export interface StatusChange {
  id: number;
  price_list_id: number;
  product_id: number | null;
  part_number: string;
  item_number: string | null;
  status: StatusChangeStatus;
  replacement_part_number: string | null;
  replacement_product_id: number | null;
}

export interface Product {
  id: number;
  supplier: string;
  part_number: string;
  item_number: string | null;
  description: string | null;
  sat_code: string | null;
  created_at: string;
  updated_at: string;
}

export interface PriceHistoryEntry {
  price_list_id: number;
  effective_date: string;
  price_cents: number;
  price: DecimalString;
  currency: string;
  classification: string | null;
  absolute_change: DecimalString | null;
  percentage_change: DecimalString | null;
}

export type ImportJobStatus = "UPLOADED" | "PREVIEWED" | "IMPORTING" | "COMPLETED" | "FAILED";

export interface ImportSummary {
  products: number;
  cancelled: number;
  non_catalog: number;
  replacements: number;
  warnings: number;
  errors: number;
}

export interface ImportProductSample {
  part_number: string;
  item_number: string | null;
  description: string | null;
  unit_price: DecimalString;
  is_new: boolean;
}

export interface ImportPreviewResponse {
  import_id: number;
  status: ImportJobStatus;
  supplier: string;
  filename: string;
  effective_date: string | null;
  currency: string | null;
  summary: ImportSummary;
  products_sample: ImportProductSample[];
  warnings: string[];
  errors: string[];
}

export interface ImportJob {
  import_id: number;
  status: ImportJobStatus;
  supplier: string;
  filename: string;
  effective_date: string | null;
  currency: string | null;
  detected_rows: number;
  valid_rows: number;
  warning_rows: number;
  error_rows: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ImportConfirmResult {
  import_id: number;
  price_list_id: number;
  effective_date: string;
  created_products: number;
  updated_products: number;
  price_items: number;
  cancelled: number;
  non_catalog: number;
  replacements: number;
  warnings: number;
}

export interface HealthStatus {
  status: string;
}
