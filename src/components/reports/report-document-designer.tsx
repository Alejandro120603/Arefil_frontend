"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, Download, Loader2, PenTool, Save, Trash2, Upload, X } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import {
  deleteReportTemplate,
  getReportBuilder,
  getReportTemplate,
  saveReportTemplate,
} from "@/lib/api/reports";
import { normalizeSummaries } from "@/lib/reports/report-builder";
import {
  documentDatasetSample,
  documentDatasetSchema,
  templateFilename,
  templateStatus,
  TEMPLATE_STATUS_LABELS,
  type ReportDatasetFieldDescriptor,
} from "@/lib/reports/report-document";
import type {
  ReportColumn,
  ReportDocumentDataset,
  ReportParameter,
  ReportSummaryConfiguration,
  ReportTemplate,
} from "@/types/api";

/**
 * The Stimulsoft designer is licensed software this repo does not vendor. It is
 * hosted as a standalone page (any origin the deployment controls) and named
 * here; the template and its dataset travel over `postMessage`, so no
 * commercial bundle has to ship with the panel.
 */
function designerUrl(): string {
  return process.env.NEXT_PUBLIC_STIMULSOFT_DESIGNER_URL?.trim() ?? "";
}

/** Messages this panel sends to, and accepts from, the designer page. */
interface DesignerSaveMessage {
  source: "arefil-designer";
  type: "save" | "close";
  template?: string;
}

function isDesignerMessage(data: unknown): data is DesignerSaveMessage {
  if (data == null || typeof data !== "object") return false;
  const message = data as DesignerSaveMessage;
  return message.source === "arefil-designer" && (message.type === "save" || message.type === "close");
}

/**
 * Document design, kept deliberately apart from the Report Builder.
 *
 * The builder owns *what the report computes*; this owns *how the document
 * looks*. They share only the dataset contract, which is derived from the saved
 * builder and handed to the designer so a template never has to guess field
 * names — or write SQL.
 */
