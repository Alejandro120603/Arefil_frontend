"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { GenericReportViewer } from "@/components/reports/generic-report-viewer";
import { ReportDataDownloadButtons } from "@/components/reports/report-data-download-buttons";
import { ReportRuntimeParameters } from "@/components/reports/report-runtime-parameters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  initialRuntimeValues,
  validateRuntimeParameters,
  type RuntimeParameterValue,
} from "@/lib/reports/report-runtime";
import type { ReportDefinition } from "@/types/api";

export function GenericReportRuntime({ report }: { report: ReportDefinition }) {
  const [values, setValues] = useState(() => initialRuntimeValues(report.parameters));
  const [execution, setExecution] = useState<{ id: number; parameters: Record<string, unknown> } | null>(null);
  const executionIdRef = useRef(0);
  const [generatedOnce, setGeneratedOnce] = useState(false);
  const [optionsState, setOptionsState] = useState(() => ({
    loading: report.parameters.some((parameter) => parameter.input_type === "select"),
    ready: report.parameters.every((parameter) => parameter.input_type !== "select"),
  }));
  const validation = useMemo(
    () => validateRuntimeParameters(report.code, report.parameters, values),
    [report.code, report.parameters, values],
  );
  const handleOptionsStateChange = useCallback(
    (state: { loading: boolean; ready: boolean }) => setOptionsState(state),
    [],
  );

  function handleChange(name: string, value: RuntimeParameterValue) {
    setValues((current) => ({ ...current, [name]: value }));
    setExecution(null);
  }

  function generate() {
    if (!validation.valid || !optionsState.ready) return;
    executionIdRef.current += 1;
    setExecution({ id: executionIdRef.current, parameters: { ...validation.parameters } });
    setGeneratedOnce(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card id="parametros" className="scroll-mt-6">
        <CardHeader>
          <CardTitle>Parámetros del reporte</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ReportRuntimeParameters
            code={report.code}
            parameters={report.parameters}
            values={values}
            errors={validation.fieldErrors}
            onOptionsStateChange={handleOptionsStateChange}
            onChange={handleChange}
          />
          {validation.formError && <p className="text-sm text-destructive">{validation.formError}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={!validation.valid || !optionsState.ready} onClick={generate}>
              {optionsState.loading ? <Loader2 className="animate-spin" /> : <FileText />}
              {generatedOnce ? "Regenerar reporte" : "Generar reporte"}
            </Button>
            {!validation.valid && (
              <p className="text-sm text-muted-foreground">Completa los parámetros obligatorios con valores válidos.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card id="descargas" className="scroll-mt-6">
        <CardHeader><CardTitle>Descargar datos</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Excel y CSV se generan en el backend usando los parámetros actuales.
          </p>
          <ReportDataDownloadButtons
            code={report.code}
            parameters={validation.parameters}
            disabled={!validation.valid || !optionsState.ready}
          />
        </CardContent>
      </Card>

      {execution != null && (
        <section id="ejecucion" className="scroll-mt-6">
          <GenericReportViewer key={execution.id} report={report} parameters={execution.parameters} />
        </section>
      )}
    </div>
  );
}
