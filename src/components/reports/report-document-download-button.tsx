"use client";

import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { downloadReportDocumentXlsx } from "@/lib/api/reports";
import { triggerBrowserDownload } from "@/lib/download";
import { fallbackReportFilename } from "@/lib/reports/report-filename-template";

/** A report with no active template is a configuration state, not a failure. */
const MISSING_TEMPLATE_MESSAGE =
  "Este reporte todavía no tiene una plantilla Excel configurada. Puedes descargar los datos con los botones de abajo.";

/**
 * The snapshot behind this execution is gone (expired, cleaned up, or bound to
 * another report). Nothing the user can do here fixes it: only a new execution
 * produces a new id.
 */
export const STALE_EXECUTION_MESSAGE =
  "La ejecución de este reporte ya no está disponible. Regenera el reporte para continuar.";

/** Backend #25 answers 404 for a missing snapshot and 409 for one of another report. */
function isStaleExecution(error: unknown): boolean {
  if (!(error instanceof ApiError) || (error.status !== 404 && error.status !== 409)) return false;
  return /ejecuci[oó]n|expir/i.test(error.message);
}

function documentErrorMessage(error: unknown): string {
  if (isStaleExecution(error)) return STALE_EXECUTION_MESSAGE;
  if (error instanceof ApiError && (error.status === 404 || error.status === 409)) return MISSING_TEMPLATE_MESSAGE;
  return getUserErrorMessage(error, "No se pudo generar la cotización Excel.");
}

/**
 * Final quotation download for one execution (Frontend #25).
 *
 * `executionId` is the immutable snapshot the backend persisted for the
 * preview the user approved, and it is the only thing this request sends: the
 * document renders from the frozen rows and totals, never from parameters that
 * may have moved on. An edit drops the id upstream, and a snapshot the backend
 * no longer knows locks the button until the report is generated again - so a
 * stale execution can never produce a file. Its loading and error state is its
 * own: a failing render must not hide the preview, nor block the data exports
 * beside it.
 */
export function ReportDocumentDownloadButton({
  code,
  executionId,
  disabled = false,
}: {
  code: string;
  /** `null` while the report has no persisted snapshot to render from. */
  executionId: string | null;
  disabled?: boolean;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Id of the snapshot the backend refused; blocks retries of the same one. */
  const [staleExecutionId, setStaleExecutionId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const stale = executionId == null || executionId === staleExecutionId;

  async function download() {
    if (downloading || executionId == null || stale) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setDownloading(true);
    setError(null);
    try {
      const result = await downloadReportDocumentXlsx(code, executionId, { signal: controller.signal });
      if (result.blob.size === 0) {
        setError("El backend devolvió un documento vacío.");
        return;
      }
      /*
       * The name always comes from the backend's `Content-Disposition`: with
       * Backend #26 it carries the report's configured `filename_template`
       * (`BONATTI_FILTROS_LMR850205-048.xlsx`), which no name built here could
       * know. This mirrors only the backend's own fallback, for the case where
       * the header is missing.
       */
      triggerBrowserDownload(result, fallbackReportFilename(code));
    } catch (downloadError) {
      if (controller.signal.aborted) return;
      if (isStaleExecution(downloadError)) setStaleExecutionId(executionId);
      setError(documentErrorMessage(downloadError));
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (!controller.signal.aborted) setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={disabled || downloading || stale} onClick={download}>
          {downloading ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
          {downloading ? "Generando..." : "Descargar cotización Excel"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!error && executionId == null && (
        <p className="text-sm text-muted-foreground">{STALE_EXECUTION_MESSAGE}</p>
      )}
    </div>
  );
}