export function ReportDocumentDesigner({
  code,
  name,
  parameters,
}: {
  code: string;
  name: string;
  parameters: ReportParameter[];
}) {
  const [saved, setSaved] = useState<ReportTemplate | null>(null);
  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [columns, setColumns] = useState<ReportColumn[]>([]);
  const [summaries, setSummaries] = useState<ReportSummaryConfiguration[]>([]);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const savingRef = useRef(false);

  const url = designerUrl();
  const schema = useMemo(
    () => documentDatasetSchema(parameters, columns, summaries),
    [columns, parameters, summaries],
  );
  const dataset = useMemo(
    () => documentDatasetSample({ code, name }, parameters, columns, summaries),
    [code, columns, name, parameters, summaries],
  );
  const status = templateStatus(saved, dirty);

  useEffect(() => {
    const controller = new AbortController();
    void getReportTemplate(code, { signal: controller.signal })
      .then((template) => {
        if (controller.signal.aborted) return;
        setSaved(template);
        setContent(template.content);
        setLoading(false);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        // No template is a valid state, not a failure: the report still runs
        // and still exports data, it just has no document yet.
        if (!(error instanceof ApiError && error.status === 404)) {
          setLoadError(getUserErrorMessage(error, "No se pudo cargar el template del reporte."));
        }
        setLoading(false);
      });
    return () => controller.abort();
  }, [code]);

  useEffect(() => {
    const controller = new AbortController();
    void getReportBuilder(code, { signal: controller.signal })
      .then((builder) => {
        if (controller.signal.aborted) return;
        setColumns(builder.columns);
        setSummaries(normalizeSummaries(builder.excel_layout?.totals ?? [], builder.columns));
      })
      // The schema is a convenience for the designer; without it the template
      // still saves, so a missing builder must not block this section.
      .catch(() => undefined);
    return () => controller.abort();
  }, [code]);

  const applyDesignerTemplate = useCallback((template: string) => {
    setContent(template);
    setDirty(true);
    setJustSaved(false);
  }, []);

  useEffect(() => {
    if (!designerOpen || url === "") return;
    const origin = new URL(url, window.location.origin).origin;
    function receive(event: MessageEvent) {
      if (event.origin !== origin || !isDesignerMessage(event.data)) return;
      if (event.data.type === "close") {
        setDesignerOpen(false);
        return;
      }
      if (typeof event.data.template === "string") applyDesignerTemplate(event.data.template);
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [applyDesignerTemplate, designerOpen, url]);

  /** Handing the designer both the template and the contract it binds to. */
  function seedDesigner(template: string, sample: ReportDocumentDataset) {
    if (url === "") return;
    frameRef.current?.contentWindow?.postMessage(
      { source: "arefil", type: "load", template, dataset: sample, schema },
      new URL(url, window.location.origin).origin,
    );
  }

  async function handleSave() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    setJustSaved(false);
    try {
      const template = await saveReportTemplate(code, { format: saved?.format ?? "mrt", content });
      setSaved(template);
      setContent(template.content);
      setDirty(false);
      setJustSaved(true);
    } catch (error) {
      // The edited template stays on screen: it may be the only copy that exists.
      setSaveError(getUserErrorMessage(error, "No se pudo guardar el template. Tus cambios siguen en pantalla."));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setSaveError(null);
    try {
      await deleteReportTemplate(code);
      setSaved(null);
      setContent("");
      setDirty(false);
      setConfirmingRemoval(false);
      setJustSaved(false);
    } catch (error) {
      setSaveError(getUserErrorMessage(error, "No se pudo eliminar el template."));
    } finally {
      setRemoving(false);
    }
  }

  async function handleUpload(file: File) {
    applyDesignerTemplate(await file.text());
    setSaveError(null);
  }

  function handleDownload() {
    const blob = new Blob([content], { type: "application/json" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = templateFilename(code, saved?.format ?? "mrt");
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(anchor.href);
  }

  return (
    <Card id="diseno-documento" className="scroll-mt-6">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Diseño del documento</CardTitle>
        <Badge variant={status === "configured" ? "default" : status === "dirty" ? "secondary" : "outline"}>
          {TEMPLATE_STATUS_LABELS[status]}{status === "configured" && saved ? ` · v${saved.version}` : ""}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          El template define la apariencia del documento (logo, cabecera, partidas, totales y pie). Los importes los
          calcula el backend: aquí solo se decide cómo se ven.
        </p>

        {loadError && <ErrorAlert title="No se pudo cargar el template" message={loadError} />}
        {saveError && <ErrorAlert title="No se guardó el template" message={saveError} />}
        {justSaved && (
          <Alert>
            <CircleCheck />
            <AlertTitle>Template guardado</AlertTitle>
            <AlertDescription>El backend confirmó el template activo del reporte.</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={url === "" || saving}
                onClick={() => setDesignerOpen((open) => !open)}
              >
                <PenTool /> {designerOpen ? "Cerrar diseñador" : "Abrir diseñador Stimulsoft"}
              </Button>
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-medium hover:bg-accent">
                <Upload className="h-4 w-4" /> Subir template
                <input
                  type="file"
                  className="sr-only"
                  accept=".mrt,.json,application/json"
                  aria-label="Subir template"
                  disabled={saving}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleUpload(file);
                    event.target.value = "";
                  }}
                />
              </label>
              <Button type="button" size="sm" variant="ghost" disabled={content === ""} onClick={handleDownload}>
                <Download /> Descargar template
              </Button>
            </div>

            {url === "" && (
              <Alert>
                <AlertTitle>Diseñador Stimulsoft no configurado</AlertTitle>
                <AlertDescription>
                  Define <code>NEXT_PUBLIC_STIMULSOFT_DESIGNER_URL</code> con la página del diseñador que hospeda tu
                  licencia para editarlo visualmente. Mientras tanto puedes subir, editar y guardar el template aquí.
                </AlertDescription>
              </Alert>
            )}

            {designerOpen && url !== "" && (
              <iframe
                ref={frameRef}
                title="Diseñador Stimulsoft"
                src={url}
                className="h-[70vh] w-full rounded-lg border"
                onLoad={() => seedDesigner(content, dataset)}
              />
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="report-template-content" className="text-sm font-medium">Template</label>
              <textarea
                id="report-template-content"
                className="min-h-40 w-full rounded-lg border border-input bg-transparent p-3 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                spellCheck={false}
                placeholder="Contenido del template (.mrt / JSON)"
                value={content}
                disabled={saving}
                onChange={(event) => applyDesignerTemplate(event.target.value)}
              />
              {status === "missing" && (
                <p className="text-xs text-muted-foreground">
                  Este reporte todavía no tiene documento. Sin template el reporte se sigue ejecutando y exportando
                  como datos.
                </p>
              )}
            </div>

            <section className="flex flex-col gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="self-start"
                aria-expanded={schemaOpen}
                onClick={() => setSchemaOpen((open) => !open)}
              >
                Dataset disponible para el diseñador ({schema.length})
              </Button>
              {schemaOpen && (
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
                      {schema.map((field: ReportDatasetFieldDescriptor) => (
                        <TableRow key={field.path}>
                          <TableCell className="text-muted-foreground">{field.section}</TableCell>
                          <TableCell className="font-mono text-xs">{field.path}</TableCell>
                          <TableCell>{field.label}</TableCell>
                          <TableCell className="text-muted-foreground">{field.data_type}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>

            <div className="flex flex-wrap items-center justify-end gap-3">
              {dirty && <p className="text-sm text-muted-foreground">Hay cambios sin guardar.</p>}
              {saved != null && !confirmingRemoval && (
                <Button type="button" variant="ghost" disabled={saving || removing} onClick={() => setConfirmingRemoval(true)}>
                  <Trash2 /> Eliminar template
                </Button>
              )}
              {confirmingRemoval && (
                <>
                  <p className="text-sm text-muted-foreground">¿Eliminar el template activo?</p>
                  <Button type="button" size="sm" variant="ghost" disabled={removing} onClick={() => setConfirmingRemoval(false)}>
                    <X /> Cancelar
                  </Button>
                  <Button type="button" size="sm" variant="destructive" disabled={removing} onClick={handleRemove}>
                    {removing ? <Loader2 className="animate-spin" /> : <Trash2 />} Confirmar
                  </Button>
                </>
              )}
              <Button type="button" disabled={saving || content.trim() === ""} onClick={handleSave}>
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
                {saving ? "Guardando..." : "Guardar template"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
