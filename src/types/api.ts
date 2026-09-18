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
  /**
   * Pattern for the final XLSX document name (Backend #26). `null` keeps the
   * backend's generic fallback (`<code>-document.xlsx`). Only
   * `{{parameters.*}}`, `{{report.code}}` and `{{report.name}}` are supported.
   */
  filename_template: string | null;
  enabled: boolean;
  data_source_id: number;
  data_source: ReportDataSourceSummary;
  parameters: ReportParameter[];
  parameter_groups: ReportParameterGroup[];
  created_at: string;
  updated_at: string;
}

export type ReportParameterDataType = "integer" | "string" | "decimal" | "boolean" | "date" | "datetime";
export type ReportParameterInputType = "text" | "number" | "date" | "datetime" | "checkbox" | "select";
export type ReportOptionsSource = "price_lists" | "suppliers" | "products" | "products_by_price_list";
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

export interface ReportDataSourceSummary {
  id: number;
  code: string;
  name: string;
  description: string | null;
  enabled: boolean;
  capabilities: string[];
}

export interface ReportDataSource extends ReportDataSourceSummary {
  parameters: ReportParameter[];
  fields: ReportFieldDescriptor[];
}

export type ReportAdminDefinition = ReportDefinition;

export interface ReportCreateRequest {
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  filename_template: string | null;
  data_source_id: number;
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

/** Generic tabular payload returned by reusable tabular data sources. */
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
 * One product of the selected price list (Backend #21). The search endpoint
 * answers with these so a quotation line can show part number, description and
 * unit price without a second round trip after picking a product.
 */
export interface ReportProductOption extends ReportOption {
  product_id: number;
  part_number: string;
  item_number: string | null;
  description: string | null;
  unit_price: DecimalString;
  currency: string;
  classification: string | null;
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

/**
 * The pre-#20 totals row: one SUM pinned to a column, rendered under it.
 * Reports saved before the summary contract still answer in this shape, so the
 * builder reads it and upgrades it to `ReportSummaryConfiguration` in memory.
 */
export interface ReportLegacyTotalConfiguration {
  column_key: string;
  operation: "SUM";
}

/**
 * A report-level summary (Backend #20). `SUM` folds one numeric visible column;
 * `FORMULA` computes from other summaries and numeric report parameters — that
 * is how IVA and Total exist once per report instead of once per row.
 *
 * The backend forbids the unused half of the pair: `SUM` requires `column_key`
 * and rejects `formula_definition`, `FORMULA` requires the opposite.
 */
export interface ReportSummaryConfiguration {
  key: string;
  label: string;
  column_key: string | null;
  operation: "SUM" | "FORMULA";
  formula_definition: string | null;
  format_type: ReportFormatType | null;
}

export type ReportTotalConfiguration =
  | ReportLegacyTotalConfiguration
  | ReportSummaryConfiguration;

/** The layout the UI edits and writes: totals are always the summary shape. */
export interface ReportExcelLayout {
  sheet_name: string;
  title: string | null;
  show_report_name: boolean;
  show_generated_at: boolean;
  show_parameters: boolean;
  freeze_header: boolean;
  header_row: number;
  totals: ReportSummaryConfiguration[];
}

/** What the backend answers: a legacy report still returns the old totals. */
export interface ReportExcelLayoutResponse extends Omit<ReportExcelLayout, "totals"> {
  totals: ReportTotalConfiguration[];
}

/** `excel_layout` is null until the builder has been saved at least once. */
export interface ReportBuilderDefinition {
  report: ReportAdminDefinition;
  columns: ReportColumn[];
  parameter_groups: ReportParameterGroup[];
  excel_layout: ReportExcelLayoutResponse | null;
}

/** Body of `PUT /reports/{code}/builder` — columns and layout save together. */
export interface ReportBuilderWriteRequest {
  columns: ReportColumn[];
  parameter_groups: ReportParameterGroup[];
  excel_layout: ReportExcelLayout;
}

/**
 * Document layer — mirrored from Backend #22
 * (`Arefil_backend/backend/app/schemas/reports.py`).
 *
 * A report has at most one *active* Excel template: an `.xlsx` workbook the
 * administrator uploads and the backend fills in. The file itself never travels
 * as JSON — only this metadata does, so the panel can describe the template
 * without ever holding its bytes.
 */
export interface ReportExcelTemplate {
  report_code: string;
  original_filename: string;
  size_bytes: number;
  version: number;
  checksum: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Preflight result of `PUT /reports/{code}/excel-template` (Backend #24).
 *
 * The backend parses every sheet against the saved builder before activating a
 * template. On success the metadata carries this result; on rejection it comes
 * back as the `detail` of a `422`, with `valid: false` — and no version is
 * created.
 */
export interface ReportExcelTemplateValidationIssue {
  code: string;
  message: string;
  sheet: string;
  cell: string | null;
  placeholder: string | null;
  range: string | null;
}

export interface ReportExcelTemplateValidationResult {
  valid: boolean;
  placeholder_count: number;
  repeatable_rows: number;
  warnings: ReportExcelTemplateValidationIssue[];
  errors: ReportExcelTemplateValidationIssue[];
}

/** The upload response: the same metadata plus the preflight that admitted it. */
export interface ReportExcelTemplateUpload extends ReportExcelTemplate {
  validation: ReportExcelTemplateValidationResult;
}

/**
 * Visual workbook inspection (Backend #28, `app/schemas/excel_inspection.py`).
 *
 * A read-only, JSON-only description of the active template's structure — it
 * never carries workbook bytes and never modifies the template. Built so the
 * admin can locate a cell to map a field onto without opening Excel.
 */
export type ReportWorkbookCellValueType =
  | "empty"
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "time"
  | "formula"
  | "error";

export type ReportWorkbookSheetState = "visible" | "hidden" | "veryHidden";

export type ReportWorkbookDrawingType = "image" | "chart";

/** Deduplicated by `style_id`: cells reference a key of `ReportExcelTemplateInspection.styles`. */
export interface ReportWorkbookStyleDescriptor {
  bold: boolean;
  italic: boolean;
  font_size: number | null;
  horizontal_alignment: string | null;
  vertical_alignment: string | null;
  wrap_text: boolean;
  fill_rgb: string | null;
  font_rgb: string | null;
  borders: Record<string, string | null>;
  number_format: string;
}

export interface ReportWorkbookCellInspection {
  coordinate: string;
  row: number;
  column: number;
  value: string | number | boolean | null;
  value_type: ReportWorkbookCellValueType;
  formula: string | null;
  /** Recognized `{{...}}` tokens found in the cell text; empty when there are none. */
  placeholders: string[];
  style_id: number;
  number_format: string;
  /** Set on every cell that belongs to a merge, anchor included. */
  merged_range: string | null;
  /** The top-left coordinate of the merge this cell belongs to; `null` outside one. */
  merge_anchor: string | null;
}

export interface ReportWorkbookDrawingInspection {
  type: ReportWorkbookDrawingType;
  anchor: string | null;
  end: string | null;
  x_emu: number | null;
  y_emu: number | null;
  width_emu: number | null;
  height_emu: number | null;
}

export interface ReportWorkbookSheetInspection {
  name: string;
  /** Base zero, in workbook order. */
  index: number;
  hidden: boolean;
  state: ReportWorkbookSheetState;
  max_row: number;
  max_column: number;
  used_range: string;
  merged_ranges: string[];
  row_heights: Record<string, number>;
  column_widths: Record<string, number>;
  default_row_height: number | null;
  default_column_width: number | null;
  /** Only cells with a value, a style, or merge membership — ordinary blanks are omitted. */
  cells: ReportWorkbookCellInspection[];
  drawings: ReportWorkbookDrawingInspection[];
}

export interface ReportExcelTemplateInspection {
  template: {
    version: number;
    filename: string;
    checksum: string;
  };
  sheets: ReportWorkbookSheetInspection[];
  /** Keyed by `style_id` as text. */
  styles: Record<string, ReportWorkbookStyleDescriptor>;
  /** Always `false`: limits fail the request instead of truncating it silently. */
  truncated: false;
}

/**
 * Visual mapping (Backend #29, `app/schemas/excel_mappings.py`).
 *
 * `PUT .../excel-template/mappings` applies a batch of edits over the active
 * template in one atomic write: `mappings` writes a `{{namespace.key}}`
 * placeholder into a cell, `clear` blanks a cell that already holds one. The
 * request is a conditional write keyed by `base_version`/`base_checksum`
 * (from the last inspection) — a stale pair answers `409`.
 */
export interface ExcelCellTarget {
  sheet: string;
  cell: string;
}

export interface ExcelCellMapping extends ExcelCellTarget {
  /** `"namespace.key"`, e.g. `"parameters.customer_name"` — never the `{{...}}` wrapper. */
  placeholder: string;
}

export interface ExcelMappingsRequest {
  base_version: number;
  base_checksum: string;
  mappings: ExcelCellMapping[];
  clear: ExcelCellTarget[];
}

/**
 * One entry of a `422`'s `detail.errors`. Per-target issues (`unknown_sheet`,
 * `merge_slave`, `formula_target`, `not_placeholder`, `unknown_placeholder`,
 * `duplicate_target`, `invalid_cell`) carry `cell`/`operation`; the workbook-wide
 * `multiple_repeatable_rows` issue carries neither.
 */
export interface ExcelMappingIssue {
  code: string;
  message: string;
  sheet: string;
  cell?: string;
  operation?: "mapping" | "clear";
}

/** The `PUT .../mappings` response: the saved template plus a fresh inspection of it. */
export interface ExcelMappingsResponse extends ReportExcelTemplateUpload {
  inspection: ReportExcelTemplateInspection;
}

/**
 * Rendered-document preview (Frontend #31, Backend #30,
 * `app/schemas/excel_render_preview.py`). `POST .../render-preview` renders
 * the template against one pinned execution snapshot and inspects the
 * *result* — same shape as a template inspection, so the same grid renders
 * both — never the frontend reconstructing a workbook itself.
 */
export interface ReportExcelRenderPreviewRequest {
  execution_id: string;
}

export interface ReportExcelRenderPreview extends ReportExcelTemplateInspection {
  kind: "rendered_document";
  report_code: string;
  template_version: number;
  template_checksum: string;
  execution_id: string;
  generated_at: string;
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
  /**
   * Public id of the immutable execution snapshot the backend persisted
   * (Backend #25). The final document renders from this id, never from the
   * parameters again; it is absent for datasets the backend cannot persist.
   */
  execution_id?: string | null;
  columns: ReportBuilderPreviewColumn[];
  /** Normalized scalar parameters the backend actually ran with (no groups). */
  parameters?: Record<string, unknown>;
  rows: Record<string, unknown>[];
  /** Report-level summaries keyed by summary key (Subtotal, IVA, Total…). */
  summary?: Record<string, DecimalString | null>;
  /** Same values as `summary`; kept because legacy layouts key it by column. */
  totals: Record<string, DecimalString | null>;
  row_count: number;
  truncated: boolean;
}
