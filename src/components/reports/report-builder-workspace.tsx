"use client";

import { useCallback, useState } from "react";
import { CircleCheck, Loader2, Play, Save } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { ReportBuilderPreviewTable } from "@/components/reports/report-builder-preview-table";
import { ReportColumnEditor } from "@/components/reports/report-column-editor";
import { ReportExcelLayoutEditor } from "@/components/reports/report-excel-layout-editor";
import { ReportParameterGroupEditor } from "@/components/reports/report-parameter-group-editor";
import { ReportRepeatableParameters } from "@/components/reports/report-repeatable-parameters";
import { ReportSummaryEditor } from "@/components/reports/report-summary-editor";
import { ReportRuntimeParameters } from "@/components/reports/report-runtime-parameters";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserErrorMessage } from "@/lib/api/errors";
import { previewReportBuilder } from "@/lib/api/reports";
import type { ReportBuilderDraft } from "@/hooks/use-report-builder-draft";
import { pruneTotals, validateBuilderForm } from "@/lib/reports/report-builder";
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
  ReportParameter,
  ReportParameterGroup,
  ReportSummaryConfiguration,
} from "@/types/api";

const EMPTY_GROUPS: ReportParameterGroup[] = [];

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
  builder,
  parameters,
  dataSourceCapabilities,
  onSaved,
}: {
  code: string;
  /**
   * The wizard-owned builder (`useReportBuilderDraft`): this component never
   * loads or saves the builder itself, it edits `builder.draft` and asks
   * `builder.save()` to persist it.
   */
  builder: ReportBuilderDraft;
  parameters: ReportParameter[];
  dataSourceCapabilities: string[];
  onSaved?: () => void;
}) {
  const { draft: value, fields, persisted, loadError, catalogError, dirty, saving, updateDraft } = builder;
  /** The repeatable groups as last persisted: their internal names are frozen. */
  const savedGroups = persisted?.parameter_groups ?? EMPTY_GROUPS;

  const [errors, setErrors] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [runtimeValues, setRuntimeValues] = useState<RuntimeParameterValues>(
    () => initialRuntimeValues(parameters),
  );
  const [runtimeGroupValues, setRuntimeGroupValues] = useState<RuntimeGroupValues>(
    () => initialRuntimeGroupValues(savedGroups),
  );
  // Every time the backend confirms a builder (load or save), the runtime rows
  // restart from its groups — exactly what the workspace did when it loaded
  // the builder itself.
  const [runtimeSeed, setRuntimeSeed] = useState(persisted);
  if (runtimeSeed !== persisted) {
    setRuntimeSeed(persisted);
    setRuntimeGroupValues(initialRuntimeGroupValues(savedGroups));
  }
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

  function edited() {
    setSaved(false);
    setPreview(null);
  }

  function changeColumns(columns: ReportColumn[]) {
    updateDraft((current) => ({ ...current, columns, layout: pruneTotals(current.layout, columns) }));
    edited();
  }

  function changeParameterGroups(parameterGroups: ReportParameterGroup[]) {
    updateDraft((current) => ({ ...current, parameterGroups }));
    setRuntimeGroupValues(initialRuntimeGroupValues(parameterGroups));
    edited();
  }

  function changeSummaries(totals: ReportSummaryConfiguration[]) {
    updateDraft((current) => ({ ...current, layout: { ...current.layout, totals } }));
    edited();
  }

  function changeLayout(layout: ReportExcelLayout) {
    updateDraft((current) => ({ ...current, layout }));
    edited();
  }

  async function handleSave() {
    if (value == null || saving) return;
    const validationErrors = validateBuilderForm(value, parameters, fields ?? []);
    setErrors(validationErrors);
    setSaveError(null);
    setSaved(false);
    if (validationErrors.length > 0) return;

    try {
      const confirmed = await builder.save();
      if (confirmed == null) return;
      setSaved(true);
      onSaved?.();
    } catch (error) {
      // The edited state is intentionally preserved on failure.
      setSaveError(getUserErrorMessage(error, "No se pudo guardar el constructor. Tus cambios siguen en pantalla."));
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
          <CardHeader><CardTitle>Productos por renglón</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">Define los datos que el usuario capturará una vez por producto. El precio y la descripción se toman de la lista seleccionada.</p>
            <ReportParameterGroupEditor
              groups={value.parameterGroups}
              parameters={parameters}
              savedGroups={savedGroups}
              referencedSources={value.columns.flatMap((column) => column.source_parameter?.includes(".") ? [column.source_parameter] : [])}
              disabled={saving}
              onChange={changeParameterGroups}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Columnas del reporte</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Cada columna muestra un dato de la fuente, un dato capturado al generar el reporte o un cálculo
            hecho a partir de otras columnas.
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
        <CardHeader><CardTitle>Resumen y totales</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Valores calculados una sola vez para todo el reporte: Subtotal totaliza una columna, IVA y Total se
            calculan a partir de otros totales y de los datos capturados numéricos.
          </p>
          <ReportSummaryEditor
            summaries={value.layout.totals}
            columns={value.columns}
            parameters={parameters}
            disabled={saving}
            onChange={changeSummaries}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Formato Excel</CardTitle></CardHeader>
        <CardContent>
          <ReportExcelLayoutEditor layout={value.layout} disabled={saving} onChange={changeLayout} />
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
          {preview && (
            <ReportBuilderPreviewTable
              preview={preview}
              summaries={value.layout.totals}
              parameters={parameters}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
