"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Download, Loader2, RefreshCw, Save, Upload } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { letterheadThumbnailAsset } from "@/components/letterheads/admin/letterhead-catalog-card";
import { LetterheadNotice } from "@/components/letterheads/admin/letterhead-notice";
import { LetterheadStatusControl } from "@/components/letterheads/admin/letterhead-status-control";
import { LetterheadThumbnail } from "@/components/letterheads/letterhead-thumbnail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import {
  downloadLetterheadSource,
  getLetterhead,
  letterheadVersionThumbnailPath,
  listLetterheadVersions,
  updateLetterhead,
  uploadLetterheadVersion,
} from "@/lib/api/letterhead-admin";
import { triggerBrowserDownload } from "@/lib/download";
import { formatDateTime } from "@/lib/format/date";
import {
  LETTERHEAD_NAME_MAX_LENGTH,
  LETTERHEAD_XLSX_ACCEPT,
  letterheadErrorCode,
  letterheadFileError,
  letterheadNameError,
  letterheadReportLabel,
  letterheadUploadErrors,
  offeredLetterheadReports,
  shortChecksum,
} from "@/lib/letterheads/letterhead-admin";
import { formatFileSize } from "@/lib/reports/report-excel-template";
import type { LetterheadAdmin, LetterheadVersion } from "@/types/letterhead-admin";

interface DetailData {
  letterhead: LetterheadAdmin;
  versions: LetterheadVersion[];
}

/**
 * One letterhead: rename, (de)activate, upload a new version and read the
 * immutable history. Uploading always creates a new version (or reports that
 * the file was identical); nothing in the history is ever edited or deleted.
 */
