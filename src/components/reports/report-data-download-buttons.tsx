"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getUserErrorMessage } from "@/lib/api/errors";
import { downloadReportData } from "@/lib/api/reports";
import { triggerBrowserDownload } from "@/lib/download";

export function ReportDataDownloadButtons({
  code,
  parameters,
  disabled = false,
}: {
  code: string;
  parameters: Record<string, unknown>;
  disabled?: boolean;
}) {
  const [active, setActive] = useState<"csv" | "xlsx" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const downloadingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function download(format: "csv" | "xlsx") {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    setActive(format);
    setError(null);
    try {
      const result = await downloadReportData(code, format, parameters, { signal: controller.signal });
      if (result.blob.size === 0) {
        setError("El backend devolvió un archivo vacío. Verifica los parámetros e intenta de nuevo.");
        return;
      }
      triggerBrowserDownload(result, `${code.toLowerCase().replaceAll("_", "-")}.${format}`);
    } catch (downloadError) {
      if (!controller.signal.aborted) {
        setError(getUserErrorMessage(downloadError, "No se pudieron descargar los datos del reporte."));
      }
    } finally {
      downloadingRef.current = false;
      if (controllerRef.current === controller) controllerRef.current = null;
      setActive(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {(["xlsx", "csv"] as const).map((format) => (
          <Button key={format} type="button" size="sm" variant="outline" disabled={disabled || active != null} onClick={() => download(format)}>
            {active === format ? <Loader2 className="animate-spin" /> : <Download />}
            {active === format ? "Descargando..." : `Descargar ${format.toUpperCase()}`}
          </Button>
        ))}
        {active != null && (
          <Button type="button" size="sm" variant="ghost" onClick={() => controllerRef.current?.abort()}>
            <X /> Cancelar
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
