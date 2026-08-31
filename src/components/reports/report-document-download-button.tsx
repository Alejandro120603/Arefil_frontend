"use client";

import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { downloadReportDocumentXlsx } from "@/lib/api/reports";
import { triggerBrowserDownload } from "@/lib/download";

/** A report with no active template is a configuration state, not a failure. */
const MISSING_TEMPLATE_MESSAGE =
  "Este reporte todavía no tiene una plantilla Excel configurada. Puedes descargar los datos con los botones de abajo.";

function documentErrorMessage(error: unknown): string {
  if (error instanceof ApiError && (error.status === 404 || error.status === 409)) return MISSING_TEMPLATE_MESSAGE;
  return getUserErrorMessage(error, "No se pudo generar la cotización Excel.");
}

/**
 * Final quotation download for one execution (Frontend #23).
 *
 * `parameters` is the snapshot the backend already ran and the user already saw
 * on screen, so the document can never disagree with the preview. Its loading
 * and error state is its own: a failing render must not hide the preview, nor
 * block the data exports beside it.
 */
export function ReportDocumentDownloadButton({
  code,
  parameters,
  disabled = false,
}: {
  code: string;
  parameters: Record<string, unknown>;
  disabled?: boolean;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function download() {
    if (downloading) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setDownloading(true);
    setError(null);
    try {
      const result = await downloadReportDocumentXlsx(code, parameters, { signal: controller.signal });
      if (result.blob.size === 0) {
        setError("El backend devolvió un documento vacío.");
        return;
      }
      triggerBrowserDownload(result, `${code.toLowerCase().replaceAll("_", "-")}-document.xlsx`);
    } catch (downloadError) {
      if (controller.signal.aborted) return;
      setError(documentErrorMessage(downloadError));
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (!controller.signal.aborted) setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={disabled || downloading} onClick={download}>
          {downloading ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
          {downloading ? "Generando..." : "Descargar cotización Excel"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
