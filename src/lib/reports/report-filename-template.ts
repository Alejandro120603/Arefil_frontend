/**
 * `filename_template` — the configurable name of the final XLSX document
 * (Backend #26, `app/services/reports/document_filenames.py`).
 *
 * Everything here mirrors that module on purpose: the same token grammar, the
 * same allow list and the same `sanitize_filename` pass. The backend stays the
 * authority — this only lets the admin see, before saving, what it will
 * answer, and catch an unsupported placeholder without a round trip.
 */
import type { ReportParameter } from "@/types/api";

/** `String(500)` on `report_definitions.filename_template`. */
export const FILENAME_TEMPLATE_MAX_LENGTH = 500;

/** `_TOKEN_RE` in the backend: only these two namespaces exist. */
const TOKEN_RE = /\{\{\s*(parameters|report)\.([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;
const ANY_TOKEN_RE = /\{\{([^{}]+)\}\}/g;
const TRAILING_XLSX_RE = /(?:\.xlsx)+\s*$/i;
/** `_REPORT_KEYS`; `parameters.*` is open to whatever the report declares. */
export const REPORT_PLACEHOLDER_KEYS = ["code", "name"] as const;

export type ReportPlaceholderKey = (typeof REPORT_PLACEHOLDER_KEYS)[number];

export interface FilenamePlaceholder {
  token: string;
  label: string;
}

const REPORT_PLACEHOLDER_LABELS: Record<ReportPlaceholderKey, string> = {
  code: "Código del reporte",
  name: "Nombre del reporte",
};

/**
 * Every placeholder the backend accepts for this report, and nothing else:
 * its declared parameters plus the two `report.*` keys.
 */
export function supportedFilenamePlaceholders(
  parameters: readonly ReportParameter[],
): FilenamePlaceholder[] {
  const fromParameters = parameters
    .filter((parameter) => /^[A-Za-z][A-Za-z0-9_]*$/.test(parameter.name))
    .map((parameter) => ({
      token: `{{parameters.${parameter.name}}}`,
      label: parameter.label.trim() || parameter.name,
    }));
  return [
    ...fromParameters,
    ...REPORT_PLACEHOLDER_KEYS.map((key) => ({
      token: `{{report.${key}}}`,
      label: REPORT_PLACEHOLDER_LABELS[key],
    })),
  ];
}

/**
 * Client-side mirror of `validate_filename_template`. It is a courtesy check:
 * the messages match the backend's so the same wording never surprises the
 * admin twice, but a template this accepts can still be refused on save.
 */
export function validateFilenameTemplate(
  template: string,
  parameterNames: readonly string[],
): string[] {
  const errors: string[] = [];
  const trimmed = template.trim();
  if (!trimmed) return errors;
  if (trimmed.length > FILENAME_TEMPLATE_MAX_LENGTH) {
    errors.push(`El patrón del nombre de archivo no puede superar ${FILENAME_TEMPLATE_MAX_LENGTH} caracteres.`);
  }
  const declared = new Set(parameterNames);
  for (const match of trimmed.matchAll(ANY_TOKEN_RE)) {
    const token = new RegExp(`^${TOKEN_RE.source}$`).exec(match[0]);
    if (token == null) {
      errors.push(`Placeholder no permitido en el nombre de archivo: {{${match[1].trim()}}}.`);
      continue;
    }
    const [, namespace, key] = token;
    if (namespace === "report" && !(REPORT_PLACEHOLDER_KEYS as readonly string[]).includes(key)) {
      errors.push(`Placeholder no permitido en el nombre de archivo: {{report.${key}}}.`);
      continue;
    }
    if (namespace === "parameters" && !declared.has(key)) {
      errors.push(`El parámetro '${key}' usado por el nombre de archivo no está definido.`);
    }
  }
  // The backend fails on the first offending token, so a residual complaint on
  // top of a reported one would only be noise.
  const residual = trimmed.replaceAll(TOKEN_RE, "");
  if (errors.length === 0 && (residual.includes("{{") || residual.includes("}}"))) {
    errors.push("El nombre de archivo contiene un placeholder incompleto o inválido.");
  }
  return errors;
}

/** Port of `sanitize_filename` (`app/services/donaldson/security.py`). */
export function sanitizeReportFilename(candidate: string): string {
  const name = candidate.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const suffix = dot > 0 ? name.slice(dot).toLowerCase() : ".xlsx";
  const safeStem = stem.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+|[._]+$/g, "") || "archivo";
  return `${safeStem}${suffix}`;
}

/** Fallback stem used by the backend when no template is configured. */
export function fallbackReportFilename(code: string): string {
  return sanitizeReportFilename(`${code.toLowerCase().replaceAll("_", "-")}-document.xlsx`);
}

/**
 * Renders a value the way the backend's `_filename_value` would. Anything
 * non-scalar has no textual form there either, so it counts as unavailable
 * rather than being guessed at.
 */
function filenameValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

export interface FilenamePreview {
  /** Resolved name, or `null` when there is no sample data to resolve it. */
  filename: string | null;
  /** Placeholders left unresolved; the preview is withheld rather than faked. */
  missing: string[];
}

/**
 * Builds the preview only from data that really exists: the report's own
 * code/name and the sample values available for its parameters (their
 * defaults, or the values of a real execution when the caller has them).
 * A placeholder without data is reported, never invented.
 */
export function previewReportFilename(
  template: string,
  context: { code: string; name: string; parameters: Record<string, unknown> },
): FilenamePreview {
  const trimmed = template.trim();
  if (!trimmed) return { filename: fallbackReportFilename(context.code), missing: [] };
  const missing: string[] = [];
  const rendered = trimmed.replaceAll(TOKEN_RE, (match, namespace: string, key: string) => {
    const raw = namespace === "report"
      ? (key === "code" ? context.code : key === "name" ? context.name : null)
      : (key in context.parameters ? context.parameters[key] : null);
    const value = filenameValue(raw);
    if (value == null || value.trim() === "") {
      missing.push(match);
      return "";
    }
    return value;
  });
  if (missing.length > 0) return { filename: null, missing };
  const stem = rendered.replace(TRAILING_XLSX_RE, "").trim();
  return { filename: sanitizeReportFilename(`${stem}.xlsx`), missing: [] };
}

/** Sample values for the preview: a parameter contributes only if it has a default. */
export function sampleParameterValues(parameters: readonly ReportParameter[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const parameter of parameters) {
    if (parameter.default_value != null) values[parameter.name] = parameter.default_value;
  }
  return values;
}
