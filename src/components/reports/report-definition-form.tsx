"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Loader2, Play, Save } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { ReportParameterEditor } from "@/components/reports/report-parameter-editor";
import { ReportPreviewTable } from "@/components/reports/report-preview-table";
import { ReportRuntimeParameters, initialRuntimeValues } from "@/components/reports/report-runtime-parameters";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getUserErrorMessage } from "@/lib/api/errors";
import { createReport, previewReport, updateReport } from "@/lib/api/reports";
import {
  KNOWN_REPORT_HANDLER,
  coerceRuntimeValue,
  emptyReportForm,
  handlerParameters,
  normalizeReportCode,
  reportFormFromDefinition,
  toReportRequest,
  toReportUpdate,
  validateReportForm,
  type ReportFormValue,
} from "@/lib/reports/report-form";
import type { ReportAdminDefinition, ReportDataSourceType, ReportPreviewResponse } from "@/types/api";

const CONTROL_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function ReportDefinitionForm({ report = null }: { report?: ReportAdminDefinition | null }) {
  const creating = report == null;
  const router = useRouter();
  const [value, setValue] = useState<ReportFormValue>(() => report ? reportFormFromDefinition(report) : emptyReportForm());
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [runtimeValues, setRuntimeValues] = useState<Record<string, string | boolean>>(
    () => initialRuntimeValues(report?.parameters ?? []),
  );
  const [preview, setPreview] = useState<ReportPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  function change(patch: Partial<ReportFormValue>) {
    setValue((current) => ({ ...current, ...patch }));
    setDirty(true);
    setSuccessMessage(null);
    setPreview(null);
  }

  function changeSource(next: ReportDataSourceType) {
    if (next === value.data_source_type) return;
    const hasConfiguration = value.query_text.trim() !== "" || value.parameters.length > 0;
    if (hasConfiguration && !globalThis.confirm("Cambiar el tipo de fuente descartará la consulta y los parámetros actuales. ¿Continuar?")) {
      return;
    }
    change({
      data_source_type: next,
      data_source_key: next === "HANDLER" ? KNOWN_REPORT_HANDLER : null,
      query_text: "",
      enabled: next === "HANDLER",
      parameters: next === "HANDLER" ? handlerParameters() : [],
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    const validationErrors = validateReportForm(value, creating);
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
      setValue((current) => ({ ...current, enabled: updated.enabled, parameters: updated.parameters }));
      setDirty(false);
      setRuntimeValues(initialRuntimeValues(updated.parameters));
      setSuccessMessage("La configuración se guardó con la confirmación del backend.");
      router.refresh();
    } catch (error) {
      setSubmitError(getUserErrorMessage(error, "No se pudo guardar el reporte. Tus cambios siguen en el formulario."));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handlePreview() {
    if (creating || dirty || value.data_source_type !== "SQL_QUERY" || previewing) return;
    const parameters = Object.fromEntries(value.parameters.flatMap((parameter) => {
      const coerced = coerceRuntimeValue(parameter, runtimeValues[parameter.name] ?? "");
      return coerced === undefined ? [] : [[parameter.name, coerced]];
    }));
    setPreviewing(true);
    setPreviewError(null);
    setPreview(null);
    try {
      setPreview(await previewReport(value.code, parameters));
    } catch (error) {
      setPreviewError(getUserErrorMessage(error, "No se pudo probar la consulta."));
    } finally {
      setPreviewing(false);
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
              placeholder="PRODUCT_CATALOG"
              onBlur={() => creating && change({ code: normalizeReportCode(value.code) })}
              onChange={(event) => change({ code: event.target.value })}
            />
            {!creating && <p className="text-xs text-muted-foreground">El código es inmutable porque forma parte de URLs y templates.</p>}
          </div>
          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="report-description">Descripción</Label>
            <textarea id="report-description" className={`${CONTROL_CLASS} min-h-20 py-2`} value={value.description} onChange={(event) => change({ description: event.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="report-category">Categoría</Label>
            <Input id="report-category" value={value.category} onChange={(event) => change({ category: event.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="report-source">Tipo de fuente</Label>
            <select id="report-source" className={CONTROL_CLASS} value={value.data_source_type} onChange={(event) => changeSource(event.target.value as ReportDataSourceType)}>
              <option value="SQL_QUERY">SQL_QUERY</option>
              <option value="HANDLER">HANDLER</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={value.enabled}
              disabled={creating && value.data_source_type === "SQL_QUERY"}
              onChange={(event) => change({ enabled: event.target.checked })}
            />
            Reporte habilitado
          </label>
          {creating && value.data_source_type === "SQL_QUERY" && (
            <p className="text-xs text-muted-foreground md:col-span-2">
              El backend crea consultas nuevas deshabilitadas. Guárdala, pruébala y habilítala desde Configuración.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Fuente de datos</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {value.data_source_type === "HANDLER" ? (
            <div className="grid max-w-xl gap-1.5">
              <Label htmlFor="report-handler">Handler permitido</Label>
              <select id="report-handler" className={CONTROL_CLASS} value={KNOWN_REPORT_HANDLER} disabled>
                <option value={KNOWN_REPORT_HANDLER}>Comparación de listas de precios</option>
              </select>
              <p className="text-xs text-muted-foreground">No se aceptan nombres de función ni import paths arbitrarios.</p>
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="report-query">Consulta</Label>
              <textarea
                id="report-query"
                className={`${CONTROL_CLASS} min-h-64 py-3 font-mono leading-6`}
                value={value.query_text}
                spellCheck={false}
                placeholder="SELECT ...\nFROM ...\nWHERE supplier_id = :supplier_id"
                onChange={(event) => change({ query_text: event.target.value })}
              />
              <p className="text-xs text-muted-foreground">La validación de seguridad y ejecución siempre ocurre en el backend.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card><CardContent><ReportParameterEditor parameters={value.parameters} locked={value.data_source_type === "HANDLER"} onChange={(parameters) => change({ parameters })} /></CardContent></Card>

      {!creating && value.data_source_type === "SQL_QUERY" && (
        <Card>
          <CardHeader><CardTitle>Probar consulta</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            {dirty && <p className="text-sm text-muted-foreground">Guarda los cambios antes de probar para que el backend ejecute esta misma definición.</p>}
            <ReportRuntimeParameters code={value.code} parameters={value.parameters} values={runtimeValues} disabled={previewing} onChange={(name, runtimeValue) => setRuntimeValues((current) => ({ ...current, [name]: runtimeValue }))} />
            <div><Button type="button" variant="outline" disabled={dirty || previewing} onClick={handlePreview}>
              {previewing ? <Loader2 className="animate-spin" /> : <Play />}{previewing ? "Probando..." : "Probar consulta"}
            </Button></div>
            {previewError && <ErrorAlert title="El preview devolvió un error" message={previewError} />}
            {preview && <ReportPreviewTable preview={preview} />}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}{saving ? "Guardando..." : creating ? "Crear reporte" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
