"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, History, Loader2, RotateCcw } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { ReportExcelTemplateValidationPanel } from "@/components/reports/report-excel-template-validation-panel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import {
  downloadReportExcelTemplateVersion,
  listReportExcelTemplateVersions,
  restoreReportExcelTemplateVersion,
} from "@/lib/api/reports";
import { triggerBrowserDownload } from "@/lib/download";
import { formatDateTime } from "@/lib/format/date";
import { formatFileSize, parseExcelTemplateValidation } from "@/lib/reports/report-excel-template";
import type { ReportExcelTemplate, ReportExcelTemplateUpload, ReportExcelTemplateValidationResult } from "@/types/api";

const STALE_HISTORY_MESSAGE =
  "La plantilla cambió desde que cargaste el historial. Actualiza la lista antes de restaurar.";

type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; versions: ReportExcelTemplate[] };

/**
 * Version history and restore (Frontend #32 / Backend #31): a self-contained
 * trigger button + side panel, so both `ReportExcelTemplateCard` and the
 * visual editor can drop it in without re-fetching or re-deriving anything.
 *
 * Each host decides what "restoring is currently unsafe" means for itself —
 * only the visual editor has a concept of unsaved mappings, so only it ever
 * passes `disabledReason`. Only the host knows what to refresh after a
 * restore, hence `onRestored`.
 */
export function ReportExcelTemplateVersionHistory({
  code,
  disabledReason = null,
  onRestored,
}: {
  code: string;
  /** Set to block every restore action with an explanation (e.g. unsaved mappings). */
  disabledReason?: string | null;
  onRestored?: (template: ReportExcelTemplateUpload) => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [downloadingVersion, setDownloadingVersion] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [confirmingVersion, setConfirmingVersion] = useState<ReportExcelTemplate | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreValidation, setRestoreValidation] = useState<ReportExcelTemplateValidationResult | null>(null);
  const [conflict, setConflict] = useState(false);
  const [restoredNotice, setRestoredNotice] = useState<string | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) =>
      listReportExcelTemplateVersions(code, { signal })
        .then((versions) => {
          if (signal?.aborted) return;
          setState({ status: "ready", versions });
        })
        .catch((error: unknown) => {
          if (signal?.aborted) return;
          setState({ status: "error", message: getUserErrorMessage(error, "No se pudo cargar el historial de versiones.") });
        }),
    [code],
  );

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [open, load]);

  async function download(version: number) {
    if (downloadingVersion != null) return;
    setDownloadingVersion(version);
    setDownloadError(null);
    try {
      const result = await downloadReportExcelTemplateVersion(code, version);
      triggerBrowserDownload(result, `${code.toLowerCase()}-v${version}.xlsx`);
    } catch (error) {
      setDownloadError(getUserErrorMessage(error, "No se pudo descargar la versión."));
    } finally {
      setDownloadingVersion(null);
    }
  }

  function openConfirm(version: ReportExcelTemplate) {
    setConfirmingVersion(version);
    setRestoreError(null);
    setRestoreValidation(null);
    setConflict(false);
  }

  function closeConfirm() {
    if (restoring) return;
    setConfirmingVersion(null);
    setRestoreError(null);
    setRestoreValidation(null);
    setConflict(false);
  }

  async function confirmRestore() {
    if (!confirmingVersion || restoring || state.status !== "ready") return;
    const active = state.versions.find((version) => version.is_active) ?? null;
    setRestoring(true);
    setRestoreError(null);
    setRestoreValidation(null);
    setConflict(false);
    try {
      const restored = await restoreReportExcelTemplateVersion(code, confirmingVersion.version, {
        base_version: active?.version ?? null,
        base_checksum: active?.checksum ?? null,
      });
      setRestoredNotice(`Se restauró la v${confirmingVersion.version} como nueva v${restored.version} activa.`);
      setConfirmingVersion(null);
      onRestored?.(restored);
      await load();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setConflict(true);
        return;
      }
      if (error instanceof ApiError && error.status === 422) {
        const validation = parseExcelTemplateValidation(error.detail);
        if (validation) {
          setRestoreValidation(validation);
          return;
        }
      }
      setRestoreError(getUserErrorMessage(error, "No se pudo restaurar la versión."));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setState({ status: "loading" });
          else setRestoredNotice(null);
        }}
      >
        <SheetTrigger render={<Button type="button" size="sm" variant="outline" />}>
          <History /> Historial de versiones
        </SheetTrigger>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Historial de versiones</SheetTitle>
            <SheetDescription>Consulta, descarga o restaura una versión anterior de la plantilla Excel.</SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-3 px-4 pb-4">
            {disabledReason && <ErrorAlert title="Restaurar no disponible" message={disabledReason} />}
            {restoredNotice && <p className="text-sm text-muted-foreground">{restoredNotice}</p>}

            {state.status === "loading" && (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            )}
            {state.status === "error" && <ErrorAlert title="No se pudo cargar el historial" message={state.message} />}
            {state.status === "ready" && state.versions.length === 0 && (
              <p className="text-sm text-muted-foreground">Este reporte no tiene versiones de plantilla en su historial.</p>
            )}
            {state.status === "ready" && state.versions.length > 0 && (
              <ul className="flex flex-col gap-2">
                {state.versions.map((version) => (
                  <li key={version.version} className="flex flex-col gap-1 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">v{version.version}</span>
                        {version.is_active && <Badge variant="outline">Activa</Badge>}
                      </div>
                      <span className="font-mono text-xs text-muted-foreground" title={version.checksum}>
                        {version.checksum.slice(0, 8)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{version.original_filename}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateTime(version.created_at)} · {formatFileSize(version.size_bytes)}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={downloadingVersion === version.version}
                        onClick={() => void download(version.version)}
                      >
                        {downloadingVersion === version.version ? <Loader2 className="animate-spin" /> : <Download />}
                        Descargar
                      </Button>
                      {!version.is_active && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={disabledReason != null}
                          onClick={() => openConfirm(version)}
                        >
                          <RotateCcw /> Restaurar esta versión
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {downloadError && <ErrorAlert title="No se pudo descargar" message={downloadError} />}
          </div>
        </SheetContent>
      </Sheet>

      {confirmingVersion && (
        <AlertDialog open onOpenChange={(next) => { if (!next) closeConfirm(); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Restaurar versión v{confirmingVersion.version}</AlertDialogTitle>
              <AlertDialogDescription>
                Se creará una nueva versión activa basada en la v{confirmingVersion.version}. La versión actual no se
                eliminará.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {conflict && <ErrorAlert title="La plantilla cambió" message={STALE_HISTORY_MESSAGE} />}
            {restoreValidation && (
              <div className="flex flex-col gap-2">
                <ReportExcelTemplateValidationPanel validation={restoreValidation} />
                <p className="text-sm text-muted-foreground">Esta versión no fue activada; la plantilla actual sigue intacta.</p>
              </div>
            )}
            {restoreError && <ErrorAlert title="No se pudo restaurar" message={restoreError} />}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={restoring}>Cancelar</AlertDialogCancel>
              {conflict ? (
                <Button
                  type="button"
                  onClick={() => {
                    closeConfirm();
                    void load();
                  }}
                >
                  Actualizar lista
                </Button>
              ) : (
                <AlertDialogAction disabled={restoring} onClick={() => void confirmRestore()}>
                  {restoring && <Loader2 className="animate-spin" />} Confirmar restauración
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