export function LetterheadDetail({ id }: { id: number }) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      getLetterhead(id, { signal: controller.signal }),
      listLetterheadVersions(id, { signal: controller.signal }),
    ])
      .then(([letterhead, versions]) => {
        if (controller.signal.aborted) return;
        setData({ letterhead, versions });
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(
          error instanceof ApiError && error.status === 404
            ? "El membrete solicitado no existe."
            : error instanceof ApiError && error.status === 403
              ? "No tienes permisos para administrar membretes."
              : getUserErrorMessage(error, "No se pudo cargar el membrete."),
        );
      });
    return () => controller.abort();
  }, [id, reloadToken]);

  const refresh = useCallback(() => setReloadToken((value) => value + 1), []);

  if (loadError) {
    return (
      <div className="flex flex-col items-start gap-2">
        <ErrorAlert title="No se pudo cargar el membrete" message={loadError} />
        <Button type="button" size="sm" variant="outline" onClick={refresh}>
          <RefreshCw /> Reintentar
        </Button>
      </div>
    );
  }
  if (data == null) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando membrete">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const { letterhead, versions } = data;
  const current = letterhead.current_version;
  const thumbnail = letterheadThumbnailAsset(letterhead);
  const offeredIn = offeredLetterheadReports(letterhead);

  return (
    <div className="flex flex-col gap-6">
      {notice && <LetterheadNotice message={notice} />}

      <Card>
        <CardContent className="flex flex-col gap-6 md:flex-row">
          <LetterheadThumbnail
            path={current != null ? letterheadVersionThumbnailPath(letterhead.id, current.version) : null}
            alt={`Miniatura del membrete ${letterhead.display_name}`}
            width={thumbnail?.width}
            height={thumbnail?.height}
            className="mx-auto max-w-52 shrink-0 md:mx-0"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex flex-wrap gap-1.5">
              <Badge variant={letterhead.is_active ? "success" : "outline"}>{letterhead.is_active ? "Activo" : "Inactivo"}</Badge>
              <Badge variant="secondary">{current != null ? `Versión vigente: ${current.version}` : "Sin versiones"}</Badge>
              <Badge variant="outline">
                {letterhead.version_count === 1 ? "1 versión" : `${letterhead.version_count} versiones`}
              </Badge>
            </div>
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-muted-foreground">Identificador</dt>
              <dd className="font-mono break-all">{letterhead.slug}</dd>
              <dt className="text-muted-foreground">Disponible en</dt>
              <dd>
                {offeredIn.length === 0
                  ? letterhead.is_active ? "Ningún reporte" : "Ningún reporte mientras esté inactivo"
                  : offeredIn
                    .map((item) => `${letterheadReportLabel(item.report_code)}${item.is_default ? " (predeterminado)" : ""}`)
                    .join(", ")}
              </dd>
              <dt className="text-muted-foreground">Actualizado</dt>
              <dd>{formatDateTime(letterhead.updated_at)}</dd>
            </dl>
            <LetterheadRenameForm
              key={`${letterhead.id}-${letterhead.display_name}`}
              letterhead={letterhead}
              onRenamed={(updated) => {
                // Only the field this request changed; the history on screen
                // may already be newer than this response (an upload in flight).
                setData((current) => current && {
                  ...current,
                  letterhead: { ...current.letterhead, display_name: updated.display_name },
                });
                setNotice(`El nombre visible ahora es «${updated.display_name}».`);
                refresh();
              }}
            />
            <div>
              <LetterheadStatusControl
                letterhead={letterhead}
                onChanged={(updated, message) => {
                  setData((current) => current && {
                    ...current,
                    letterhead: { ...current.letterhead, is_active: updated.is_active, assignments: updated.assignments },
                  });
                  setNotice(message);
                  refresh();
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <LetterheadVersionUpload
        letterhead={letterhead}
        onUploaded={(message) => {
          setNotice(message);
          refresh();
        }}
        onReload={refresh}
      />

      <LetterheadVersionHistory letterhead={letterhead} versions={versions} />
    </div>
  );
}

function LetterheadRenameForm({
  letterhead,
  onRenamed,
}: {
  letterhead: LetterheadAdmin;
  onRenamed: (updated: LetterheadAdmin) => void;
}) {
  const inputId = useId();
  const [value, setValue] = useState(letterhead.display_name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const unchanged = value.trim() === letterhead.display_name;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const invalid = letterheadNameError(value);
    setError(invalid);
    if (invalid || unchanged || saving) return;
    setSaving(true);
    try {
      onRenamed(await updateLetterhead(letterhead.id, { display_name: value.trim() }));
    } catch (renameError) {
      setError(getUserErrorMessage(renameError, "No se pudo cambiar el nombre."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-1.5" noValidate onSubmit={(event) => void submit(event)}>
      <Label htmlFor={inputId}>Nombre visible</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={inputId}
          value={value}
          maxLength={LETTERHEAD_NAME_MAX_LENGTH}
          disabled={saving}
          aria-invalid={error != null}
          aria-describedby={error ? `${inputId}-error` : undefined}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button type="submit" variant="outline" disabled={saving || unchanged}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Guardar nombre
        </Button>
      </div>
      {error && <p id={`${inputId}-error`} className="text-sm text-destructive">{error}</p>}
    </form>
  );
}

function LetterheadVersionUpload({
  letterhead,
  onUploaded,
  onReload,
}: {
  letterhead: LetterheadAdmin;
  onUploaded: (message: string) => void;
  onReload: () => void;
}) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentVersion = letterhead.current_version?.version ?? 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (uploadingRef.current) return;
    const invalid = letterheadFileError(file);
    setError(invalid);
    setConflict(false);
    if (invalid || file == null) return;
    uploadingRef.current = true;
    setUploading(true);
    try {
      const result = await uploadLetterheadVersion(letterhead.id, file, currentVersion);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      onUploaded(
        result.created
          ? `Se creó la versión ${result.version}. Las ejecuciones nuevas la usarán; las anteriores conservan la suya.`
          : `El archivo es idéntico a la versión vigente (${result.version}); no se creó otra versión.`,
      );
    } catch (uploadError) {
      if (uploadError instanceof ApiError && uploadError.status === 409 && letterheadErrorCode(uploadError) === "letterhead_conflict") {
        setConflict(true);
      } else {
        const errors = letterheadUploadErrors(uploadError, "No se pudo subir la nueva versión.");
        setError(errors.file ?? errors.form ?? errors.slug ?? errors.display_name ?? "No se pudo subir la nueva versión.");
      }
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>Subir nueva versión</CardTitle>
        <CardDescription>
          Crea la versión {currentVersion + 1}. Las versiones anteriores no se modifican ni se eliminan, y las ejecuciones
          ya generadas conservan la versión que fijaron.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-3" noValidate onSubmit={(event) => void submit(event)}>
          {conflict && (
            <div className="flex flex-col items-start gap-2">
              <ErrorAlert
                title="Otra versión se subió mientras tanto"
                message="La versión vigente cambió desde que abriste esta página, así que no se guardó el archivo. Recarga para ver el historial actualizado y vuelve a subirlo si sigue siendo necesario."
              />
              <Button type="button" size="sm" onClick={() => { setConflict(false); onReload(); }}>
                <RefreshCw /> Recargar historial
              </Button>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={inputId}>Archivo XLSX</Label>
            <Input
              ref={inputRef}
              id={inputId}
              type="file"
              accept={LETTERHEAD_XLSX_ACCEPT}
              disabled={uploading}
              aria-invalid={error != null}
              aria-describedby={error ? `${inputId}-error` : undefined}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError(null);
              }}
            />
            {error && <p id={`${inputId}-error`} className="text-sm text-destructive">{error}</p>}
          </div>
          <div>
            <Button type="submit" disabled={uploading || file == null}>
              {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
              {uploading ? "Validando y guardando..." : "Subir nueva versión"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function LetterheadVersionHistory({ letterhead, versions }: { letterhead: LetterheadAdmin; versions: LetterheadVersion[] }) {
  const [downloading, setDownloading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(version: LetterheadVersion) {
    if (downloading != null) return;
    setDownloading(version.version);
    setError(null);
    try {
      const result = await downloadLetterheadSource(letterhead.id, version.version);
      triggerBrowserDownload(result, version.source_filename || `${letterhead.slug}-v${version.version}.xlsx`);
    } catch (downloadError) {
      setError(getUserErrorMessage(downloadError, "No se pudo descargar el archivo original."));
    } finally {
      setDownloading(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>Historial de versiones</CardTitle>
        <CardDescription>Más reciente primero. El historial es de solo lectura.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <ErrorAlert title="No se pudo descargar" message={error} />}
        {versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Este membrete todavía no tiene versiones.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {versions.map((version) => {
              const thumbnail = version.assets.find((asset) => asset.role === "thumbnail");
              return (
                <li key={version.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row">
                  <LetterheadThumbnail
                    path={letterheadVersionThumbnailPath(letterhead.id, version.version)}
                    alt={`Miniatura de la versión ${version.version}`}
                    width={thumbnail?.width}
                    height={thumbnail?.height}
                    className="max-w-24 shrink-0"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">Versión {version.version}</h3>
                      {version.is_current && <Badge variant="success">Vigente</Badge>}
                    </div>
                    <dl className="grid gap-x-4 gap-y-0.5 text-sm sm:grid-cols-[auto_1fr]">
                      <dt className="text-muted-foreground">Cargada</dt>
                      <dd>{formatDateTime(version.created_at)}</dd>
                      <dt className="text-muted-foreground">Cargada por</dt>
                      <dd>{version.created_by_user_id != null ? `Usuario #${version.created_by_user_id}` : "—"}</dd>
                      <dt className="text-muted-foreground">Archivo</dt>
                      <dd className="break-all">{version.source_filename}</dd>
                      <dt className="text-muted-foreground">Tamaño</dt>
                      <dd>{formatFileSize(version.source_size)}</dd>
                    </dl>
                    <details className="text-sm">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Detalles técnicos</summary>
                      <dl className="mt-2 grid gap-x-4 gap-y-0.5 sm:grid-cols-[auto_1fr]">
                        <dt className="text-muted-foreground">SHA-256 del archivo</dt>
                        <dd className="font-mono text-xs break-all" title={version.source_checksum_sha256}>
                          {version.source_checksum_sha256}
                        </dd>
                        <dt className="text-muted-foreground">Esquema de diseño</dt>
                        <dd>v{version.layout_schema_version}</dd>
                        {version.assets.map((asset) => (
                          <div key={asset.role} className="contents">
                            <dt className="text-muted-foreground">Imagen «{asset.role}»</dt>
                            <dd className="text-xs">
                              {asset.width}×{asset.height} px · {formatFileSize(asset.size_bytes)} ·{" "}
                              <span className="font-mono" title={asset.checksum_sha256}>{shortChecksum(asset.checksum_sha256)}</span>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                    <div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label={`Descargar el XLSX original de la versión ${version.version}`}
                        disabled={downloading != null}
                        onClick={() => void download(version)}
                      >
                        {downloading === version.version ? <Loader2 className="animate-spin" /> : <Download />}
                        Descargar XLSX original
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
