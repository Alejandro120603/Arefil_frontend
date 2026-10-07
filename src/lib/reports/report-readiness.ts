import type { ReportWizardStepId } from "@/lib/reports/report-wizard";
import type { ReportReadiness, ReportReadinessIssue } from "@/types/api";

/**
 * Presentation of the backend's report readiness (Frontend #44). The backend
 * decides what is ready (Backend #38); this module only groups its issues,
 * maps their semantic `step` to a wizard step and names the operational
 * status. It never evaluates the configuration itself.
 */

/** The one place that turns a readiness `step` into a wizard destination. */
const STEP_DESTINATIONS: Record<string, ReportWizardStepId> = {
  information: "information",
  source: "source",
  data: "data",
  template: "template",
  mapping: "mapping",
};

const SECTION_TITLES: Record<string, string> = {
  information: "Información",
  source: "Fuente y entradas",
  data: "Datos del reporte",
  template: "Plantilla Excel",
  mapping: "Mapear campos",
};

/** Sections the backend always evaluates, shown as ✓ when they have no issue. */
const EVALUATED_SECTIONS = ["source", "data", "template"] as const;
const SECTION_ORDER = ["information", "source", "data", "template", "mapping"];

export function readinessDestination(step: string | null | undefined): ReportWizardStepId | null {
  return step != null ? STEP_DESTINATIONS[step] ?? null : null;
}

export interface ReadinessSection {
  /** The backend step, or `null` for issues whose step this build does not know. */
  step: string | null;
  title: string;
  destination: ReportWizardStepId | null;
  issues: ReportReadinessIssue[];
  /** The worst severity in the section; `null` when it has no issue. */
  severity: ReportReadinessIssue["severity"] | null;
}

function worst(issues: ReportReadinessIssue[]): ReadinessSection["severity"] {
  if (issues.some((issue) => issue.severity === "blocker")) return "blocker";
  return issues.length > 0 ? "warning" : null;
}

/**
 * Groups issues by step, in wizard order. Every evaluated section appears
 * (as ✓ when clean); unknown steps are collected in a final "Otros" section so
 * a new backend issue is never hidden.
 */
export function readinessSections(readiness: ReportReadiness): ReadinessSection[] {
  const byStep = new Map<string, ReportReadinessIssue[]>();
  const unknown: ReportReadinessIssue[] = [];
  for (const issue of readiness.issues) {
    if (issue.step in SECTION_TITLES) byStep.set(issue.step, [...(byStep.get(issue.step) ?? []), issue]);
    else unknown.push(issue);
  }
  const sections: ReadinessSection[] = SECTION_ORDER
    .filter((step) => byStep.has(step) || (EVALUATED_SECTIONS as readonly string[]).includes(step))
    .map((step) => {
      const issues = byStep.get(step) ?? [];
      return { step, title: SECTION_TITLES[step], destination: readinessDestination(step), issues, severity: worst(issues) };
    });
  if (unknown.length > 0) {
    sections.push({ step: null, title: "Otros", destination: null, issues: unknown, severity: worst(unknown) });
  }
  return sections;
}

export type ReportOperationalStatusKey =
  | "enabled-ready"
  | "enabled-attention"
  | "ready-to-enable"
  | "pending"
  | "enabled-unknown"
  | "unknown"
  | "loading";

export interface ReportOperationalStatus {
  key: ReportOperationalStatusKey;
  label: string;
  tone: "success" | "warning" | "destructive" | "neutral";
}

/**
 * `enabled` (administrative intent) × readiness (backend, computed). A
 * readiness that is still loading or failed to load is never reported as
 * "not ready": it is unknown.
 */
export function reportOperationalStatus(
  enabled: boolean,
  readiness: Pick<ReportReadiness, "ready"> | null,
  state: "loading" | "error" | "ready",
): ReportOperationalStatus {
  if (state === "loading") return { key: "loading", label: "Comprobando estado…", tone: "neutral" };
  if (state === "error" || readiness == null) {
    return enabled
      ? { key: "enabled-unknown", label: "Habilitado · Estado no disponible", tone: "neutral" }
      : { key: "unknown", label: "Estado no disponible", tone: "neutral" };
  }
  if (enabled) {
    return readiness.ready
      ? { key: "enabled-ready", label: "Habilitado · Listo", tone: "success" }
      : { key: "enabled-attention", label: "Habilitado · Requiere atención", tone: "destructive" };
  }
  return readiness.ready
    ? { key: "ready-to-enable", label: "Listo para habilitar", tone: "warning" }
    : { key: "pending", label: "Configuración pendiente", tone: "neutral" };
}

function isIssue(value: unknown): value is ReportReadinessIssue {
  if (value == null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.code === "string"
    && (record.severity === "blocker" || record.severity === "warning")
    && typeof record.message === "string"
    && (typeof record.step === "string" || record.step == null);
}

/** Reads `issues[]` from an untrusted payload, keeping only well-formed items. */
export function parseReadinessIssues(value: unknown): ReportReadinessIssue[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isIssue).map((issue) => ({ ...issue, step: issue.step ?? "" }));
}
