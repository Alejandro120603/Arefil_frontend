"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { ReportDataDownloadButtons } from "@/components/reports/report-data-download-buttons";
import { ReportDocumentDownloadButton } from "@/components/reports/report-document-download-button";
import {
  LetterheadPresentationSummary,
  ReportLetterheadSelector,
  useReportLetterheadOptions,
} from "@/components/reports/report-letterhead-selector";
import { ReportRepeatableParameters } from "@/components/reports/report-repeatable-parameters";
import { ReportRuntimePreview } from "@/components/reports/report-runtime-preview";
import { ReportRuntimeParameters } from "@/components/reports/report-runtime-parameters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { executeReport } from "@/lib/api/reports";
import {
  frozenLetterhead,
  initialLetterheadSelection,
  isLetterheadSelectionError,
  presentationMatches,
  reconcileLetterheadSelection,
  withPresentation,
  type LetterheadSelection,
} from "@/lib/letterheads/letterhead-runtime";
import {
  backendRowErrors,
  isReportBuilderPreviewResponse,
  reportDocumentAvailable,
  reportExecutionId,
  initialRuntimeGroupValues,
  initialRuntimeValues,
  parameterDisplayValues,
  validateRuntimeForm,
  type RuntimeGroupValues,
  type RuntimeParameterValue,
} from "@/lib/reports/report-runtime";
import type { ReportColumn, ReportDefinition, ReportOption, ReportSummaryConfiguration } from "@/types/api";
import type { FrozenLetterhead, ReportLetterheadOptions } from "@/types/letterhead-runtime";

interface SuccessfulExecution {
  id: number;
  parameters: Record<string, unknown>;
  payload: unknown;
  /**
   * Snapshot the backend froze for this run (Backend #25). The final document
   * renders from it alone, so it lives and dies with this execution: any edit
   * clears the execution and with it the id.
   */
  executionId: string | null;
  /** True only when this execution pinned a document template at generation. */
  documentAvailable: boolean;
  /** Labels of the option-backed values sent (`price_list_id` → its name), fixed at generation. */
  parameterLabels: Record<string, string>;
  /**
   * Presentation the backend froze for this execution (Backend #39), shown
   * as returned — never re-derived from the live catalog. `undefined` when
   * the report offers no letterheads.
   */
  frozenLetterhead: FrozenLetterhead | null | undefined;
}

interface GenericReportRuntimeProps {
  report: ReportDefinition;
  /** Saved summary configuration; the dataset only carries their keys. */
  summaries?: ReportSummaryConfiguration[];
  /** Saved builder columns: the line "Total" estimate evaluates their formula (#45). */
  columns?: ReportColumn[];
  initialParameters?: Record<string, unknown>;
}

/**
 * Everything the runtime holds — commercial form, letterhead selection and
 * its options, the execution, in-flight generation and downloads — belongs to
 * one report. Client-side navigation between `[code]` pages can reuse this
 * component, so the state is keyed by `report.code`: another report gets a
 * fresh instance in the same render (no intermediate render can send the
 * previous selection), and unmounting the old one aborts its requests.
 */
export function GenericReportRuntime(props: GenericReportRuntimeProps) {
  return <ReportRuntimeForCode key={props.report.code} {...props} />;
}

