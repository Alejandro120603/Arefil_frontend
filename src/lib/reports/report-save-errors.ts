import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { placeholderIdentity } from "@/lib/reports/report-excel-mapping";
import { templateLocationLabel } from "@/lib/reports/report-template-dependencies";
import type { ReportColumn, ReportParameter, ReportSummaryConfiguration } from "@/types/api";

/**
 * The one place that reads the failure of a report configuration save
 * (`PUT /inputs`, `PUT /builder`, `PATCH /reports/{code}`) — Frontend #43.
 *
 * Backend #37 answers a write that would orphan a placeholder of the active
 * Excel template with a *structured* `detail`; every other failure keeps
 * `detail: "mensaje"` (or FastAPI's validation array). Components ask this
 * module instead of branching on `typeof detail` themselves.
 */
export const ACTIVE_TEMPLATE_INCOMPATIBLE = "ACTIVE_TEMPLATE_INCOMPATIBLE";

export interface ActiveTemplateIssue {
  /** Bare `namespace.key`, when the backend could tell which placeholder. */
  placeholder: string | null;
  sheet: string | null;
  cell: string | null;
  range: string | null;
  /** Open-ended: new reasons must still render through the fallback copy. */
  reason: string;
}

export type ReportSaveFailure =
  | { kind: "template"; message: string; templateVersion: number | null; issues: ActiveTemplateIssue[] }
  | { kind: "conflict"; message: string }
  | { kind: "message"; message: string };

export const TEMPLATE_INCOMPATIBLE_MESSAGE = "La plantilla Excel utiliza datos que este cambio eliminaría.";
export const SAVE_CONFLICT_MESSAGE =
  "La configuración o la plantilla cambió mientras guardabas. Intenta guardar nuevamente.";

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function bare(placeholder: string | null): string | null {
  if (placeholder == null) return null;
  // The backend already sends `namespace.key`; tolerate a wrapped token too.
  const identity = placeholderIdentity(placeholder);
  return identity ? `${identity.namespace}.${identity.key}` : placeholder;
}

function parseIssues(value: unknown): ActiveTemplateIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (item == null || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    return [{
      placeholder: bare(text(record.placeholder)),
      sheet: text(record.sheet),
      cell: text(record.cell),
      range: text(record.range),
      reason: text(record.reason) ?? "unknown",
    }];
  });
}

export function reportSaveFailure(error: unknown, fallback: string): ReportSaveFailure {
  if (error instanceof ApiError && error.status === 409) {
    return { kind: "conflict", message: SAVE_CONFLICT_MESSAGE };
  }
  if (error instanceof ApiError && error.status === 422 && error.detail != null && typeof error.detail === "object" && !Array.isArray(error.detail)) {
    const detail = error.detail as Record<string, unknown>;
    if (detail.code === ACTIVE_TEMPLATE_INCOMPATIBLE) {
      return {
        kind: "template",
        message: TEMPLATE_INCOMPATIBLE_MESSAGE,
        templateVersion: typeof detail.template_version === "number" ? detail.template_version : null,
        issues: parseIssues(detail.issues),
      };
    }
  }
  return { kind: "message", message: getUserErrorMessage(error, fallback) };
}

/** For surfaces with room for one line only (e.g. enabling the report). */
export function reportSaveFailureMessage(error: unknown, fallback: string): string {
  const failure = reportSaveFailure(error, fallback);
  if (failure.kind !== "template" || failure.issues.length === 0) return failure.message;
  const where = failure.issues.map((issue) => issueLocation(issue)).filter(Boolean).join(", ");
  return where ? `${failure.message} (${where})` : failure.message;
}

/** Known reasons get business copy; anything else falls back safely. */
const REASON_COPY: Record<string, string> = {
  unknown_placeholder: "ya no existiría",
};

export function issueReason(issue: ActiveTemplateIssue): string {
  return REASON_COPY[issue.reason] ?? "no sería compatible";
}

export function issueLocation(issue: ActiveTemplateIssue): string {
  if (issue.sheet == null) return "";
  return templateLocationLabel({ sheet: issue.sheet, cell: issue.cell ?? "", range: issue.range });
}

/**
 * Resolves `parameters.customer_name` → `Cliente` from whichever labels the
 * caller still knows (persisted and draft). Unknown → the placeholder itself.
 */
export function placeholderLabelResolver(sources: {
  parameters?: readonly ReportParameter[];
  columns?: readonly ReportColumn[];
  summaries?: readonly ReportSummaryConfiguration[];
}): (placeholder: string | null) => string {
  const labels = new Map<string, string>();
  for (const parameter of sources.parameters ?? []) labels.set(`parameters.${parameter.name}`, parameter.label || parameter.name);
  for (const column of sources.columns ?? []) labels.set(`rows.${column.key}`, column.label || column.key);
  for (const summary of sources.summaries ?? []) labels.set(`summary.${summary.key}`, summary.label || summary.key);
  return (placeholder) => (placeholder == null ? "Dato de la plantilla" : labels.get(placeholder) ?? placeholder);
}
