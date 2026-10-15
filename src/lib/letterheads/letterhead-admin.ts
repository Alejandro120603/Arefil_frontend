import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { formatFileSize } from "@/lib/reports/report-excel-template";
import type {
  LetterheadAdmin,
  LetterheadVersion,
  LetterheadVersionUpload,
  ReportLetterheadAssignment,
  ReportLetterheadAssignmentsWrite,
} from "@/types/letterhead-admin";

/** The two reports V1 offers letterheads for (Point A §3); the backend decides what each supports. */
export const LETTERHEAD_REPORTS = [
  { code: "PRUEBA_COTIZACION", label: "Cotización" },
  { code: "PRUEBA_DESCUENTO", label: "Descuento" },
] as const;

export function letterheadReportLabel(code: string): string {
  return LETTERHEAD_REPORTS.find((report) => report.code === code)?.label ?? code;
}

/**
 * Mirrors the backend default `LETTERHEAD_SOURCE_MAX_BYTES` so an oversized
 * file is refused before uploading it. The backend stays the authority: a
 * smaller configured limit still answers `413`, which is shown as well.
 */
export const LETTERHEAD_SOURCE_MAX_BYTES = 8_000_000;
export const LETTERHEAD_SLUG_MAX_LENGTH = 64;
export const LETTERHEAD_NAME_MAX_LENGTH = 150;
/** Same rule as `SLUG_PATTERN` in `backend/app/db/models/letterhead.py`. */
export const LETTERHEAD_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const LETTERHEAD_XLSX_ACCEPT =
  ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** «Iván Vázquez» → `ivan-vazquez`: a suggestion only, the admin can edit it. */
export function suggestLetterheadSlug(displayName: string): string {
  return displayName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LETTERHEAD_SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}

/** Extension and size only; the backend validates the workbook itself. */
export function letterheadFileError(file: File | null): string | null {
  if (file == null) return "Selecciona el archivo XLSX del membrete.";
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return "Solo se aceptan archivos .xlsx (no DOCX, PDF ni imágenes sueltas).";
  }
  if (file.size === 0) return "El archivo está vacío.";
  if (file.size > LETTERHEAD_SOURCE_MAX_BYTES) {
    return `El archivo excede el tamaño máximo permitido (${formatFileSize(LETTERHEAD_SOURCE_MAX_BYTES)}).`;
  }
  return null;
}

export function letterheadNameError(displayName: string): string | null {
  const value = displayName.trim();
  if (value === "") return "El nombre visible es obligatorio.";
  if (value.length > LETTERHEAD_NAME_MAX_LENGTH) {
    return `El nombre visible admite como máximo ${LETTERHEAD_NAME_MAX_LENGTH} caracteres.`;
  }
  return null;
}

export function letterheadSlugError(slug: string): string | null {
  const value = slug.trim();
  if (value === "") return "El identificador es obligatorio.";
  if (value.length > LETTERHEAD_SLUG_MAX_LENGTH || !LETTERHEAD_SLUG_PATTERN.test(value)) {
    return "Usa solo minúsculas, dígitos y guiones simples (por ejemplo, asistente-ventas), hasta 64 caracteres.";
  }
  return null;
}

export type LetterheadFormField = "display_name" | "slug" | "file" | "form";
export type LetterheadFormErrors = Partial<Record<LetterheadFormField, string>>;

export function validateLetterheadCreateForm(values: {
  displayName: string;
  slug: string;
  file: File | null;
}): LetterheadFormErrors {
  const errors: LetterheadFormErrors = {};
  const name = letterheadNameError(values.displayName);
  const slug = letterheadSlugError(values.slug);
  const file = letterheadFileError(values.file);
  if (name) errors.display_name = name;
  if (slug) errors.slug = slug;
  if (file) errors.file = file;
  return errors;
}

/** Stable `detail.code` of a letterhead endpoint error, if any. */
export function letterheadErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const detail = error.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const code = (detail as Record<string, unknown>).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

const LENGTH_REQUIRED_MESSAGE = "El navegador no informó el tamaño del archivo. Vuelve a intentarlo.";
const TOO_LARGE_MESSAGE = "El archivo excede el tamaño máximo que acepta el servidor.";

/** Places an upload failure (create or new version) on the field it belongs to. */
export function letterheadUploadErrors(error: unknown, fallback: string): LetterheadFormErrors {
  if (!(error instanceof ApiError)) return { form: getUserErrorMessage(error, fallback) };
  const code = letterheadErrorCode(error);
  if (error.status === 411) return { form: LENGTH_REQUIRED_MESSAGE };
  if (error.status === 413) return { file: TOO_LARGE_MESSAGE };
  if (code === "invalid_slug") return { slug: error.message };
  if (code === "invalid_display_name") return { display_name: error.message };
  if (error.status === 409 && code === "letterhead_conflict") return { slug: error.message };
  if (error.status === 422) return { file: error.message };
  return { form: error.message };
}

