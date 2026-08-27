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

/**
 * Reports — mirrored from `Arefil_backend/backend/app/schemas/reports.py`.
 *
 * The backend derives this dataset at request time from two price lists that
 * must share supplier and currency (it answers 422 otherwise). Keep this shape
 * stable: the native comparison preview and exports consume this same payload.
 */
export type ComparisonStatus = "INCREASED" | "DECREASED" | "UNCHANGED" | "NEW" | "REMOVED";

export interface ComparisonReportMetadata {
  code: "PRICE_LIST_COMPARISON";
  generated_at: string;
}

export interface ComparisonSupplier {
  id: number;
  code: string;
  name: string;
}

export interface ComparisonPriceList {
  id: number;
  effective_date: string;
  currency: string;
  source_filename: string;
}

export interface PriceListComparisonSummary {
  total_products: number;
  increased: number;
  decreased: number;
  unchanged: number;
  new: number;
  removed: number;
  /** `null` when no row had a comparable percentage (empty lists, or every A price was 0). */
  average_percentage_change: DecimalString | null;
}

/**
 * `price_a` is null for `NEW`, `price_b` is null for `REMOVED`, and both
 * `absolute_change` / `percentage_change` are null on those rows. On a
 * compared row `percentage_change` is still null when `price_a` was exactly 0
 * (the backend refuses to divide by zero) — render "—", never "0%"/"Infinity%".
 */
export interface PriceListComparisonItem {
  product_id: number;
  part_number: string;
  item_number: string | null;
  description: string | null;
  price_a_cents: number | null;
  price_a: DecimalString | null;
  price_b_cents: number | null;
  price_b: DecimalString | null;
  absolute_change_cents: number | null;
  absolute_change: DecimalString | null;
  percentage_change: DecimalString | null;
  classification_a: string | null;
  classification_b: string | null;
  status: ComparisonStatus;
}

export interface PriceListComparisonResponse {
  report: ComparisonReportMetadata;
  supplier: ComparisonSupplier;
  list_a: ComparisonPriceList;
  list_b: ComparisonPriceList;
  summary: PriceListComparisonSummary;
  items: PriceListComparisonItem[];
}

export interface ReportDefinition {
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  enabled: boolean;
  data_source_type: ReportDataSourceType;
  parameters: ReportParameter[];
  parameter_groups: ReportParameterGroup[];
  created_at: string;
  updated_at: string;
}

export type ReportDataSourceType = "HANDLER" | "SQL_QUERY";
export type ReportParameterDataType = "integer" | "string" | "decimal" | "boolean" | "date" | "datetime";
export type ReportParameterInputType = "text" | "number" | "date" | "datetime" | "checkbox" | "select";
export type ReportOptionsSource = "price_lists" | "suppliers" | "products_by_price_list";
export type ReportScalarOptionsSource = Exclude<ReportOptionsSource, "products_by_price_list">;

export interface ReportParameterConfiguration {
  options_source: ReportScalarOptionsSource;
}

export interface ReportParameter {
  name: string;
  label: string;
  data_type: ReportParameterDataType;
  input_type: ReportParameterInputType;
  required: boolean;
  default_value: unknown | null;
  display_order: number;
  configuration_json: ReportParameterConfiguration | null;
}

export interface ReportNumericConfiguration {
  minimum?: number | string;
  maximum?: number | string;
  exclusive_minimum?: boolean;
  exclusive_maximum?: boolean;
}

export interface ReportDependentOptionsConfiguration {
  options_source: "products_by_price_list";
  context_parameter: string;
}

export type ReportParameterGroupFieldConfiguration =
  | ReportNumericConfiguration
  | ReportDependentOptionsConfiguration;

export interface ReportParameterGroupField {
  name: string;
  label: string;
  data_type: ReportParameterDataType;
  input_type: ReportParameterInputType;
  required: boolean;
  default_value: unknown | null;
  display_order: number;
  configuration_json: ReportParameterGroupFieldConfiguration | null;
}

