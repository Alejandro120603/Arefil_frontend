import { orderedColumns } from "@/lib/reports/report-builder";
import { orderedReportParameters } from "@/lib/reports/report-runtime";
import type {
  ReportColumn,
  ReportExcelTemplate,
  ReportExcelTemplateValidationIssue,
  ReportExcelTemplateValidationResult,
  ReportParameter,
  ReportParameterDataType,
  ReportSummaryConfiguration,
} from "@/types/api";

/**
 * The document layer (Frontend #23 / Backend #22).
 *
 * The final document is an `.xlsx` workbook the administrator uploads. It is
 * written against the *dataset contract* the builder already decided — the
 * placeholders below — so a template never has to guess field names, and the
 * backend never recomputes an amount while filling one in.
 */

export type ReportExcelTemplateStatus = "missing" | "configured";

export function excelTemplateStatus(template: ReportExcelTemplate | null): ReportExcelTemplateStatus {
  return template == null ? "missing" : "configured";
}

export const EXCEL_TEMPLATE_STATUS_LABELS: Record<ReportExcelTemplateStatus, string> = {
  missing: "Sin plantilla",
  configured: "Configurada",
};

/**
 * The compatibility preflight (Backend #24), read as three states.
 *
 * `invalid` is the only one the backend refuses to activate; `warning` exists
 * because the contract carries a `warnings` list the renderer tolerates.
 */
export type ReportExcelTemplateValidationStatus = "valid" | "warning" | "invalid";

export function excelTemplateValidationStatus(
  validation: ReportExcelTemplateValidationResult,
): ReportExcelTemplateValidationStatus {
  if (!validation.valid || validation.errors.length > 0) return "invalid";
  return validation.warnings.length > 0 ? "warning" : "valid";
}

export const EXCEL_TEMPLATE_VALIDATION_LABELS: Record<ReportExcelTemplateValidationStatus, string> = {
  valid: "Válida",
  warning: "Con advertencias",
  invalid: "No compatible",
};

export const INCOMPATIBLE_TEMPLATE_MESSAGE =
  "La plantilla no es compatible con el Report Builder y no fue activada.";

/** Where an issue lives, as the workbook writes it: `Hoja!B4`, or a merged range. */
export function excelTemplateIssueLocation(issue: ReportExcelTemplateValidationIssue): string {
  const target = issue.cell ?? issue.range;
  return target ? `${issue.sheet}!${target}` : issue.sheet;
}

function issueList(value: unknown): ReportExcelTemplateValidationIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (item == null || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.message !== "string" || typeof record.sheet !== "string") return [];
    return [{
      code: typeof record.code === "string" ? record.code : "unknown",
      message: record.message,
      sheet: record.sheet,
      cell: typeof record.cell === "string" ? record.cell : null,
      placeholder: typeof record.placeholder === "string" ? record.placeholder : null,
      range: typeof record.range === "string" ? record.range : null,
    }];
  });
}

/**
 * Reads a validation result out of an arbitrary payload — the `detail` of the
 * rejection `422`, which reaches us as `unknown`. Anything that is not that
 * shape returns `null` so the caller falls back to a plain error message
 * instead of rendering a half-parsed diagnostic.
 */
export function parseExcelTemplateValidation(
  value: unknown,
): ReportExcelTemplateValidationResult | null {
  if (value == null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.valid !== "boolean") return null;
  if (typeof record.placeholder_count !== "number" || typeof record.repeatable_rows !== "number") return null;
  return {
    valid: record.valid,
    placeholder_count: record.placeholder_count,
    repeatable_rows: record.repeatable_rows,
    warnings: issueList(record.warnings),
    errors: issueList(record.errors),
  };
}

export const XLSX_EXTENSION = ".xlsx";
export const XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** The client-side half of the backend's own `.xlsx` check (Backend #22). */
export function isXlsxFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(XLSX_EXTENSION);
}

export interface ReportPlaceholderDescriptor {
  /** Exactly what is typed into a cell, e.g. `{{rows.line_total}}`. */
  placeholder: string;
  label: string;
  data_type: ReportParameterDataType;
  section: "Reporte" | "Parámetros" | "Partidas" | "Resúmenes";
}

/**
 * Every placeholder a template may use, in the order the document reads them.
 * Only *visible* columns reach the dataset — the same rule the preview and the
 * Excel export already follow — and the report-level keys are the ones the
 * backend renderer actually publishes (`excel_renderer.py::render_excel_document`).
 */
export function excelTemplatePlaceholders(
  parameters: ReportParameter[],
  columns: ReportColumn[],
  summaries: ReportSummaryConfiguration[],
): ReportPlaceholderDescriptor[] {
  return [
    { placeholder: "{{report.code}}", label: "Código del reporte", data_type: "string", section: "Reporte" as const },
    { placeholder: "{{report.name}}", label: "Nombre del reporte", data_type: "string", section: "Reporte" as const },
    { placeholder: "{{report.description}}", label: "Descripción del reporte", data_type: "string", section: "Reporte" as const },
    { placeholder: "{{report.category}}", label: "Categoría del reporte", data_type: "string", section: "Reporte" as const },
    ...orderedReportParameters(parameters).map((parameter) => ({
      placeholder: `{{parameters.${parameter.name}}}`,
      label: parameter.label,
      data_type: parameter.data_type,
      section: "Parámetros" as const,
    })),
    ...orderedColumns(columns).filter((column) => column.visible).map((column) => ({
      placeholder: `{{rows.${column.key}}}`,
      label: column.label,
      data_type: column.data_type,
      section: "Partidas" as const,
    })),
    ...summaries.map((summary) => ({
      placeholder: `{{summary.${summary.key}}}`,
      label: summary.label,
      data_type: "decimal" as ReportParameterDataType,
      section: "Resúmenes" as const,
    })),
  ];
}

const SIZE_UNITS = ["B", "KB", "MB"] as const;

/** Human-readable size of the uploaded workbook (templates never reach GB). */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const decimals = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(decimals)} ${SIZE_UNITS[unit]}`;
}
