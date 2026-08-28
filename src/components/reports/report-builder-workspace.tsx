"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleCheck, Loader2, Play, Save } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { ReportBuilderPreviewTable } from "@/components/reports/report-builder-preview-table";
import { ReportColumnEditor } from "@/components/reports/report-column-editor";
import { ReportExcelLayoutEditor } from "@/components/reports/report-excel-layout-editor";
import { ReportParameterGroupEditor } from "@/components/reports/report-parameter-group-editor";
import { ReportRepeatableParameters } from "@/components/reports/report-repeatable-parameters";
import { ReportRuntimeParameters } from "@/components/reports/report-runtime-parameters";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserErrorMessage } from "@/lib/api/errors";
import {
  getReportBuilder,
  getReportFieldCatalog,
  previewReportBuilder,
  saveReportBuilder,
} from "@/lib/api/reports";
import {
  builderFormFromDefinition,
  emptyExcelLayout,
  pruneTotals,
  toBuilderRequest,
  validateBuilderForm,
  type ReportBuilderFormValue,
} from "@/lib/reports/report-builder";
import {
  initialRuntimeValues,
  initialRuntimeGroupValues,
  validateRuntimeForm,
  type RuntimeGroupValues,
  type RuntimeParameterValues,
} from "@/lib/reports/report-runtime";
import type {
  ReportBuilderPreviewResponse,
  ReportColumn,
  ReportExcelLayout,
  ReportFieldDescriptor,
  ReportParameter,
  ReportParameterGroup,
} from "@/types/api";

/**
 * The Report Builder: configures the *logical shell* of a report — columns,
 * their sources, formulas and the Excel layout — and previews it against real
 * data. Preview and export both use the saved builder contract.
 *
 * Repeatable line items are configured beside the logical shell and saved in
 * the same transaction, so formula sources and runtime metadata cannot drift.
 */
