"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, PencilRuler } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { ReportPreviewTable } from "@/components/reports/report-preview-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { executeReport, getReportTemplate } from "@/lib/api/reports";
import {
  adaptReportDataset,
  getSQLExecutionPayload,
  ReportDatasetAdapterError,
  type AdaptedReportDataset,
} from "@/lib/reports/report-dataset";
import { AREFIL_DATA_SOURCE_NAME } from "@/lib/reports/stimulsoft-dataset";
import type { ReportDefinition } from "@/types/api";

const PREVIEW_ROW_LIMIT = 100;

function ViewerPlaceholder({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[20rem] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> {message}
    </div>
  );
}

const StimulsoftReportViewer = dynamic(() => import("@/components/reports/stimulsoft-report-viewer"), {
  ssr: false,
  loading: () => <ViewerPlaceholder message="Cargando visor de reportes..." />,
});

interface RuntimeLoadState {
  key: string;
  payload: unknown | null;
  adapted: AdaptedReportDataset | null;
  template: string | null;
  error: string | null;
  templateError: string | null;
  viewerError: string | null;
}

export function GenericReportViewer({
  report,
  parameters,
}: {
  report: ReportDefinition;
  parameters: Record<string, unknown>;
}) {
  const key = JSON.stringify(parameters);
  const [state, setState] = useState<RuntimeLoadState | null>(null);
  const current = state?.key === key ? state : null;

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      const templatePromise = report.active_template_version == null
        ? Promise.resolve<string | null>(null)
        : getReportTemplate(report.code, { signal: controller.signal });
      const [executionResult, templateResult] = await Promise.allSettled([
        executeReport(report.code, parameters, { signal: controller.signal }),
        templatePromise,
      ]);
      if (controller.signal.aborted) return;

      if (executionResult.status === "rejected") {
        setState({
          key,
          payload: null,
          adapted: null,
          template: null,
          error: getUserErrorMessage(executionResult.reason, "No se pudieron generar los datos del reporte."),
          templateError: null,
          viewerError: null,
        });
        return;
      }

      let adapted: AdaptedReportDataset;
      try {
        adapted = adaptReportDataset(report, parameters, executionResult.value);
      } catch (error) {
        setState({
          key,
          payload: executionResult.value,
          adapted: null,
          template: null,
          error: error instanceof ReportDatasetAdapterError
            ? error.message
            : "No se pudo preparar el dataset para Stimulsoft.",
          templateError: null,
          viewerError: null,
        });
        return;
      }

      const templateNotFound = templateResult.status === "rejected" &&
        templateResult.reason instanceof ApiError && templateResult.reason.status === 404;
      const templateError = templateResult.status === "rejected" && !templateNotFound
        ? getUserErrorMessage(templateResult.reason, "No se pudo cargar la plantilla activa del reporte.")
        : null;

      setState({
        key,
        payload: executionResult.value,
        adapted,
        template: templateResult.status === "fulfilled" ? templateResult.value : null,
        error: null,
        templateError: templateError ?? (templateNotFound
          ? "La definición indica una plantilla activa, pero el backend no pudo encontrarla."
          : null),
        viewerError: null,
      });
    }

    void load();
    return () => controller.abort();
  }, [key, parameters, report]);

  const handleViewerError = useCallback(() => {
    setState((value) => value?.key === key
      ? { ...value, viewerError: "Stimulsoft no pudo abrir la plantilla o registrar el dataset." }
      : value);
  }, [key]);

  if (current == null) {
    return (
      <div className="h-[calc(100dvh-18rem)] min-h-[28rem] overflow-hidden rounded-xl border bg-card [&>div]:h-full">
        <ViewerPlaceholder message="Generando el reporte..." />
      </div>
    );
  }

  if (current.error) return <ErrorAlert title="No se pudo generar el reporte" message={current.error} />;

  const sqlPayload = getSQLExecutionPayload(current.payload);
  const noTemplate = current.template == null && current.templateError == null;

  return (
    <div className="flex flex-col gap-4">
      {current.templateError && <ErrorAlert title="No se pudo cargar la plantilla" message={current.templateError} />}
      {current.viewerError && <ErrorAlert title="No se pudo abrir el Viewer" message={current.viewerError} />}

      {current.adapted?.rowCount === 0 && (
        <Card><CardContent className="py-4 text-sm text-muted-foreground">
          El reporte se ejecutó correctamente, pero el dataset no contiene filas.
        </CardContent></Card>
      )}

      {noTemplate && (
        <Alert>
          <PencilRuler />
          <AlertTitle>Datos disponibles · Diseño pendiente</AlertTitle>
          <AlertDescription>
            El reporte puede descargarse, pero necesita una plantilla antes de abrirse en el Viewer.{" "}
            <Link href={`/administracion/reportes/${encodeURIComponent(report.code)}/designer`}>Diseñar plantilla</Link>
          </AlertDescription>
        </Alert>
      )}

      {noTemplate && sqlPayload && (
        <ReportPreviewTable
          title="Vista previa de los datos disponibles"
          preview={{
            columns: sqlPayload.columns,
            rows: sqlPayload.rows.slice(0, PREVIEW_ROW_LIMIT),
            row_count: sqlPayload.row_count,
            truncated: sqlPayload.rows.length > PREVIEW_ROW_LIMIT,
          }}
          note={`Se muestran como máximo ${PREVIEW_ROW_LIMIT} filas; las descargas las genera el backend con el dataset completo.`}
        />
      )}

      {current.template != null && current.adapted != null && current.viewerError == null && (
        <div className="h-[calc(100dvh-18rem)] min-h-[28rem] overflow-hidden rounded-xl border bg-card [&>div]:h-full">
          <StimulsoftReportViewer
            template={current.template}
            data={current.adapted.data}
            dataSourceName={AREFIL_DATA_SOURCE_NAME}
            onError={handleViewerError}
          />
        </div>
      )}

      {current.templateError && (
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/administracion/reportes/${encodeURIComponent(report.code)}/designer`} />}>
          <PencilRuler /> Abrir Designer
        </Button>
      )}
    </div>
  );
}