/** One row of the assignment editor of a report. */
export interface AssignmentRow {
  letterhead_id: number;
  display_name: string;
  slug: string;
  letterhead_is_active: boolean;
  current_version: number | null;
  /** The backend already has an assignment (active or not) for this pair. */
  assigned: boolean;
  /** Available in this report's selector. */
  is_active: boolean;
}

/**
 * Existing assignments first, in display order, then every catalog
 * letterhead not yet assigned (unavailable until the admin turns it on).
 */
export function buildAssignmentRows(
  assignments: ReportLetterheadAssignment[],
  catalog: LetterheadAdmin[],
): AssignmentRow[] {
  const assigned = [...assignments]
    .sort((a, b) => a.display_order - b.display_order || a.letterhead_id - b.letterhead_id)
    .map<AssignmentRow>((item) => ({
      letterhead_id: item.letterhead_id,
      display_name: item.display_name,
      slug: item.slug,
      letterhead_is_active: item.letterhead_is_active,
      current_version: item.current_version,
      assigned: true,
      is_active: item.is_active,
    }));
  const known = new Set(assigned.map((row) => row.letterhead_id));
  const unassigned = catalog
    .filter((letterhead) => !known.has(letterhead.id))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "es"))
    .map<AssignmentRow>((letterhead) => ({
      letterhead_id: letterhead.id,
      display_name: letterhead.display_name,
      slug: letterhead.slug,
      letterhead_is_active: letterhead.is_active,
      current_version: letterhead.current_version?.version ?? null,
      assigned: false,
      is_active: false,
    }));
  return [...assigned, ...unassigned];
}

/** The backend accepts as default only an active assignment of an active letterhead with a version. */
export function canBeDefault(row: AssignmentRow): boolean {
  return row.is_active && row.letterhead_is_active && row.current_version != null;
}

/**
 * The complete PUT body. Every row the backend already knows is always sent
 * (with its own state), so a replace never deactivates an assignment by
 * omission; a never-assigned row is only sent once it is turned on.
 */
export function buildAssignmentsWrite(
  rows: AssignmentRow[],
  defaultLetterheadId: number | null,
  revision: string,
): ReportLetterheadAssignmentsWrite {
  if (defaultLetterheadId != null) {
    const row = rows.find((candidate) => candidate.letterhead_id === defaultLetterheadId);
    if (row == null || !canBeDefault(row)) {
      throw new Error("El membrete predeterminado debe estar disponible, activo y con una versión.");
    }
  }
  return {
    assignments: rows
      .filter((row) => row.assigned || row.is_active)
      .map((row) => ({ letterhead_id: row.letterhead_id, is_active: row.is_active })),
    default_letterhead_id: defaultLetterheadId,
    expected_revision: revision,
  };
}

export function moveRow<T>(rows: T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset;
  if (index < 0 || index >= rows.length || target < 0 || target >= rows.length) return rows;
  const next = [...rows];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Reports where this letterhead is offered today: an active assignment is not
 * enough, the letterhead itself must be active and have a version (the same
 * rule as the runtime options). Deactivation keeps assignments on purpose.
 */
export function offeredLetterheadReports(letterhead: LetterheadAdmin): LetterheadAdmin["assignments"] {
  if (!letterhead.is_active || letterhead.current_version == null) return [];
  return letterhead.assignments.filter((assignment) => assignment.is_active);
}

/**
 * The detail state after a confirmed upload. A new version becomes the
 * current one, heads the history once (never duplicated) and bumps the
 * count; an identical file (`created: false`) changes nothing.
 */
export function applyUploadedVersion(
  current: { letterhead: LetterheadAdmin; versions: LetterheadVersion[] },
  uploaded: LetterheadVersionUpload,
): { letterhead: LetterheadAdmin; versions: LetterheadVersion[] } {
  if (!uploaded.created) return current;
  const { created: _created, ...stored } = uploaded;
  void _created;
  const version: LetterheadVersion = { ...stored, is_current: true };
  const known = current.versions.some((item) => item.id === version.id);
  const others = current.versions
    .filter((item) => item.id !== version.id)
    .map((item) => ({ ...item, is_current: false }));
  return {
    letterhead: {
      ...current.letterhead,
      current_version: version,
      version_count: known ? current.letterhead.version_count : current.letterhead.version_count + 1,
    },
    versions: [version, ...others].sort((a, b) => b.version - a.version),
  };
}

/** Route segment `[id]` → a positive integer id, or `null`. */
export function parseLetterheadId(raw: string): number | null {
  const parsed = Number(raw);
  return /^\d+$/.test(raw) && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/** First 12 hex digits, for a compact technical display; the full value stays available. */
export function shortChecksum(checksum: string): string {
  return checksum.slice(0, 12);
}
