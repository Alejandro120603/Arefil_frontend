import { orderedColumns } from "@/lib/reports/report-builder";
import { orderedReportParameters } from "@/lib/reports/report-runtime";
import type {
  ReportColumn,
  ReportDocumentDataset,
  ReportParameter,
  ReportParameterDataType,
  ReportSummaryConfiguration,
  ReportTemplate,
} from "@/types/api";

/**
 * The document layer (Frontend #23 / Backend #22).
 *
 * A template is designed against the *dataset contract*, never against SQL: the
 * builder already decided which columns and summaries exist, so the designer
 * can be handed an exact schema — and a filled sample of it — without anyone
 * writing a query by hand.
 */

export type ReportTemplateStatus = "missing" | "configured" | "dirty";

export function templateStatus(saved: ReportTemplate | null, dirty: boolean): ReportTemplateStatus {
  if (dirty) return "dirty";
  return saved == null ? "missing" : "configured";
}

export const TEMPLATE_STATUS_LABELS: Record<ReportTemplateStatus, string> = {
  missing: "Sin template",
  configured: "Configurado",
  dirty: "Cambios sin guardar",
};

export interface ReportDatasetFieldDescriptor {
  /** Dotted path a template band binds to, e.g. `rows.line_total`. */
  path: string;
  label: string;
  data_type: ReportParameterDataType;
  section: "Reporte" | "Parámetros" | "Partidas" | "Resúmenes";
}

/** A stable, generated timestamp keeps the sample byte-identical across renders. */
const SAMPLE_GENERATED_AT = "2026-01-31T12:00:00Z";

function sampleValue(dataType: ReportParameterDataType, index: number): unknown {
  switch (dataType) {
    case "integer":
      return index + 1;
    case "decimal":
      return index === 0 ? "574.13" : "1148.26";
    case "boolean":
      return index === 0;
    case "date":
      return "2026-01-31";
    case "datetime":
      return SAMPLE_GENERATED_AT;
    default:
      return index === 0 ? "Texto de ejemplo" : "Segundo ejemplo";
  }
}

/**
 * Every field a template may bind to, in the order the document reads them.
 * Only *visible* columns reach the dataset — the same rule the preview and the
 * Excel export already follow.
 */
export function documentDatasetSchema(
  parameters: ReportParameter[],
  columns: ReportColumn[],
  summaries: ReportSummaryConfiguration[],
): ReportDatasetFieldDescriptor[] {
  return [
    { path: "report.code", label: "Código del reporte", data_type: "string", section: "Reporte" as const },
    { path: "report.name", label: "Nombre del reporte", data_type: "string", section: "Reporte" as const },
    { path: "report.generated_at", label: "Fecha de generación", data_type: "datetime", section: "Reporte" as const },
    ...orderedReportParameters(parameters).map((parameter) => ({
      path: `parameters.${parameter.name}`,
      label: parameter.label,
      data_type: parameter.data_type,
      section: "Parámetros" as const,
    })),
    ...orderedColumns(columns).filter((column) => column.visible).map((column) => ({
      path: `rows.${column.key}`,
      label: column.label,
      data_type: column.data_type,
      section: "Partidas" as const,
    })),
    ...summaries.map((summary) => ({
      path: `summary.${summary.key}`,
      label: summary.label,
      data_type: "decimal" as ReportParameterDataType,
      section: "Resúmenes" as const,
    })),
  ];
}

/**
 * A filled example of the contract, handed to the designer so bands can be laid
 * out against realistic values. It is a *shape*, not data: nothing here is
 * fetched from the backend and no amount is computed from another.
 */
export function documentDatasetSample(
  report: { code: string; name: string },
  parameters: ReportParameter[],
  columns: ReportColumn[],
  summaries: ReportSummaryConfiguration[],
): ReportDocumentDataset {
  const visible = orderedColumns(columns).filter((column) => column.visible);
  return {
    report: { code: report.code, name: report.name, generated_at: SAMPLE_GENERATED_AT },
    parameters: Object.fromEntries(orderedReportParameters(parameters).map((parameter) => [
      parameter.name,
      sampleValue(parameter.data_type, 0),
    ])),
    rows: [0, 1].map((index) => Object.fromEntries(visible.map((column) => [
      column.key,
      sampleValue(column.data_type, index),
    ]))),
    summary: Object.fromEntries(summaries.map((summary, index) => [
      summary.key,
      sampleValue("decimal", index) as string,
    ])),
  };
}

/** Suggests the download name of a template file for one report. */
export function templateFilename(code: string, format: string): string {
  return `${code.toLowerCase().replaceAll("_", "-")}.${format}`;
}
