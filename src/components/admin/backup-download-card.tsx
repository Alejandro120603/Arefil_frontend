"use client";

import { useRef, useState } from "react";
import { CheckCircle2, DatabaseBackup, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { downloadDatabaseBackup } from "@/lib/api/admin";
import { getErrorMessage } from "@/lib/api/errors";
import { triggerBrowserDownload } from "@/lib/download";

type Status = "idle" | "downloading" | "success" | "error";

/**
 * The backend does set `Content-Disposition` with a timestamped filename, but
 * its CORS config doesn't add it to `Access-Control-Expose-Headers`, so the
 * browser hides it from `fetch()` on this cross-origin setup (verified: curl
 * sees the header, in-browser `fetch()` does not). That's a backend fix this
 * project's rules don't allow making here, so this fallback at least keeps
 * repeated downloads distinguishable by generating its own timestamp instead
 * of a static name every backup would collide on.
 */
function buildFallbackFilename(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `arefil_backup_${timestamp}.db`;
}

export function BackupDownloadCard() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastFilename, setLastFilename] = useState<string | null>(null);
  // Ref, not just the `status` state, guards the actual re-entrancy check -
  // state only commits on the next render, so two synchronous clicks in the
  // same tick would both still read "idle" without it (same gap as #2/#3).
  const downloadingRef = useRef(false);

  async function handleDownload() {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    setStatus("downloading");
    setError(null);
    try {
      const result = await downloadDatabaseBackup();
      const filename = result.filename ?? buildFallbackFilename();
      triggerBrowserDownload(result, filename);
      setLastFilename(filename);
      setStatus("success");
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo generar el respaldo. Intenta de nuevo en unos minutos."));
      setStatus("error");
    } finally {
      downloadingRef.current = false;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button type="button" onClick={handleDownload} disabled={status === "downloading"}>
          {status === "downloading" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <DatabaseBackup className="h-4 w-4" />
          )}
          {status === "downloading" ? "Generando respaldo..." : "Descargar respaldo SQLite"}
        </Button>
      </div>

      {status === "success" && lastFilename && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Respaldo descargado</AlertTitle>
          <AlertDescription>Se descargó {lastFilename}.</AlertDescription>
        </Alert>
      )}

      {status === "error" && error && <ErrorAlert title="No se pudo descargar el respaldo" message={error} />}
    </div>
  );
}
