import { ApiError } from "@/lib/api/errors";
import { isReportBuilderPreviewResponse } from "@/lib/reports/report-runtime";
import type {
  FrozenLetterhead,
  ReportLetterheadOption,
  ReportLetterheadOptions,
  ReportPresentationRequest,
} from "@/types/letterhead-runtime";

/**
 * The editable choice before generating: a `letterhead_version_id`, `null`
 * for «Sin membrete», or `undefined` while there is nothing valid selected
 * (options not loaded yet, or the chosen version stopped being offered).
 */
export type LetterheadSelection = number | null | undefined;

export const PRESENTATION_KEY = "presentation";

function offeredVersionIds(options: ReportLetterheadOptions): Set<number> {
  return new Set(
    options.options
      .map((option) => option.letterhead_version_id)
      .filter((id): id is number => id != null),
  );
}

/** The backend's default when it is still offered, else «Sin membrete». */
export function initialLetterheadSelection(options: ReportLetterheadOptions): number | null {
  const fallback = options.default_letterhead_version_id;
  return fallback != null && offeredVersionIds(options).has(fallback) ? fallback : null;
}

/**
 * After the options are read again, keep the user's choice only if it is
 * still offered. A version that disappeared (deactivated, unassigned or
 * superseded by a new upload) is never swapped for another one: the user has
 * to choose again. «Sin membrete» is always valid.
 */
export function reconcileLetterheadSelection(
  current: LetterheadSelection,
  options: ReportLetterheadOptions,
): LetterheadSelection {
  if (current === undefined) return undefined;
  if (current === null) return null;
  return offeredVersionIds(options).has(current) ? current : undefined;
}

/** Non-synthetic options, in the backend's order. */
export function letterheadChoices(options: ReportLetterheadOptions): ReportLetterheadOption[] {
  return options.options.filter((option) => option.letterhead_version_id != null);
}

/**
 * Adds the reserved `presentation` key next to the business parameters (the
 * backend splits it off before validating them). Parameters are copied, never
 * mutated.
 */
export function withPresentation(
  parameters: Record<string, unknown>,
  selection: number | null,
): Record<string, unknown> {
  const presentation: ReportPresentationRequest = { letterhead_version_id: selection };
  return { ...parameters, [PRESENTATION_KEY]: presentation };
}

/** A refusal of the selection itself (`LETTERHEAD_*` code, or a validation error under `presentation`). */
export function isLetterheadSelectionError(error: unknown): boolean {
  if (!(error instanceof ApiError) || (error.status !== 409 && error.status !== 422)) return false;
  const detail = error.detail;
  if (Array.isArray(detail)) {
    return detail.some((item) => {
      const loc = (item as { loc?: unknown[] } | null)?.loc;
      return Array.isArray(loc) && loc[0] === PRESENTATION_KEY;
    });
  }
  if (detail && typeof detail === "object") {
    const code = (detail as Record<string, unknown>).code;
    return typeof code === "string" && code.startsWith("LETTERHEAD_");
  }
  return false;
}

/**
 * The presentation the backend froze in this execution, read from the
 * response itself — never inferred from the live catalog. `undefined` when
 * the payload does not carry one (not a builder execution).
 */
export function frozenLetterhead(payload: unknown): FrozenLetterhead | null | undefined {
  if (!isReportBuilderPreviewResponse(payload)) return undefined;
  const presentation = payload.presentation;
  if (presentation == null || typeof presentation !== "object") return undefined;
  return presentation.letterhead ?? null;
}

/** The execution answers for the selection that was sent (defensive: the backend guarantees it). */
export function presentationMatches(payload: unknown, requested: number | null): boolean {
  const frozen = frozenLetterhead(payload);
  if (frozen === undefined) return true;
  return (frozen?.letterhead_version_id ?? null) === requested;
}
