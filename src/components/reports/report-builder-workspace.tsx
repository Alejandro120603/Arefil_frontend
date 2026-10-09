"use client";

import { useCallback, useState } from "react";
import { CircleCheck, Loader2, Play, Save } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { ReportBuilderPreviewTable } from "@/components/reports/report-builder-preview-table";
import { ReportColumnEditor } from "@/components/reports/report-column-editor";
import { ReportExcelLayoutEditor } from "@/components/reports/report-excel-layout-editor";
import { ReportRepeatableParameters } from "@/components/reports/report-repeatable-parameters";
import { ReportSummaryEditor } from "@/components/reports/report-summary-editor";
import { ReportRuntimeParameters } from "@/components/reports/report-runtime-parameters";
import { ReportSaveFailureAlert, TemplateDependencyAlert } from "@/components/reports/report-template-dependency-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserErrorMessage } from "@/lib/api/errors";
import { previewReportBuilder } from "@/lib/api/reports";
import type { ReportBuilderDraft } from "@/hooks/use-report-builder-draft";
import { normalizeSummaries, pruneTotals, validateBuilderForm } from "@/lib/reports/report-builder";
import { placeholderLabelResolver, reportSaveFailure, type ReportSaveFailure } from "@/lib/reports/report-save-errors";
import {
  NO_TEMPLATE_DEPENDENCIES,
  templateDependencyBlocks,
  type TemplateContractState,
  type TemplateDependencies,
  type TemplateDependencyBlock,
} from "@/lib/reports/report-template-dependencies";
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
  onSaved,
  templateDependencies = NO_TEMPLATE_DEPENDENCIES,
  onGoToMapping,
  onTemplateMayHaveChanged,
}: {
  code: string;
  /**
   * The wizard-owned builder (`useReportBuilderDraft`): this component never
   * loads or saves the builder itself, it edits `builder.draft` and asks
   * `builder.save()` to persist it.
   */
  builder: ReportBuilderDraft;
  parameters: ReportParameter[];
  onSaved?: () => void;
  /**
   * What the active Excel template uses (Frontend #43). Removing or hiding a
   * column, or removing a summary, that it uses is refused locally; label,
   * source, format and formula changes that keep the key never are.
   */
  templateDependencies?: TemplateDependencies;
  onGoToMapping?: () => void;
  /** A save was refused for template reasons or a conflict: the shared inspection may be stale. */
  onTemplateMayHaveChanged?: () => void;
}) {
  const { draft: value, fields, loadError, catalogError, dirty, saving, updateDraft } = builder;
  /**
   * The repeatable groups are edited in "Fuente y entradas" (Frontend #41B);
   * here they only feed the columns ("Dato capturado") and the preview rows.
   */
  const groups = value?.parameterGroups ?? EMPTY_GROUPS;

  const [errors, setErrors] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<ReportSaveFailure | null>(null);
  const [templateBlock, setTemplateBlock] = useState<TemplateDependencyBlock[] | null>(null);
  const [saved, setSaved] = useState(false);

  const [runtimeValues, setRuntimeValues] = useState<RuntimeParameterValues>(
    () => initialRuntimeValues(parameters),
  );
  const [runtimeGroupValues, setRuntimeGroupValues] = useState<RuntimeGroupValues>(
    () => initialRuntimeGroupValues(groups),
  );
  // Whenever the groups change (loaded, saved, or edited in "Fuente y
  // entradas"), the preview rows restart from them, as they always did.
  const [runtimeSeed, setRuntimeSeed] = useState(groups);
  if (runtimeSeed !== groups) {
    setRuntimeSeed(groups);
    setRuntimeGroupValues(initialRuntimeGroupValues(groups));
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

  /** Refuses an edit that would take away an identity the active template reads. */
  function blockedByTemplate(after: TemplateContractState): boolean {
    if (value == null) return false;
    const blocks = templateDependencyBlocks(templateDependencies, { columns: value.columns, summaries: value.layout.totals }, after);
    setTemplateBlock(blocks.length > 0 ? blocks : null);
    return blocks.length > 0;
  }

  function changeColumns(columns: ReportColumn[]) {
    if (value == null) return;
    // Removing a column can also prune the totals that summed it.
    const layout = pruneTotals(value.layout, columns);
    if (blockedByTemplate({ columns, summaries: layout.totals })) return;
    updateDraft((current) => ({ ...current, columns, layout: pruneTotals(current.layout, columns) }));
    edited();
  }

  function changeSummaries(totals: ReportSummaryConfiguration[]) {
    if (blockedByTemplate({ columns: value?.columns, summaries: totals })) return;
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
    // The inspection may have arrived after the draft was edited: compare the
    // whole draft with what the backend last confirmed before sending it.
    const persisted = builder.persisted;
    if (persisted != null) {
      const blocks = templateDependencyBlocks(
        templateDependencies,
        { columns: persisted.columns, summaries: normalizeSummaries(persisted.excel_layout?.totals ?? [], persisted.columns) },
        { columns: value.columns, summaries: value.layout.totals },
      );
      if (blocks.length > 0) {
        setTemplateBlock(blocks);
        return;
      }
    }

    try {
      const confirmed = await builder.save();
      if (confirmed == null) return;
      setSaved(true);
      onSaved?.();
    } catch (error) {
      // The edited state is intentionally preserved on failure.
      const failure = reportSaveFailure(error, "No se pudo guardar el constructor. Tus cambios siguen en pantalla.");
      setSaveError(failure);
      if (failure.kind === "template" || failure.kind === "conflict") onTemplateMayHaveChanged?.();
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
      {saveError && (
        <ReportSaveFailureAlert
          title="No se guardó el constructor"
          failure={saveError}
          resolveLabel={placeholderLabelResolver({
            parameters,
            columns: [...(builder.persisted?.columns ?? []), ...value.columns],
            summaries: [
              ...normalizeSummaries(builder.persisted?.excel_layout?.totals ?? [], builder.persisted?.columns ?? []),
              ...value.layout.totals,
            ],
          })}
          onGoToMapping={onGoToMapping}
        />
      )}
      {templateBlock && (
        <TemplateDependencyAlert blocks={templateBlock} onGoToMapping={onGoToMapping} onCancel={() => setTemplateBlock(null)} />
      )}
      {saved && (
        <Alert>
          <CircleCheck />
          <AlertTitle>Constructor guardado</AlertTitle>
          <AlertDescription>El backend confirmó las columnas y el formato Excel.</AlertDescription>
        </Alert>
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
                templateUsage={templateDependencies.rows}
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
            templateUsage={templateDependencies.summary}
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
            lineAmount={{ columns: value.columns, summaries: value.layout.totals }}
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
