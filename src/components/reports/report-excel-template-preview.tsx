"use client";

import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { ReportDocumentDownloadButton } from "@/components/reports/report-document-download-button";
import { ReportRepeatableParameters } from "@/components/reports/report-repeatable-parameters";
import { ReportRuntimeParameters } from "@/components/reports/report-runtime-parameters";
import { WorkbookGrid } from "@/components/reports/workbook-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { executeReport, renderReportExcelTemplatePreview } from "@/lib/api/reports";
import { MAX_RENDERABLE_CELLS, sheetGridBounds, usedRangeCellCount } from "@/lib/reports/report-excel-inspection";
import { excelTemplateValidationSummary, parseExcelTemplateValidation } from "@/lib/reports/report-excel-template";
import {
  backendRowErrors,
  initialRuntimeGroupValues,
  initialRuntimeValues,
  isReportBuilderPreviewResponse,
  reportExecutionId,
  validateRuntimeForm,
  type RuntimeGroupValues,
  type RuntimeParameterValue,
} from "@/lib/reports/report-runtime";
import type { ReportDefinition, ReportExcelRenderPreview } from "@/types/api";

type PreviewStage =
  | { status: "idle" }
  | { status: "executing" }
  | { status: "rendering" }
  | { status: "ready"; preview: ReportExcelRenderPreview; rowCount: number }
  | { status: "expired" }
  | { status: "error"; message: string };

const UNSAVED_CHANGES_MESSAGE = "Guarda los cambios de la plantilla antes de generar la vista previa.";

/**
 * The "Vista previa" mode of the visual template editor (Frontend #31,
 * Backend #30): captures test parameters with the report's own runtime
 * controls, runs a real execution to get an `execution_id`, then renders the
 * template against that snapshot and inspects the *result* — rendering it
 * through the same `WorkbookGrid` the design mode uses, read-only.
 *
 * Nothing here reconstructs a workbook: the backend renders and inspects it,
 * this only asks for it and displays what comes back.
 */
