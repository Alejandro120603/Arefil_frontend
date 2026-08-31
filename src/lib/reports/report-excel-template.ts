import { orderedColumns } from "@/lib/reports/report-builder";
import { orderedReportParameters } from "@/lib/reports/report-runtime";
import type {
  ReportColumn,
  ReportExcelTemplate,
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
