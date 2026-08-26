"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { CircleCheck, Loader2 } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { ReportRuntimeParameters, initialRuntimeValues } from "@/components/reports/report-runtime-parameters";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { executeReport, getReportTemplate, previewReport, saveReportTemplate } from "@/lib/api/reports";
import { adaptReportDataset, ReportDatasetAdapterError } from "@/lib/reports/report-dataset";
import { validateRuntimeParameters } from "@/lib/reports/report-runtime";
import type { ReportDefinition } from "@/types/api";

function DesignerPlaceholder() {
  return (
    <div className="flex h-full min-h-[32rem] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Cargando Designer de Stimulsoft...
    </div>
  );
}

const StimulsoftReportDesigner = dynamic(() => import("@/components/reports/stimulsoft-report-designer"), {
  ssr: false,
  loading: DesignerPlaceholder,
});

interface TemplateLoadState {
  code: string;
  template: string | null;
  error: string | null;
}

interface SaveState {
  status: "idle" | "saving" | "success" | "error";
  message: string | null;
}

class PreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreviewError";
  }
}

export function ReportDesignerWorkspace({ reportDefinition }: { reportDefinition: ReportDefinition }) {
  const { code } = reportDefinition;
  const sqlPreview = reportDefinition.data_source_type === "SQL_QUERY";
  const [loadState, setLoadState] = useState<TemplateLoadState | null>(null);
  const [activeVersion, setActiveVersion] = useState(reportDefinition.active_template_version);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle", message: null });
  const [runtimeValues, setRuntimeValues] = useState<Record<string, string | boolean>>(
    () => initialRuntimeValues(reportDefinition.parameters),
  );
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [designerError, setDesignerError] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const savingRef = useRef(false);
  const currentLoad = loadState?.code === code ? loadState : null;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const template = await getReportTemplate(code, { signal: controller.signal });
        if (!controller.signal.aborted) setLoadState({ code, template, error: null });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 404) {
          setLoadState({ code, template: null, error: null });
          return;
        }
        setLoadState({
          code,
          template: null,
          error: getUserErrorMessage(error, "No se pudo cargar la plantilla desde el backend. Verifica que el servicio esté disponible."),
        });
      }
    }
    void load();
    return () => controller.abort();
  }, [code]);

  const handleSaveTemplate = useCallback(
    async (template: string) => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaveState({ status: "saving", message: "Guardando la plantilla..." });
      try {
        const result = await saveReportTemplate(code, template);
        setActiveVersion(result.version);
        setSaveState({
          status: "success",
          message: `Plantilla guardada correctamente como versión ${result.version}.`,
        });
      } catch (error) {
        setSaveState({
          status: "error",
          message: getUserErrorMessage(
            error,
            "No se pudo guardar la plantilla. El backend no confirmó ningún cambio.",
          ),
        });
      } finally {
        savingRef.current = false;
      }
    },
    [code],
  );

  const loadPreviewData = useCallback(async (): Promise<unknown> => {
    setIsLoadingPreview(true);
    setPreviewMessage(null);
    setPreviewError(null);
    try {
      const validation = validateRuntimeParameters(code, reportDefinition.parameters, runtimeValues);
      if (!validation.valid) {
        throw new PreviewError(
          validation.formError ?? Object.values(validation.fieldErrors)[0] ?? "Completa los parámetros del Preview.",
        );
      }
      if (sqlPreview) {
        const result = await previewReport(code, validation.parameters);
        setPreviewMessage(`Preview cargado: ${result.row_count} filas${result.truncated ? " (limitado)" : ""}.`);
        return adaptReportDataset(reportDefinition, validation.parameters, result).data;
      }
      const result = await executeReport(code, validation.parameters);
      setPreviewMessage("Datos de Preview cargados desde Arefil.");
      return adaptReportDataset(reportDefinition, validation.parameters, result).data;
    } catch (error) {
      throw new PreviewError(
        error instanceof PreviewError || error instanceof ReportDatasetAdapterError
          ? error.message
          : getUserErrorMessage(error, "No se pudieron cargar los datos para previsualizar el reporte."),
      );
    } finally {
      setIsLoadingPreview(false);
    }
  }, [code, reportDefinition, runtimeValues, sqlPreview]);

  const handleEventError = useCallback((error: unknown) => {
    if (error instanceof PreviewError) {
      setPreviewError(error.message);
      return;
    }
    setDesignerError("Stimulsoft no pudo procesar la plantilla. Recarga la página e intenta de nuevo.");
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Datos para Preview</p>
              <p className="text-xs text-muted-foreground">
                El Designer solicitará datos controlados al backend al abrir la pestaña Preview.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Versión activa: <span className="font-medium text-foreground">{activeVersion ?? "Sin plantilla"}</span>
            </p>
          </div>

          <ReportRuntimeParameters
            code={code}
            parameters={reportDefinition.parameters}
            values={runtimeValues}
            disabled={isLoadingPreview}
            onChange={(name, value) => {
              setRuntimeValues((current) => ({ ...current, [name]: value }));
              setPreviewMessage(null);
              setPreviewError(null);
            }}
          />

          {isLoadingPreview && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando datos de preview...
            </p>
          )}
          {previewMessage && <p className="text-sm text-muted-foreground">{previewMessage}</p>}
          {previewError && <ErrorAlert title="No se pudo abrir el Preview" message={previewError} />}
        </CardContent>
      </Card>

      {saveState.status === "success" && saveState.message && (
        <Alert>
          <CircleCheck />
          <AlertTitle>Plantilla guardada</AlertTitle>
          <AlertDescription>{saveState.message}</AlertDescription>
        </Alert>
      )}
      {saveState.status === "saving" && (
        <Alert>
          <Loader2 className="animate-spin" />
          <AlertTitle>Guardando</AlertTitle>
          <AlertDescription>No cierres esta página hasta recibir confirmación del backend.</AlertDescription>
        </Alert>
      )}
      {saveState.status === "error" && saveState.message && (
        <ErrorAlert title="No se guardó la plantilla" message={saveState.message} />
      )}
      {designerError && <ErrorAlert title="Error del Designer" message={designerError} />}
      {currentLoad?.error && <ErrorAlert title="No se pudo abrir el Designer" message={currentLoad.error} />}

      {currentLoad == null && <DesignerPlaceholder />}
      {currentLoad != null && currentLoad.error == null && (
        <div className="h-[calc(100dvh-17rem)] min-h-[42rem] overflow-hidden rounded-xl border bg-card [&>div]:h-full">
          <StimulsoftReportDesigner
            designerId={`arefil-designer-${code.toLowerCase().replaceAll("_", "-")}`}
            template={currentLoad.template}
            onSaveTemplate={handleSaveTemplate}
            loadPreviewData={loadPreviewData}
            onEventError={handleEventError}
          />
        </div>
      )}
    </div>
  );
}