export function ReportBuilderWorkspace({
  code,
  parameters,
  dataSourceCapabilities,
}: {
  code: string;
  parameters: ReportParameter[];
  dataSourceCapabilities: string[];
}) {
  const [value, setValue] = useState<ReportBuilderFormValue | null>(null);
  const [fields, setFields] = useState<ReportFieldDescriptor[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [runtimeValues, setRuntimeValues] = useState<RuntimeParameterValues>(
    () => initialRuntimeValues(parameters),
  );
  const [runtimeGroupValues, setRuntimeGroupValues] = useState<RuntimeGroupValues>({});
  const [runtimeErrors, setRuntimeErrors] = useState<Record<string, string>>({});
  const [runtimeGroupErrors, setRuntimeGroupErrors] = useState<Record<string, string>>({});
  const [runtimeRowErrors, setRuntimeRowErrors] = useState<Record<string, Record<number, Record<string, string>>>>({});
  const [scalarOptionsReady, setScalarOptionsReady] = useState(
    () => parameters.every((parameter) => parameter.input_type !== "select"),
  );
  const [groupOptionsReady, setGroupOptionsReady] = useState(true);
  const optionsReady = scalarOptionsReady && groupOptionsReady;
  const [preview, setPreview] = useState<ReportBuilderPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void getReportBuilder(code, { signal: controller.signal })
      .then((builder) => {
        if (controller.signal.aborted) return;
        setValue(builderFormFromDefinition(builder));
        setRuntimeGroupValues(initialRuntimeGroupValues(builder.parameter_groups));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        // Without a builder there is nothing to edit *and* nothing to lose, so
        // fall back to an empty shell rather than blocking the whole screen.
        setValue({ columns: [], parameterGroups: [], layout: emptyExcelLayout() });
        setLoadError(getUserErrorMessage(error, "No se pudo cargar la configuración del constructor."));
      });
    return () => controller.abort();
  }, [code]);

  useEffect(() => {
    const controller = new AbortController();
    void getReportFieldCatalog(code, { signal: controller.signal })
      .then((catalog) => { if (!controller.signal.aborted) setFields(catalog); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setFields([]);
        setCatalogError(getUserErrorMessage(error, "No se pudo cargar el catálogo de campos."));
      });
    return () => controller.abort();
  }, [code]);

  const changeRuntime = useCallback((name: string, next: string | boolean) => {
    setRuntimeValues((current) => ({ ...current, [name]: next }));
    setPreview(null);
    setPreviewError(null);
  }, []);

  const changeRuntimeGroups = useCallback((next: RuntimeGroupValues) => {
    setRuntimeGroupValues(next);
    setPreview(null);
    setPreviewError(null);
  }, []);

  function changeColumns(columns: ReportColumn[]) {
    setValue((current) => current && { ...current, columns, layout: pruneTotals(current.layout, columns) });
    setDirty(true);
    setSaved(false);
    setPreview(null);
  }

  function changeParameterGroups(parameterGroups: ReportParameterGroup[]) {
    setValue((current) => current && { ...current, parameterGroups });
    setRuntimeGroupValues(initialRuntimeGroupValues(parameterGroups));
    setDirty(true);
    setSaved(false);
    setPreview(null);
  }

  function changeLayout(layout: ReportExcelLayout) {
    setValue((current) => current && { ...current, layout });
    setDirty(true);
    setSaved(false);
    setPreview(null);
  }

  async function handleSave() {
    if (value == null || savingRef.current) return;
    const validationErrors = validateBuilderForm(value, parameters, fields ?? []);
    setErrors(validationErrors);
    setSaveError(null);
    setSaved(false);
    if (validationErrors.length > 0) return;

    savingRef.current = true;
    setSaving(true);
    try {
      const builder = await saveReportBuilder(code, toBuilderRequest(value));
      // Re-seed from the persisted response, so what stays on screen is what
      // the backend actually stored (normalized keys, ordering, totals).
      setValue(builderFormFromDefinition(builder));
      setRuntimeGroupValues(initialRuntimeGroupValues(builder.parameter_groups));
      setDirty(false);
      setSaved(true);
    } catch (error) {
      // The edited state is intentionally preserved on failure.
      setSaveError(getUserErrorMessage(error, "No se pudo guardar el constructor. Tus cambios siguen en pantalla."));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handlePreview() {
    if (previewing || dirty || value == null) return;
    const validation = validateRuntimeForm(code, parameters, value.parameterGroups, runtimeValues, runtimeGroupValues);
    setRuntimeErrors(validation.fieldErrors);
    setRuntimeGroupErrors(validation.groupErrors);
    setRuntimeRowErrors(validation.rowErrors);
    setPreviewError(validation.formError);
    setPreview(null);
    if (!validation.valid || !optionsReady) return;

    setPreviewing(true);
    try {
      setPreview(await previewReportBuilder(code, validation.parameters));
    } catch (error) {
      setPreviewError(getUserErrorMessage(error, "No se pudo generar la vista previa."));
    } finally {
      setPreviewing(false);
    }
  }

  if (value == null) {
    return (
      <Card>
        <CardHeader><CardTitle>Columnas del reporte</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const columnsConfigured = value.columns.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {loadError && <ErrorAlert title="No se pudo cargar el constructor" message={loadError} />}
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Revisa la configuración de columnas</AlertTitle>
          <AlertDescription><ul className="list-disc pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul></AlertDescription>
        </Alert>
      )}
      {saveError && <ErrorAlert title="No se guardó el constructor" message={saveError} />}
      {saved && (
        <Alert>
          <CircleCheck />
          <AlertTitle>Constructor guardado</AlertTitle>
          <AlertDescription>El backend confirmó las columnas y el formato Excel.</AlertDescription>
        </Alert>
      )}


      {dataSourceCapabilities.includes("REPEATABLE_ROWS") && (
        <Card>
          <CardHeader><CardTitle>Renglones repetibles</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">Define los datos que el usuario capturará una vez por producto. El backend resolverá producto, lista y precio.</p>
            <ReportParameterGroupEditor groups={value.parameterGroups} parameters={parameters} disabled={saving} onChange={changeParameterGroups} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Columnas del reporte</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Cada columna toma su valor de un campo del catálogo, de un parámetro del reporte o de una fórmula
            calculada por el backend.
          </p>
          {catalogError && <ErrorAlert title="No se pudo cargar el catálogo de campos" message={catalogError} />}
          {fields == null ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-2/3" />
            </div>
          ) : (
            <>
              {fields.length === 0 && catalogError == null && (
                <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                  El backend no expone campos de negocio disponibles todavía.
                </p>
              )}
              <ReportColumnEditor
                columns={value.columns}
                fields={fields}
                parameters={parameters}
                parameterGroups={value.parameterGroups}
                disabled={saving}
                onChange={changeColumns}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Formato Excel</CardTitle></CardHeader>
        <CardContent>
          <ReportExcelLayoutEditor
            layout={value.layout}
            columns={value.columns}
            disabled={saving}
            onChange={changeLayout}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {dirty && <p className="text-sm text-muted-foreground">Hay cambios sin guardar.</p>}
        <Button type="button" disabled={saving} onClick={handleSave}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {saving ? "Guardando..." : "Guardar constructor"}
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Vista previa</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            El backend calcula las fórmulas y devuelve solo las columnas visibles.
          </p>
          {dirty && (
            <p className="text-sm text-muted-foreground">
              Guarda el constructor antes de previsualizar para que el backend ejecute esta misma configuración.
            </p>
          )}
          {!columnsConfigured && (
            <p className="text-sm text-muted-foreground">Configura al menos una columna para previsualizar.</p>
          )}
          <ReportRuntimeParameters
            code={code}
            parameters={parameters}
            values={runtimeValues}
            disabled={previewing}
            errors={runtimeErrors}
            onOptionsStateChange={({ ready }) => setScalarOptionsReady(ready)}
            onChange={changeRuntime}
          />
          <ReportRepeatableParameters
            code={code}
            groups={value.parameterGroups}
            scalarValues={runtimeValues}
            values={runtimeGroupValues}
            disabled={previewing}
            errors={runtimeRowErrors}
            groupErrors={runtimeGroupErrors}
            onOptionsStateChange={({ ready }) => setGroupOptionsReady(ready)}
            onChange={changeRuntimeGroups}
          />
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={dirty || previewing || !columnsConfigured || !optionsReady}
              onClick={handlePreview}
            >
              {previewing ? <Loader2 className="animate-spin" /> : <Play />}
              {previewing ? "Generando..." : "Generar vista previa"}
            </Button>
          </div>
          {previewError && <ErrorAlert title="La vista previa devolvió un error" message={previewError} />}
          {preview && <ReportBuilderPreviewTable preview={preview} />}
        </CardContent>
      </Card>
    </div>
  );
}
