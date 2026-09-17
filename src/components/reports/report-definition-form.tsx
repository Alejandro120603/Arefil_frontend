"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Database, Loader2, Save } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { ReportFilenameTemplateField } from "@/components/reports/report-filename-template-field";
import { ReportParameterEditor } from "@/components/reports/report-parameter-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getUserErrorMessage } from "@/lib/api/errors";
import { createReport, listReportDataSources, updateReport } from "@/lib/api/reports";
import {
  emptyReportForm,
  mergeSourceParameters,
  normalizeReportCode,
  reportFormFromDefinition,
  toReportRequest,
  sourceParameterNames,
  toReportUpdate,
  validateReportForm,
  type ReportFormValue,
} from "@/lib/reports/report-form";
import type { ReportAdminDefinition, ReportDataSource } from "@/types/api";

const CONTROL_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function ReportDefinitionForm({ report = null }: { report?: ReportAdminDefinition | null }) {
  const creating = report == null;
  const router = useRouter();
  const [value, setValue] = useState<ReportFormValue>(() => report ? reportFormFromDefinition(report) : emptyReportForm());
  const [sources, setSources] = useState<ReportDataSource[] | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    listReportDataSources({ signal: controller.signal })
      .then(setSources)
      .catch((error) => {
        if (!controller.signal.aborted) {
          setSourceError(getUserErrorMessage(error, "No se pudo cargar el catálogo de fuentes de datos."));
        }
      });
    return () => controller.abort();
  }, []);

  const selectedSource = sources?.find((source) => source.id === value.data_source_id) ?? null;
  const unavailableCurrentSource = report && value.data_source_id === report.data_source_id && !selectedSource
    ? report.data_source
    : null;
  /**
   * A migrated source is absent from the catalog, so its contract is unknown
   * and nothing can be locked: the backend stays the one that refuses a report
   * missing a parameter its source requires.
   */
  const contractNames = sourceParameterNames(selectedSource);

  function change(patch: Partial<ReportFormValue>) {
    setValue((current) => ({ ...current, ...patch }));
    setSuccessMessage(null);
  }

  function changeSource(rawId: string) {
    const next = sources?.find((source) => source.id === Number(rawId));
    if (!next || next.id === value.data_source_id) return;
    // Only the source half is replaced; the report's own parameters survive.
    const previous = contractNames;
    if (previous.length > 0 && !globalThis.confirm("Cambiar la fuente reemplazará los parámetros exigidos por la fuente anterior. Los parámetros propios del reporte se conservan. ¿Continuar?")) {
      return;
    }
    change({
      data_source_id: next.id,
      parameters: mergeSourceParameters(value.parameters, next, previous),
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    const validationErrors = validateReportForm(value, creating, selectedSource);
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;
    savingRef.current = true;
    setSaving(true);
    setSubmitError(null);
    setSuccessMessage(null);
    try {
      if (creating) {
        const created = await createReport(toReportRequest(value));
        router.push(`/administracion/reportes/${encodeURIComponent(created.code)}`);
        return;
      }
      const updated = await updateReport(value.code, toReportUpdate(value));
      setValue(reportFormFromDefinition(updated));
      setSuccessMessage("La configuración se guardó con la confirmación del backend.");
      router.refresh();
    } catch (error) {
      setSubmitError(getUserErrorMessage(error, "No se pudo guardar el reporte. Tus cambios siguen en el formulario."));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Revisa el formulario</AlertTitle>
          <AlertDescription><ul className="list-disc pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul></AlertDescription>
        </Alert>
      )}
      {submitError && <ErrorAlert title="No se guardó el reporte" message={submitError} />}
      {successMessage && (
        <Alert><CircleCheck /><AlertTitle>Reporte actualizado</AlertTitle><AlertDescription>{successMessage}</AlertDescription></Alert>
      )}

      <Card>
        <CardHeader><CardTitle>Definición</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="report-name">Nombre</Label>
            <Input id="report-name" value={value.name} onChange={(event) => change({ name: event.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="report-code">Código</Label>
            <Input
              id="report-code"
              className="font-mono"
              value={value.code}
              disabled={!creating}
              placeholder="MI_REPORTE"
              onBlur={() => creating && change({ code: normalizeReportCode(value.code) })}
              onChange={(event) => change({ code: event.target.value })}
            />
            {!creating && <p className="text-xs text-muted-foreground">El código es inmutable porque forma parte de las URLs del reporte.</p>}
          </div>
          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="report-description">Descripción</Label>
            <textarea id="report-description" className={`${CONTROL_CLASS} min-h-20 py-2`} value={value.description} onChange={(event) => change({ description: event.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="report-category">Categoría</Label>
            <Input id="report-category" value={value.category} onChange={(event) => change({ category: event.target.value })} />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={value.enabled} onChange={(event) => change({ enabled: event.target.checked })} />
            Reporte habilitado
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Database /> Fuente de datos</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {sourceError && <ErrorAlert title="No se cargaron las fuentes" message={sourceError} />}
          <div className="grid max-w-xl gap-1.5">
            <Label htmlFor="report-data-source">Fuente de datos</Label>
            <select
              id="report-data-source"
              className={CONTROL_CLASS}
              value={value.data_source_id ?? ""}
              disabled={sources == null || sources.length === 0}
              onChange={(event) => changeSource(event.target.value)}
            >
              <option value="">Seleccionar fuente</option>
              {unavailableCurrentSource && (
                <option value={unavailableCurrentSource.id} disabled>
                  {unavailableCurrentSource.name} ({unavailableCurrentSource.enabled ? "no seleccionable" : "deshabilitada"})
                </option>
              )}
              {sources?.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
            </select>
            {sources == null && !sourceError && <p className="text-xs text-muted-foreground">Cargando fuentes disponibles…</p>}
          </div>

          {(selectedSource || unavailableCurrentSource) && (
            <div className="grid gap-4 rounded-xl border bg-muted/20 p-4">
              <div>
                <p className="font-medium">{selectedSource?.name ?? unavailableCurrentSource?.name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedSource?.description ?? unavailableCurrentSource?.description ?? "Sin descripción."}
                </p>
              </div>
              {unavailableCurrentSource && (
                <Alert variant="destructive">
                  <AlertTitle>{unavailableCurrentSource.enabled ? "Fuente no seleccionable" : "Fuente deshabilitada"}</AlertTitle>
                  <AlertDescription>
                    {unavailableCurrentSource.enabled
                      ? "Este reporte conserva su fuente migrada, pero no está disponible en el catálogo para reportes nuevos."
                      : "Este reporte conserva su relación, pero la fuente ya no puede seleccionarse para reportes nuevos ni ejecutarse."}
                  </AlertDescription>
                </Alert>
              )}
              {selectedSource && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-sm font-medium">Parámetros requeridos</p>
                    {selectedSource.parameters.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No requiere parámetros.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {selectedSource.parameters.map((parameter) => (
                          <Badge key={parameter.name} variant="outline">
                            {parameter.label}{parameter.required ? " · requerido" : ""}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium">Campos disponibles</p>
                    {selectedSource.fields.length === 0 ? (
                      <p className="text-sm text-muted-foreground">La fuente migrada no declara un catálogo para Builder.</p>
                    ) : (
                      <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                        {selectedSource.fields.map((field) => <Badge key={field.key} variant="secondary">{field.label}</Badge>)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <ReportParameterEditor
            parameters={value.parameters}
            sourceParameterNames={contractNames}
            onChange={(parameters) => change({ parameters })}
          />
        </CardContent>
      </Card>

      <ReportFilenameTemplateField
        value={value.filename_template}
        code={value.code}
        name={value.name}
        parameters={value.parameters}
        onChange={(filename_template) => change({ filename_template })}
      />

      <div className="flex justify-end">
        <Button type="submit" disabled={saving || sources == null}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}{saving ? "Guardando..." : creating ? "Crear reporte" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
