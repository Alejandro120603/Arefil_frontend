import type { ReportBuilderDefinition, ReportExcelTemplate } from "@/types/api";

/**
 * The guided report wizard (Frontend #33): pure orchestration logic —
 * ordering and resume position — kept out of the
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