function ReportRuntimeForCode({
  report,
  summaries = [],
  columns = [],
  initialParameters = {},
}: GenericReportRuntimeProps) {
  const groups = useMemo(() => report.parameter_groups ?? [], [report.parameter_groups]);
  const [values, setValues] = useState(() => initialRuntimeValues(report.parameters, initialParameters));
  const [groupValues, setGroupValues] = useState<RuntimeGroupValues>(() => initialRuntimeGroupValues(groups));
  const [execution, setExecution] = useState<SuccessfulExecution | null>(null);
  const [parameterOptions, setParameterOptions] = useState<Record<string, ReportOption[]>>({});
  const executionIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  /**
   * Monotonic id of the generation the screen is waiting for. Every
   * invalidation bumps it, so a response that arrives late — even one whose
   * abort lost the race — can never restore an execution made with an older
   * selection or older parameters.
   */
  const requestSeqRef = useRef(0);
  const [letterhead, setLetterhead] = useState<{
    selection: LetterheadSelection;
    /** The chosen version stopped being offered and the user has not chosen again. */
    stale: boolean;
    /** The backend default was applied once; later reads only reconcile. */
    initialized: boolean;
  }>({ selection: undefined, stale: false, initialized: false });
  const letterheadSelection = letterhead.selection;
  const handleLetterheadOptions = useCallback((options: ReportLetterheadOptions) => {
    setLetterhead((current) => {
      if (!current.initialized) {
        return { selection: initialLetterheadSelection(options), stale: false, initialized: true };
      }
      const selection = reconcileLetterheadSelection(current.selection, options);
      return { ...current, selection, stale: current.stale || (current.selection !== undefined && selection === undefined) };
    });
  }, []);
  const letterheadOptions = useReportLetterheadOptions(report.code, handleLetterheadOptions);
  const letterheadsSupported = letterheadOptions.data?.supported === true;
  /**
   * The letterhead endpoint is the only authority on support: whether the
   * builder columns loaded says nothing about it (the page renders a
   * runnable report with no columns when that separate request fails).
   * Shown while loading and when support is unknown; only an explicit
   * `supported: false` hides it.
   */
  const selectorVisible = letterheadOptions.data?.supported !== false;
  /** Generation waits for the options: sending nothing would silently skip the admin's default. */
  const letterheadPending =
    letterheadOptions.loading || (letterheadsSupported && letterheadSelection === undefined);
  const [generatedOnce, setGeneratedOnce] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [backendErrors, setBackendErrors] = useState<Record<string, Record<number, Record<string, string>>>>({});
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
    [groupValues, groups, report.code, report.parameters, values],
  );
  const optionsReady = scalarOptionsState.ready && groupOptionsState.ready;
  const lineAmount = useMemo(() => ({ columns, summaries }), [columns, summaries]);
  const loadingOptions = scalarOptionsState.loading || groupOptionsState.loading;

  useEffect(() => () => controllerRef.current?.abort(), []);

  const invalidateExecution = useCallback(() => {
    requestSeqRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setGenerating(false);
    setExecution(null);
    setGenerationError(null);
    setBackendErrors({});
  }, []);

  function handleChange(name: string, value: RuntimeParameterValue) {
    setValues((current) => ({ ...current, [name]: value }));
    invalidateExecution();
  }

  function handleGroupChange(next: RuntimeGroupValues) {
    setGroupValues(next);
    invalidateExecution();
  }

  /** Same policy as any parameter edit: the execution on screen no longer matches the form. */
  function handleLetterheadChange(next: number | null) {
    setLetterhead({ selection: next, stale: false, initialized: true });
    invalidateExecution();
  }

  function reloadLetterheadOptions() {
    invalidateExecution();
    letterheadOptions.reload();
  }

  async function generate() {
    if (!validation.valid || !optionsReady || generating || letterheadPending) return;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    const requestSeq = ++requestSeqRef.current;
    const isCurrent = () => !controller.signal.aborted && requestSeqRef.current === requestSeq;
    setGenerating(true);
    setGenerationError(null);
    setBackendErrors({});
    setExecution(null);
    const parameters = structuredClone(validation.parameters);
    // The selection travels as presentation metadata beside the business
    // parameters; `parameters` (kept for the legacy data re-run) never sees it.
    const requestedLetterhead = letterheadsSupported ? (letterheadSelection as number | null) : undefined;
    const body = requestedLetterhead !== undefined ? withPresentation(parameters, requestedLetterhead) : parameters;
    try {
      const payload = await executeReport(report.code, body, { signal: controller.signal });
      if (!isCurrent()) return;
      if (requestedLetterhead !== undefined && !presentationMatches(payload, requestedLetterhead)) {
        setGenerationError("La ejecución no corresponde a la presentación elegida. Genera el reporte de nuevo.");
        return;
      }
      executionIdRef.current += 1;
      setExecution({
        id: executionIdRef.current,
        parameters,
        payload,
        executionId: reportExecutionId(payload),
        documentAvailable: reportDocumentAvailable(payload),
        parameterLabels: parameterDisplayValues(report.parameters, parameters, parameterOptions),
        frozenLetterhead: requestedLetterhead !== undefined ? frozenLetterhead(payload) : undefined,
      });
      setGeneratedOnce(true);
    } catch (error) {
      if (!isCurrent()) return;
      if (isLetterheadSelectionError(error)) {
        // The catalog changed under the form (deactivated, unassigned, new
        // version...). Nothing was generated; read the options again and let
        // the user choose — never retry with another letterhead by ourselves.
        setGenerationError(
          `${getUserErrorMessage(error, "El membrete elegido ya no está disponible.")} Actualizamos las opciones de membrete; revisa la presentación del documento y genera de nuevo.`,
        );
        letterheadOptions.reload();
        return;
      }
      if (error instanceof ApiError) setBackendErrors(backendRowErrors(error.detail, groups));
      setGenerationError(getUserErrorMessage(error, "No se pudieron generar los datos del reporte."));
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (requestSeqRef.current === requestSeq && !controller.signal.aborted) setGenerating(false);
    }
  }

  const rowErrors = Object.keys(backendErrors).length > 0 ? backendErrors : validation.rowErrors;
  const generateDisabled = !validation.valid || !optionsReady || generating || letterheadPending;
  // After the commercial parameters and, when the report offers letterheads,
  // after «Presentación del documento»: the button always comes last.
  const generateControls = (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" disabled={generateDisabled} onClick={generate}>
        {generating || loadingOptions || letterheadOptions.loading ? <Loader2 className="animate-spin" /> : <FileText />}
        {generating ? "Generando..." : generatedOnce ? "Regenerar reporte" : "Generar reporte"}
      </Button>
      {!validation.valid && <p className="text-sm text-muted-foreground">Completa los parámetros y renglones obligatorios con valores válidos.</p>}
      {validation.valid && letterheadsSupported && letterheadSelection === undefined && !letterheadOptions.loading && (
        <p className="text-sm text-muted-foreground">Elige la presentación del documento.</p>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <Card id="parametros" className="scroll-mt-6">
        <CardHeader><CardTitle>Parámetros del reporte</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-5">
          <ReportRuntimeParameters
            code={report.code}
            parameters={report.parameters}
            values={values}
            disabled={generating}
            errors={validation.fieldErrors}
            onOptionsStateChange={setScalarOptionsState}
            onOptionsLoaded={setParameterOptions}
            onChange={handleChange}
          />
          <ReportRepeatableParameters
            code={report.code}
            groups={groups}
            scalarValues={values}
            lineAmount={lineAmount}
            values={groupValues}
            disabled={generating}
            errors={rowErrors}
            groupErrors={validation.groupErrors}
            onOptionsStateChange={setGroupOptionsState}
            onChange={handleGroupChange}
          />
          {validation.formError && <p className="text-sm text-destructive">{validation.formError}</p>}
          {!selectorVisible && generateControls}
        </CardContent>
      </Card>

      {selectorVisible && (
        // Not disabled while generating: changing the presentation aborts the
        // generation in flight, exactly like the stale-response guard expects.
        <ReportLetterheadSelector
          state={letterheadOptions}
          selection={letterheadSelection}
          staleSelection={letterhead.stale}
          onChange={handleLetterheadChange}
          onReload={reloadLetterheadOptions}
        />
      )}
      {selectorVisible && generateControls}

      {generationError && <ErrorAlert title="No se pudo generar el reporte" message={generationError} />}

      {execution != null && (
        <>
          <section id="ejecucion" className="scroll-mt-6">
            <ReportRuntimePreview
              key={execution.id}
              payload={execution.payload}
              summaries={summaries}
              parameters={report.parameters}
              parameterLabels={execution.parameterLabels}
            />
          </section>
          <Card id="descargas" className="scroll-mt-6">
            <CardHeader><CardTitle>Descargar reporte</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* Every download renders from `execution.executionId`, the frozen
                  snapshot behind this preview — the backend never re-runs it.
                  Only a legacy result without a snapshot
                  falls back to `execution.parameters`. Any edit clears the
                  execution, so a stale file can never be downloaded. */}
              {isReportBuilderPreviewResponse(execution.payload) && execution.documentAvailable && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">Documento</h3>
                  <p className="text-sm text-muted-foreground">El documento final se arma con la presentación fijada para esta ejecución y exactamente las filas y totales de esta vista previa.</p>
                  {execution.frozenLetterhead !== undefined && (
                    <LetterheadPresentationSummary letterhead={execution.frozenLetterhead} />
                  )}
                  <ReportDocumentDownloadButton code={report.code} executionId={execution.executionId} />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">Exportar datos</h3>
                <p className="text-sm text-muted-foreground">También puedes descargar los datos tabulares que generó el backend.</p>
                <ReportDataDownloadButtons code={report.code} executionId={execution.executionId} parameters={execution.parameters} />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
