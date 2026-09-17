"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import {
  deleteReportExcelTemplate,
  downloadReportExcelTemplate,
  getReportBuilder,
  getReportExcelTemplate,
  uploadReportExcelTemplate,
} from "@/lib/api/reports";
import { triggerBrowserDownload } from "@/lib/download";
import { normalizeSummaries } from "@/lib/reports/report-builder";
import {
  EXCEL_TEMPLATE_STATUS_LABELS,
  EXCEL_TEMPLATE_VALIDATION_LABELS,
  excelTemplateIssueLocation,
  excelTemplatePlaceholders,
  excelTemplateStatus,
  excelTemplateValidationStatus,
  formatFileSize,
  INCOMPATIBLE_TEMPLATE_MESSAGE,
  isXlsxFile,
  parseExcelTemplateValidation,
  XLSX_EXTENSION,
  XLSX_MEDIA_TYPE,
  type ReportPlaceholderDescriptor,
} from "@/lib/reports/report-excel-template";
import { formatDateTime } from "@/lib/format/date";
import type {
  ReportColumn,
  ReportExcelTemplate,
  ReportExcelTemplateValidationIssue,
  ReportExcelTemplateValidationResult,
  ReportParameter,
  ReportSummaryConfiguration,
} from "@/types/api";

const WRONG_EXTENSION_MESSAGE = "Solo se aceptan archivos .xlsx.";

/**
 * Excel template administration, kept deliberately apart from the Report
 * Builder.
 *
 * The builder owns *what the report computes*; this owns *how the document
 * looks*. They share only the placeholder contract, derived from the saved
 * builder so a template author never has to guess a field name — or write SQL.
 * Nothing here can break the builder: a report with no template still runs and
 * still exports its data.
 */
