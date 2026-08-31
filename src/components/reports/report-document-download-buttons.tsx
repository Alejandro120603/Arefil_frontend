"use client";

import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, FileType, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { downloadReportDocument } from "@/lib/api/reports";
import { triggerBrowserDownload } from "@/lib/download";
import type { ReportDocumentFormat } from "@/types/api";

const DOCUMENT_LABELS: Record<ReportDocumentFormat, string> = { pdf: "PDF", xlsx: "Excel" };

/** A report with no active template is a configuration state, not a failure. */
const MISSING_TEMPLATE_MESSAGE =
  "Este reporte todavía no tiene un template documental. Puedes descargar los datos con los botones de abajo.";
/** The documental Excel is optional in the backend contract (Backend #22). */
const UNSUPPORTED_MESSAGE = "El backend no genera este formato documental para el reporte.";

function documentErrorMessage(error: unknown, format: ReportDocumentFormat): string {
  if (error instanceof ApiError && (error.status === 404 || error.status === 409)) return MISSING_TEMPLATE_MESSAGE;
  if (error instanceof ApiError && error.status === 501) return UNSUPPORTED_MESSAGE;
  return getUserErrorMessage(error, `No se pudo generar el documento ${DOCUMENT_LABELS[format]}.`);
}

/**
 * Final document downloads for one execution (Frontend #23).
 *
 * `parameters` is the snapshot the backend already ran and the user already saw
 * on screen, so the document can never disagree with the preview. Each format
 * keeps its own loading and error state: a failing PDF render must not hide the
 * preview, nor block the Excel download or the data exports beside it.
 */
export function ReportDocumentDownloadButtons({
  code,
  parameters,
  formats = ["pdf", "xlsx"],
  disabled = false,
}: {
  code: string;
  parameters: Record<string, unknown>;
  formats?: ReportDocumentFormat[];
  disabled?: boolean;
}) {
  const [active, setActive] = useState<ReportDocumentFormat | null>(null);
  const [errors, setErrors] = useState<Partial<Record<ReportDocumentFormat, string>>>({});
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function download(format: ReportDocumentFormat) {
    if (active != null) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setActive(format);
    setErrors((current) => ({ ...current, [format]: undefined }));
    try {
      const result = await downloadReportDocument(code, format, parameters, { signal: controller.signal });
      if (result.blob.size === 0) {
        setErrors((current) => ({ ...current, [format]: "El backend devolvió un documento vacío." }));
        return;
      }
      triggerBrowserDownload(result, `${code.toLowerCase().replaceAll("_", "-")}.${format}`);
    } catch (error) {
      if (controller.signal.aborted) return;
      setErrors((current) => ({ ...current, [format]: documentErrorMessage(error, format) }));
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (!controller.signal.aborted) setActive(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {formats.map((format) => (
          <Button
            key={format}
            type="button"
            variant={format === "pdf" ? "default" : "outline"}
            disabled={disabled || active != null}
            onClick={() => download(format)}
          >
            {active === format
              ? <Loader2 className="animate-spin" />
              : format === "pdf" ? <FileType /> : <FileSpreadsheet />}
            {active === format ? "Generando..." : `Descargar ${DOCUMENT_LABELS[format]}`}
          </Button>
        ))}
      </div>
      {formats.map((format) => errors[format] && (
        <p key={format} className="text-sm text-destructive">
          {DOCUMENT_LABELS[format]}: {errors[format]}
        </p>
      ))}
    </div>
  );
}
