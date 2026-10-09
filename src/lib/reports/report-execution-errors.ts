import { ApiError } from "@/lib/api/errors";

/**
 * How an export of a stored execution failed (Backend: execution snapshots).
 *
 * - `truncated`: the snapshot is a builder preview cut at the preview limit;
 *   the backend refuses to export it (409 `EXECUTION_TRUNCATED`).
 * - `stale`: the snapshot is gone or belongs to another report (404/409).
 * - `other`: anything else; the caller shows the backend's own message.
 */
export type ExecutionExportFailure = "truncated" | "stale" | "other";

/**
 * The snapshot behind this execution is gone (expired, cleaned up, or bound to
 * another report). Nothing the user can do here fixes it: only a new execution
 * produces a new id.
 */
export const STALE_EXECUTION_MESSAGE =
  "La ejecución de este reporte ya no está disponible. Regenera el reporte para continuar.";

export const TRUNCATED_EXECUTION_MESSAGE =
  "Esta vista previa incluye solo las primeras filas y no puede descargarse. Genera el reporte completo para descargarlo.";

export function executionExportFailure(error: unknown): ExecutionExportFailure {
  if (!(error instanceof ApiError)) return "other";
  const detail = error.detail;
  if (error.status === 409 && detail != null && typeof detail === "object"
    && (detail as Record<string, unknown>).code === "EXECUTION_TRUNCATED") {
    return "truncated";
  }
  if ((error.status === 404 || error.status === 409) && /ejecuci[oó]n|expir/i.test(error.message)) return "stale";
  return "other";
}
