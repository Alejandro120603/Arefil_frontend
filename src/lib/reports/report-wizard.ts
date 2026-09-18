import { savedPlaceholderOf } from "@/lib/reports/report-excel-mapping";
import type {
  ReportAdminDefinition,
  ReportBuilderDefinition,
  ReportExcelTemplate,
  ReportExcelTemplateInspection,
} from "@/types/api";

/**
 * The guided report wizard (Frontend #33): pure orchestration logic —
 * ordering, resume position and the final checklist — kept out of the
 * component tree so it is testable without rendering anything. This is
 * deliberately not a new engine: it only reads the same contracts the
 * existing Builder/template/mapper components already read.
 */

export type ReportWizardStepId = "information" | "source" | "data" | "template" | "mapping" | "preview" | "finalize";

export interface ReportWizardStepMeta {
  id: ReportWizardStepId;
  order: number;
  title: string;
}

export const REPORT_WIZARD_STEPS: readonly ReportWizardStepMeta[] = [
  { id: "information", order: 1, title: "Información" },
  { id: "source", order: 2, title: "Fuente y entradas" },
  { id: "data", order: 3, title: "Datos del reporte" },
  { id: "template", order: 4, title: "Plantilla Excel" },
  { id: "mapping", order: 5, title: "Mapear campos" },
  { id: "preview", order: 6, title: "Vista previa" },
  { id: "finalize", order: 7, title: "Finalizar" },
];

export function reportWizardStepFromOrder(order: number): ReportWizardStepId {
  return REPORT_WIZARD_STEPS.find((step) => step.order === order)?.id ?? "information";
}

export function reportWizardStepOrder(id: ReportWizardStepId): number {
  return REPORT_WIZARD_STEPS.find((step) => step.id === id)?.order ?? 1;
}

/**
 * Where to land an admin opening an *existing* report's wizard: the first
 * structurally incomplete step among 3–4, or "mapping" once both are done.
 * Steps 1–2 are never returned here — reaching this function at all means the
 * report already exists, so its definition and source are already saved.
 *
 * Deliberately does not try to detect "has any mapping" or "was a preview
 * generated" — that would cost an extra inspection request just to decide a
 * landing step, for a fact the stepper lets the admin reach in one click
 * anyway.
 */
export function resumeReportWizardStep(input: {
  builder: ReportBuilderDefinition;
  template: ReportExcelTemplate | null;
}): ReportWizardStepId {
  if (input.builder.columns.length === 0) return "data";
  if (input.template == null) return "template";
  return "mapping";
}

export interface ReportWizardChecklistItem {
  key: string;
  label: string;
  done: boolean;
}

function countMappedCells(inspection: ReportExcelTemplateInspection | null): number {
  if (!inspection) return 0;
  return inspection.sheets.reduce(
    (total, sheet) => total + sheet.cells.filter((cell) => savedPlaceholderOf(cell) != null).length,
    0,
  );
}

function hasRepeatableRowMapping(inspection: ReportExcelTemplateInspection | null): boolean {
  if (!inspection) return false;
  return inspection.sheets.some((sheet) => sheet.cells.some((cell) => savedPlaceholderOf(cell)?.startsWith("rows.")));
}

/**
 * The Step 7 checklist — every item is either read fresh from the backend
 * contract or, for the one fact the backend never persists (a generated
 * preview), from what actually happened in this session. Never a score or a
 * percentage, only "done" or "pending".
 */
export function buildReportWizardChecklist(input: {
  report: ReportAdminDefinition;
  builder: ReportBuilderDefinition;
  template: ReportExcelTemplate | null;
  /** `null` when there is no template, or its inspection could not be read — both read as "pending" below. */
  inspection: ReportExcelTemplateInspection | null;
  previewGeneratedThisSession: boolean;
}): ReportWizardChecklistItem[] {
  const { report, builder, template, inspection, previewGeneratedThisSession } = input;
  const mappedFieldsCount = countMappedCells(inspection);
  const needsRepeatableRow = report.data_source.capabilities.includes("REPEATABLE_ROWS");

  const items: ReportWizardChecklistItem[] = [
    { key: "information", label: "Información guardada", done: true },
    { key: "source", label: `Fuente configurada: ${report.data_source.name}`, done: report.data_source.enabled },
    {
      key: "columns",
      label: `${builder.columns.length} ${builder.columns.length === 1 ? "columna configurada" : "columnas configuradas"}`,
      done: builder.columns.length > 0,
    },
    {
      key: "template",
      label: template ? `Plantilla Excel · v${template.version}` : "Plantilla Excel",
      done: template != null,
    },
    {
      key: "mappings",
      label: `${mappedFieldsCount} ${mappedFieldsCount === 1 ? "campo mapeado" : "campos mapeados"}`,
      done: mappedFieldsCount > 0,
    },
  ];
  if (needsRepeatableRow) {
    items.push({ key: "repeatable-row", label: "Fila de productos configurada", done: hasRepeatableRowMapping(inspection) });
  }
  items.push({ key: "preview", label: "Vista previa generada", done: previewGeneratedThisSession });
  return items;
}

export function reportWizardChecklistComplete(items: ReportWizardChecklistItem[]): boolean {
  return items.every((item) => item.done);
}