export function ReportExcelTemplateCard({
  code,
  parameters,
}: {
  code: string;
  parameters: ReportParameter[];
}) {
  const [template, setTemplate] = useState<ReportExcelTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  /** Kept after a failed upload so the user can retry without picking the file again. */
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  /**
   * The last preflight the backend answered with (Backend #24) — for the
   * template it just activated, or for the one it just refused. `GET` does not
   * carry it, so a freshly loaded page has none to show.
   */
  const [validation, setValidation] = useState<ReportExcelTemplateValidationResult | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [columns, setColumns] = useState<ReportColumn[]>([]);
  const [summaries, setSummaries] = useState<ReportSummaryConfiguration[]>([]);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const uploadingRef = useRef(false);

  const placeholders = useMemo(
    () => excelTemplatePlaceholders(parameters, columns, summaries),
    [columns, parameters, summaries],
  );
  const status = excelTemplateStatus(template);

  /** A 404 is the "no template yet" state; anything else is a real failure. */
  const applyMetadata = useCallback((result: ReportExcelTemplate | null, error?: unknown) => {
    if (error === undefined) {
      setTemplate(result);
      setLoadError(null);
      return;
    }
    if (error instanceof ApiError && error.status === 404) {
      setTemplate(null);
      setLoadError(null);
      return;
    }
    setLoadError(getUserErrorMessage(error, "No se pudo cargar la plantilla Excel del reporte."));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void getReportExcelTemplate(code, { signal: controller.signal })
      .then((metadata) => {
        if (controller.signal.aborted) return;
        applyMetadata(metadata);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        applyMetadata(null, error);
        setLoading(false);
      });
    return () => controller.abort();
  }, [applyMetadata, code]);

  useEffect(() => {
    const controller = new AbortController();
    void getReportBuilder(code, { signal: controller.signal })
      .then((builder) => {
        if (controller.signal.aborted) return;
        setColumns(builder.columns);
        setSummaries(normalizeSummaries(builder.excel_layout?.totals ?? [], builder.columns));
      })
      // The placeholder list is a convenience; without it the template still
      // uploads, so a missing builder must not block this section.
      .catch(() => undefined);
    return () => controller.abort();
  }, [code]);

  async function upload(file: File) {
    if (uploadingRef.current) return;
    if (!isXlsxFile(file)) {
      setActionError(WRONG_EXTENSION_MESSAGE);
      return;
    }
    uploadingRef.current = true;
    setUploading(true);
    setPendingFile(file);
    setActionError(null);
    setValidation(null);
    try {
      const { validation: preflight, ...metadata } = await uploadReportExcelTemplate(code, file);
      setTemplate(metadata);
      setValidation(preflight ?? null);
      setPendingFile(null);
    } catch (error) {
      // A rejected template is never activated, so `template` is deliberately
      // left alone: the report keeps whatever it had, and the badge keeps
      // describing *that* file rather than the one that just bounced.
      const rejected = error instanceof ApiError ? parseExcelTemplateValidation(error.detail) : null;
      setValidation(rejected);
      // The chosen file stays in state: a failed upload must not cost the user
      // another trip through the file picker.
      setActionError(
        rejected != null
          ? INCOMPATIBLE_TEMPLATE_MESSAGE
          : getUserErrorMessage(error, "No se pudo subir la plantilla Excel."),
      );
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    setActionError(null);
    try {
      const result = await downloadReportExcelTemplate(code);
      triggerBrowserDownload(result, template?.original_filename ?? `${code.toLowerCase()}${XLSX_EXTENSION}`);
    } catch (error) {
      setActionError(getUserErrorMessage(error, "No se pudo descargar la plantilla Excel."));
    } finally {
      setDownloading(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setActionError(null);
    try {
      await deleteReportExcelTemplate(code);
      setTemplate(null);
      setPendingFile(null);
      setValidation(null);
      setConfirmingRemoval(false);
      // The backend owns activation: re-read rather than assume the delete
      // left the report with no template at all.
      await getReportExcelTemplate(code).then(
        (metadata) => applyMetadata(metadata),
        (error: unknown) => applyMetadata(null, error),
      );
    } catch (error) {
      setActionError(getUserErrorMessage(error, "No se pudo eliminar la plantilla Excel."));
    } finally {
      setRemoving(false);
    }
  }

  const busy = uploading || removing || downloading;
  const uploadLabel = template == null ? "Subir plantilla Excel" : "Reemplazar plantilla";

  return (
    <Card id="plantilla-excel" className="scroll-mt-6">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Plantilla Excel</CardTitle>
        <Badge variant={status === "configured" ? "default" : "outline"}>
          {EXCEL_TEMPLATE_STATUS_LABELS[status]}{template != null ? ` · v${template.version}` : ""}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Usa un archivo .xlsx como diseño final del reporte. Arefil rellenará los campos y repetirá las filas de
          productos con los datos calculados por el motor del reporte.
        </p>

        {loadError && <ErrorAlert title="No se pudo cargar la plantilla" message={loadError} />}
        {actionError && <ErrorAlert title="No se pudo completar la operación" message={actionError} />}

        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <>
            {template != null && (
              <div className="flex flex-col gap-0.5 rounded-lg border p-3">
                <p className="flex items-center gap-2 font-medium">
                  <FileSpreadsheet className="h-4 w-4" /> {template.original_filename}
                </p>
                <p className="text-sm text-muted-foreground">Archivo usado como diseño final del reporte.</p>
                <p className="text-sm text-muted-foreground">Versión: {template.version}</p>
                <p className="text-sm text-muted-foreground">Tamaño: {formatFileSize(template.size_bytes)}</p>
                <p className="text-sm text-muted-foreground">Actualizada: {formatDateTime(template.updated_at)}</p>
              </div>
            )}

            {template == null && (
              <p className="text-sm text-muted-foreground">
                Este reporte todavía no tiene una plantilla Excel configurada.
              </p>
            )}

            {validation != null && <ValidationPanel validation={validation} />}

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-accent">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "Subiendo..." : uploadLabel}
                <input
                  type="file"
                  className="sr-only"
                  accept={`${XLSX_EXTENSION},${XLSX_MEDIA_TYPE}`}
                  aria-label={uploadLabel}
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file);
                    event.target.value = "";
                  }}
                />
              </label>
              {pendingFile != null && !uploading && (
                <Button type="button" size="sm" variant="outline" onClick={() => void upload(pendingFile)}>
                  <RefreshCw /> Reintentar {pendingFile.name}
                </Button>
              )}
              {template != null && (
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={handleDownload}>
                  {downloading ? <Loader2 className="animate-spin" /> : <Download />} Descargar plantilla
                </Button>
              )}
              {template != null && !confirmingRemoval && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setConfirmingRemoval(true)}
                >
                  <Trash2 /> Eliminar plantilla
                </Button>
              )}
              {confirmingRemoval && (
                <>
                  <p className="text-sm text-muted-foreground">¿Eliminar la plantilla activa?</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={removing}
                    onClick={() => setConfirmingRemoval(false)}
                  >
                    <X /> Cancelar
                  </Button>
                  <Button type="button" size="sm" variant="destructive" disabled={removing} onClick={handleRemove}>
                    {removing ? <Loader2 className="animate-spin" /> : <Trash2 />} Confirmar
                  </Button>
                </>
              )}
            </div>

            <section className="flex flex-col gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="self-start"
                aria-expanded={fieldsOpen}
                onClick={() => setFieldsOpen((open) => !open)}
              >
                Campos disponibles para la plantilla ({placeholders.length})
              </Button>
              {fieldsOpen && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Una fila del Excel que contenga campos <code>{"{{rows.*}}"}</code> será utilizada como fila
                    plantilla y el backend la repetirá por cada producto conservando el formato.
                  </p>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Sección</TableHead>
                          <TableHead>Campo</TableHead>
                          <TableHead>Etiqueta</TableHead>
                          <TableHead>Tipo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {placeholders.map((field: ReportPlaceholderDescriptor) => (
                          <TableRow key={field.placeholder}>
                            <TableCell className="text-muted-foreground">{field.section}</TableCell>
                            <TableCell className="font-mono text-xs">{field.placeholder}</TableCell>
                            <TableCell>{field.label}</TableCell>
                            <TableCell className="text-muted-foreground">{field.data_type}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const VALIDATION_ICONS = {
  valid: CheckCircle2,
  warning: AlertTriangle,
  invalid: XCircle,
} as const;

const VALIDATION_TONES = {
  valid: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  warning: "border-amber-500/40 text-amber-700 dark:text-amber-500",
  invalid: "border-destructive/40 text-destructive",
} as const;

/**
 * The compatibility diagnosis of the last upload (Backend #24).
 *
 * It describes the *file the backend just read*, not the active template: an
 * incompatible workbook is reported here while the card above keeps showing
 * whichever template is really installed.
 */
function ValidationPanel({ validation }: { validation: ReportExcelTemplateValidationResult }) {
  const state = excelTemplateValidationStatus(validation);
  const Icon = VALIDATION_ICONS[state];

  return (
    <section className={`flex flex-col gap-2 rounded-lg border p-3 ${VALIDATION_TONES[state]}`}>
      <p className="flex items-center gap-2 font-medium">
        <Icon className="h-4 w-4" aria-hidden="true" />
        Compatibilidad: {EXCEL_TEMPLATE_VALIDATION_LABELS[state]}
      </p>
      <p className="text-sm text-muted-foreground">
        Placeholders reconocidos: {validation.placeholder_count}
      </p>
      <p className="text-sm text-muted-foreground">
        Filas repetibles detectadas: {validation.repeatable_rows}
      </p>
      {state === "invalid" && (
        <p className="text-sm text-muted-foreground">
          Corrige los errores y vuelve a subir el archivo; la plantilla vigente no fue modificada.
        </p>
      )}
      <IssueList title="Errores" issues={validation.errors} />
      <IssueList title="Advertencias" issues={validation.warnings} />
    </section>
  );
}

/** Every issue names its sheet, and its cell or merged range when it has one. */
function IssueList({ title, issues }: { title: string; issues: ReportExcelTemplateValidationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium">
        {title} ({issues.length})
      </p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
        {issues.map((issue, index) => (
          <li key={`${issue.code}-${excelTemplateIssueLocation(issue)}-${index}`}>
            <span className="font-mono text-xs">{excelTemplateIssueLocation(issue)}</span> — {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