export function ReportExcelTemplatePreview({
  report,
  hasSummaries,
  templateVersion,
  hasUnsavedChanges,
  onPreviewReady,
}: {
  report: ReportDefinition;
  /** Whether the builder has any summary/total configured — never recomputed here. */
  hasSummaries: boolean;
  templateVersion: number;
  hasUnsavedChanges: boolean;
  /** Fires once a render actually succeeds — a session fact the wizard's checklist (#33) cannot re-derive from the backend. */
  onPreviewReady?: () => void;
}) {
  const groups = useMemo(() => report.parameter_groups ?? [], [report.parameter_groups]);
  const [values, setValues] = useState(() => initialRuntimeValues(report.parameters));
  const [groupValues, setGroupValues] = useState<RuntimeGroupValues>(() => initialRuntimeGroupValues(groups));
  const [stage, setStage] = useState<PreviewStage>({ status: "idle" });
  const [backendErrors, setBackendErrors] = useState<Record<string, Record<number, Record<string, string>>>>({});
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const [scalarOptionsState, setScalarOptionsState] = useState(() => ({
    loading: report.parameters.some((parameter) => parameter.input_type === "select"),
    ready: report.parameters.every((parameter) => parameter.input_type !== "select"),
  }));
  const [groupOptionsState, setGroupOptionsState] = useState(() => {
    const loading = groups.some((group) =>
      group.fields.some((field) => field.input_type === "select")
      && String(values[group.context_parameter] ?? "").trim() !== "",
    );
    return { loading, ready: !loading };
  });

  const validation = useMemo(
    () => validateRuntimeForm(report.code, report.parameters, groups, values, groupValues),
    [groups, report.code, report.parameters, values, groupValues],
  );
  const optionsReady = scalarOptionsState.ready && groupOptionsState.ready;
  const loadingOptions = scalarOptionsState.loading || groupOptionsState.loading;
  const busy = stage.status === "executing" || stage.status === "rendering";
  const noParameters = report.parameters.length === 0 && groups.length === 0;

  function invalidate() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStage((current) => (current.status === "idle" ? current : { status: "idle" }));
    setBackendErrors({});
  }

  function handleChange(name: string, value: RuntimeParameterValue) {
    setValues((current) => ({ ...current, [name]: value }));
    invalidate();
  }

  function handleGroupChange(next: RuntimeGroupValues) {
    setGroupValues(next);
    invalidate();
  }

  async function generate() {
    if (!validation.valid || !optionsReady || busy || hasUnsavedChanges) return;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setStage({ status: "executing" });
    setBackendErrors({});
    setActiveSheetIndex(0);
    const parameters = structuredClone(validation.parameters);
    try {
      const payload = await executeReport(report.code, parameters, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!isReportBuilderPreviewResponse(payload)) {
        setStage({ status: "error", message: "Este reporte no produce un documento Excel previsualizable." });
        return;
      }
      const executionId = reportExecutionId(payload);
      if (!executionId) {
        setStage({
          status: "error",
          message: "El reporte no generó una ejecución con snapshot; no se puede previsualizar el documento.",
        });
        return;
      }
      setStage({ status: "rendering" });
      const preview = await renderReportExcelTemplatePreview(report.code, executionId, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setStage({ status: "ready", preview, rowCount: payload.row_count });
      onPreviewReady?.();
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 404) {
        setStage({ status: "expired" });
        return;
      }
      if (error instanceof ApiError) setBackendErrors(backendRowErrors(error.detail, groups));
      const structured = error instanceof ApiError ? parseExcelTemplateValidation(error.detail) : null;
      setStage({
        status: "error",
        message: structured
          ? excelTemplateValidationSummary(structured)
          : getUserErrorMessage(error, "No se pudo generar la vista previa."),
      });
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  const rowErrors = Object.keys(backendErrors).length > 0 ? backendErrors : validation.rowErrors;

  return (
    <div className="flex flex-col gap-5">
      {hasUnsavedChanges && <ErrorAlert title="Guarda la plantilla primero" message={UNSAVED_CHANGES_MESSAGE} />}

      {!noParameters && (
        <div className="flex flex-col gap-5">
          <ReportRuntimeParameters
            code={report.code}
            parameters={report.parameters}
            values={values}
            disabled={busy || hasUnsavedChanges}
            errors={validation.fieldErrors}
            onOptionsStateChange={setScalarOptionsState}
            onChange={handleChange}
          />
          <ReportRepeatableParameters
            code={report.code}
            groups={groups}
            scalarValues={values}
            values={groupValues}
            disabled={busy || hasUnsavedChanges}
            errors={rowErrors}
            groupErrors={validation.groupErrors}
            onOptionsStateChange={setGroupOptionsState}
            onChange={handleGroupChange}
          />
        </div>
      )}
      {noParameters && <p className="text-sm text-muted-foreground">Este reporte no requiere parámetros.</p>}
      {validation.formError && <p className="text-sm text-destructive">{validation.formError}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={!validation.valid || !optionsReady || busy || hasUnsavedChanges}
          onClick={() => void generate()}
        >
          {busy || loadingOptions ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
          {stage.status === "executing"
            ? "Generando ejecución…"
            : stage.status === "rendering"
              ? "Renderizando documento…"
              : "Generar vista previa"}
        </Button>
        {!validation.valid && (
          <p className="text-sm text-muted-foreground">Completa los parámetros y renglones obligatorios con valores válidos.</p>
        )}
      </div>

      {stage.status === "expired" && (
        <ErrorAlert title="La vista previa expiró" message="Regenera la vista previa para continuar." />
      )}
      {stage.status === "error" && <ErrorAlert title="No se pudo generar la vista previa" message={stage.message} />}

      {stage.status === "ready" && (
        <PreviewResult
          preview={stage.preview}
          rowCount={stage.rowCount}
          hasSummaries={hasSummaries}
          currentTemplateVersion={templateVersion}
          reportCode={report.code}
          activeSheetIndex={activeSheetIndex}
          onSheetChange={setActiveSheetIndex}
        />
      )}
    </div>
  );
}

function PreviewResult({
  preview,
  rowCount,
  hasSummaries,
  currentTemplateVersion,
  reportCode,
  activeSheetIndex,
  onSheetChange,
}: {
  preview: ReportExcelRenderPreview;
  rowCount: number;
  hasSummaries: boolean;
  currentTemplateVersion: number;
  reportCode: string;
  activeSheetIndex: number;
  onSheetChange: (index: number) => void;
}) {
  const sheet = preview.sheets[activeSheetIndex] ?? preview.sheets[0] ?? null;
  const bounds = sheet ? sheetGridBounds(sheet) : null;
  const cellCount = bounds ? usedRangeCellCount(bounds) : 0;
  const tooLargeToRender = bounds != null && cellCount > MAX_RENDERABLE_CELLS;
  const leftoverCoordinates = useMemo(
    () => new Set((sheet?.cells ?? []).filter((cell) => cell.placeholders.length > 0).map((cell) => cell.coordinate)),
    [sheet],
  );
  const stale = preview.template_version !== currentTemplateVersion;

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Vista previa basada en plantilla v{preview.template_version}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">✓ Plantilla v{preview.template_version}</Badge>
          <Badge variant="outline">
            ✓ {rowCount} {rowCount === 1 ? "partida renderizada" : "partidas renderizadas"}
          </Badge>
          {hasSummaries && <Badge variant="outline">✓ Resúmenes presentes</Badge>}
        </div>
      </div>

      {stale && (
        <p className="text-sm text-muted-foreground">
          Esta vista previa se generó con la plantilla v{preview.template_version}; la versión activa ahora es v
          {currentTemplateVersion}. Regenera la vista previa para verla actualizada.
        </p>
      )}
      {rowCount === 0 && (
        <p className="text-sm text-muted-foreground">
          El dataset generado no tiene renglones; la vista previa se muestra sin productos.
        </p>
      )}
      {leftoverCoordinates.size > 0 && (
        <ErrorAlert
          title="Placeholders sin resolver"
          message={`${leftoverCoordinates.size} celda(s) del documento renderizado conservan un placeholder sin reemplazar. Revisa el mapeo de la plantilla en la pestaña Diseño.`}
        />
      )}

      {preview.sheets.length > 1 && (
        <Tabs value={String(activeSheetIndex)} onValueChange={(value) => onSheetChange(Number(value))}>
          <TabsList>
            {preview.sheets.map((sheetOption, index) => (
              <TabsTrigger key={sheetOption.name} value={String(index)}>
                {sheetOption.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      {preview.sheets.length === 1 && sheet && <p className="text-sm font-medium">Hoja: {sheet.name}</p>}

      {sheet &&
        (tooLargeToRender ? (
          <ErrorAlert
            title="Hoja demasiado grande para mostrarse"
            message={`Esta hoja tiene ${cellCount.toLocaleString("es-MX")} celdas en su rango usado, más de las ${MAX_RENDERABLE_CELLS.toLocaleString("es-MX")} que el inspector puede mostrar de forma legible.`}
          />
        ) : (
          <WorkbookGrid sheet={sheet} styles={preview.styles} warningCoordinates={leftoverCoordinates} />
        ))}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Descargar</h3>
        <p className="text-sm text-muted-foreground">
          El archivo descargado corresponde exactamente a esta vista previa (ejecución {preview.execution_id}).
        </p>
        <ReportDocumentDownloadButton code={reportCode} executionId={preview.execution_id} />
      </div>
    </div>
  );
}
