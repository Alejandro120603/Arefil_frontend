"use client";

import { useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getUserErrorMessage } from "@/lib/api/errors";
import { downloadReportData } from "@/lib/api/reports";
import { triggerBrowserDownload } from "@/lib/download";

export function ReportDataDownloadButtons({
  code,
  parameters,
}: {
  code: string;
  parameters: Record<string, unknown>;
}) {
  const [active, setActive] = useState<"csv" | "xlsx" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const downloadingRef = useRef(false);

  async function download(format: "csv" | "xlsx") {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    setActive(format);
    setError(null);
    try {
      const result = await downloadReportData(code, format, parameters);
      triggerBrowserDownload(result, `${code.toLowerCase().replaceAll("_", "-")}.${format}`);
    } catch (downloadError) {
      setError(getUserErrorMessage(downloadError, "No se pudieron descargar los datos del reporte."));
    } finally {
      downloadingRef.current = false;
      setActive(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {(["xlsx", "csv"] as const).map((format) => (
          <Button key={format} type="button" size="sm" variant="outline" disabled={active != null} onClick={() => download(format)}>
            {active === format ? <Loader2 className="animate-spin" /> : <Download />}
            {active === format ? "Descargando..." : `Descargar ${format.toUpperCase()}`}
          </Button>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