export interface ReportParameterGroup {
  name: string;
  label: string;
  resolver_key: "products_by_price_list";
  context_parameter: string;
  min_items: number;
  max_items: number | null;
  display_order: number;
  fields: ReportParameterGroupField[];
}

export interface ReportAdminDefinition extends ReportDefinition {
  data_source_key: string | null;
  query_text: string | null;
}

export interface ReportCreateRequest {
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  data_source_type: ReportDataSourceType;
  data_source_key: string | null;
  query_text: string | null;
  enabled: boolean;
  parameters: ReportParameter[];
}

export type ReportUpdateRequest = Omit<ReportCreateRequest, "code">;

export interface ReportPreviewResponse {
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  truncated: boolean;
}

/** Generic payload returned by POST /reports/{code}/data for SQL_QUERY reports. */
export interface SQLReportExecutionResponse {
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
}

export interface ReportOption {
  value: number | string;
  label: string;
}

/**
 * Report Builder — mirrored from Backend #12/#13
 * (`Arefil_backend/backend/app/schemas/reports.py`, `app/db/enums.py`).
 *
 * The builder describes the *logical shell* of a report: which columns exist,
 * where each one takes its value from, and how the Excel export is laid out.
 * It is the official presentation contract for web preview and Excel output.
 */
export type ReportColumnType = "FIELD" | "PARAMETER" | "FORMULA";

/**
 * `ReportFormatType` is the *presentation* enum and is intentionally narrower
 * than `ReportParameterDataType`: the backend has no `integer`/`decimal`
 * format, both render through `number`. Never mirror data types into here.
 */
export type ReportFormatType = "text" | "number" | "currency" | "percent" | "date" | "datetime";

/**
 * One allow-listed business field the builder may bind a FIELD column to.
 * `key` is the technical reference the backend validates (`product.part_number`);
 * `group` is the human bucket the UI renders it under ("Producto").
 */
export interface ReportFieldDescriptor {
  key: string;
  label: string;
  data_type: ReportParameterDataType;
  group: string;
  required_context: string;
}

export interface ReportColumn {
  key: string;
  label: string;
  column_type: ReportColumnType;
  /** Set only when `column_type === "FIELD"`; a key from the field catalog. */
  source_field: string | null;
  /** Set only when `column_type === "PARAMETER"`; a declared parameter name. */
  source_parameter: string | null;
  /** Set only when `column_type === "FORMULA"`; validated by the backend. */
  formula_definition: string | null;
  data_type: ReportParameterDataType;
  format_type: ReportFormatType | null;
  display_order: number;
  visible: boolean;
  width: number | null;
}

/** SUM is the only operation Backend #12 implements — do not widen locally. */
export interface ReportTotalConfiguration {
  column_key: string;
  operation: "SUM";
}

export interface ReportExcelLayout {
  sheet_name: string;
  title: string | null;
  show_report_name: boolean;
  show_generated_at: boolean;
  show_parameters: boolean;
  freeze_header: boolean;
  header_row: number;
  totals: ReportTotalConfiguration[];
}

/** `excel_layout` is null until the builder has been saved at least once. */
export interface ReportBuilderDefinition {
  report: ReportAdminDefinition;
  columns: ReportColumn[];
  parameter_groups: ReportParameterGroup[];
  excel_layout: ReportExcelLayout | null;
}

/** Body of `PUT /reports/{code}/builder` — columns and layout save together. */
export interface ReportBuilderWriteRequest {
  columns: ReportColumn[];
  parameter_groups: ReportParameterGroup[];
  excel_layout: ReportExcelLayout;
}

export interface ReportBuilderPreviewColumn {
  key: string;
  label: string;
  data_type: ReportParameterDataType;
  format_type: ReportFormatType | null;
}

/**
 * Only visible columns reach `columns`/`rows`. Decimal cells and `totals`
 * values arrive as strings, like every other backend Decimal.
 */
export interface ReportBuilderPreviewResponse {
  columns: ReportBuilderPreviewColumn[];
  rows: Record<string, unknown>[];
  totals: Record<string, DecimalString | null>;
  row_count: number;
  truncated: boolean;
}
