"use client";

import { useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/api/errors";
import { downloadPriceListCsv, downloadPriceListSource, downloadPriceListXlsx } from "@/lib/api/price-lists";
import { triggerBrowserDownload } from "@/lib/download";
import type { BlobDownload } from "@/lib/api/client";

type DownloadKind = "xlsx" | "csv" | "source";

const DOWNLOAD_LABELS: Record<DownloadKind, string> = {
  xlsx: "Exportar XLSX",
  csv: "Exportar CSV",
  source: "Descargar original",
};

const DOWNLOAD_FNS: Record<DownloadKind, (priceListId: number) => Promise<BlobDownload>> = {
  xlsx: downloadPriceListXlsx,
  csv: downloadPriceListCsv,
  source: downloadPriceListSource,
};

interface DownloadButtonsProps {
  priceListId: number;
  fallbackFilenames: Record<DownloadKind, string>;
}

export function DownloadButtons({ priceListId, fallbackFilenames }: DownloadButtonsProps) {
  const [active, setActive] = useState<DownloadKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  // `active` (state) drives the UI but only commits on the next render, so two
  // synchronous clicks in the same tick both still see it as null - the same
  // stale-closure gap covered by the ref-based guard in the #2 import flow.
  const downloadingRef = useRef(false);

  async function handleDownload(kind: DownloadKind) {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    setActive(kind);
    setError(null);
    try {
      const result = await DOWNLOAD_FNS[kind](priceListId);
      triggerBrowserDownload(result, fallbackFilenames[kind]);
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo descargar el archivo."));
    } finally {
      downloadingRef.current = false;
      setActive(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(DOWNLOAD_LABELS) as DownloadKind[]).map((kind) => (
          <Button
            key={kind}
            type="button"
            variant="outline"
            size="sm"
            disabled={active !== null}
            onClick={() => handleDownload(kind)}
          >
            {active === kind ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {active === kind ? "Descargando..." : DOWNLOAD_LABELS[kind]}
          </Button>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
