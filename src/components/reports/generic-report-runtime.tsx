"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { GenericReportViewer } from "@/components/reports/generic-report-viewer";
import { ReportBuilderPreviewTable } from "@/components/reports/report-builder-preview-table";
import { ReportDataDownloadButtons } from "@/components/reports/report-data-download-buttons";
import { ReportRepeatableParameters } from "@/components/reports/report-repeatable-parameters";
import { ReportRuntimeParameters } from "@/components/reports/report-runtime-parameters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { executeReport } from "@/lib/api/reports";
import {
  backendRowErrors,
  initialRuntimeGroupValues,
  initialRuntimeValues,
  isReportBuilderPreviewResponse,
  validateRuntimeForm,
  type RuntimeGroupValues,
  type RuntimeParameterValue,
} from "@/lib/reports/report-runtime";
import type { ReportDefinition } from "@/types/api";

interface SuccessfulExecution {
  id: number;
  parameters: Record<string, unknown>;
  payload: unknown;
}

export function GenericReportRuntime({ report }: { report: ReportDefinition }) {
  const groups = useMemo(() => report.parameter_groups ?? [], [report.parameter_groups]);
  const [values, setValues] = useState(() => initialRuntimeValues(report.parameters));
  const [groupValues, setGroupValues] = useState<RuntimeGroupValues>(() => initialRuntimeGroupValues(groups));
  const [execution, setExecution] = useState<SuccessfulExecution | null>(null);
  const executionIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
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
  const loadingOptions = scalarOptionsState.loading || groupOptionsState.loading;

  useEffect(() => () => controllerRef.current?.abort(), []);

  const invalidateExecution = useCallback(() => {
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

  async function generate() {
    if (!validation.valid || !optionsReady || generating) return;
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    setGenerating(true);
    setGenerationError(null);
    setBackendErrors({});
    setExecution(null);
    const parameters = structuredClone(validation.parameters);
    try {
      const payload = await executeReport(report.code, parameters, { signal: controller.signal });
      if (controller.signal.aborted) return;
      executionIdRef.current += 1;
      setExecution({ id: executionIdRef.current, parameters, payload });
      setGeneratedOnce(true);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError) setBackendErrors(backendRowErrors(error.detail, groups));
      setGenerationError(getUserErrorMessage(error, "No se pudieron generar los datos del reporte."));
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (!controller.signal.aborted) setGenerating(false);
    }
  }

  const rowErrors = Object.keys(backendErrors).length > 0 ? backendErrors : validation.rowErrors;

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
            onChange={handleChange}
          />
          <ReportRepeatableParameters
            code={report.code}
            groups={groups}
            scalarValues={values}
            values={groupValues}
            disabled={generating}
            errors={rowErrors}
            groupErrors={validation.groupErrors}
            onOptionsStateChange={setGroupOptionsState}
            onChange={handleGroupChange}
          />
          {validation.formError && <p className="text-sm text-destructive">{validation.formError}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={!validation.valid || !optionsReady || generating} onClick={generate}>
              {generating || loadingOptions ? <Loader2 className="animate-spin" /> : <FileText />}
              {generating ? "Generando..." : generatedOnce ? "Regenerar reporte" : "Generar reporte"}
            </Button>
            {!validation.valid && <p className="text-sm text-muted-foreground">Completa los parámetros y renglones obligatorios con valores válidos.</p>}
          </div>
        </CardContent>
      </Card>

      {generationError && <ErrorAlert title="No se pudo generar el reporte" message={generationError} />}

      {execution != null && (
        <>
          <section id="ejecucion" className="scroll-mt-6">
            {isReportBuilderPreviewResponse(execution.payload) ? (
              <ReportBuilderPreviewTable preview={execution.payload} />
            ) : (
              <GenericReportViewer key={execution.id} report={report} parameters={execution.parameters} payload={execution.payload} />
            )}
          </section>
          <Card id="descargas" className="scroll-mt-6">
            <CardHeader><CardTitle>Descargar reporte</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">Excel y CSV se generan en el backend con exactamente los parámetros de esta vista previa.</p>
              <ReportDataDownloadButtons code={report.code} parameters={execution.parameters} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
