"use client";

/**
 * Client boundary around the Stimulsoft viewer for PRICE_LIST_COMPARISON.
 *
 * This component owns everything that has to happen before Stimulsoft can be
 * handed a report - resolving the comparison, downloading the `.mrt`, building
 * the dataset, and turning any failure into a message a user can act on - and
 * loads the viewer itself through `next/dynamic({ ssr: false })` so the ~14 MB
 * Stimulsoft bundle never reaches the server render or the initial page chunk.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getUserErrorMessage } from "@/lib/api/errors";
import { getPriceListComparison, getReportTemplate } from "@/lib/api/reports";
import { describeComparisonList } from "@/lib/reports/comparison";
import { readComparisonHandoff, type ViewerSelection } from "@/lib/reports/comparison-handoff";
import {
  AREFIL_DATA_SOURCE_NAME,
  PRICE_LIST_COMPARISON_REPORT_CODE,
  toArefilReportData,
  type ArefilReportData,
} from "@/lib/reports/stimulsoft-dataset";
import type { PriceListComparisonResponse } from "@/types/api";

const REPORTS_HREF = "/donaldson/reports";

const TEMPLATE_ERROR =
  "No se pudo cargar la plantilla activa del reporte desde el backend. Verifica el catálogo administrativo.";
const COMPARISON_ERROR = "No fue posible recuperar la comparación. Vuelve a Reportes y genérala de nuevo.";
const VIEWER_ERROR = "No fue posible inicializar el visor de reportes. Recarga la página e intenta de nuevo.";

function ViewerPlaceholder({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[20rem] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {message}
    </div>
  );
}

const StimulsoftReportViewer = dynamic(() => import("@/components/reports/stimulsoft-report-viewer"), {
  // Stimulsoft writes its toolbar and canvas straight into the DOM and reads
  // `window`/`document` while doing it, so there is nothing to prerender.
  ssr: false,
  loading: () => <ViewerPlaceholder message="Cargando visor de reportes..." />,
});

/** Distinguishes a missing/unreadable `.mrt` from a backend failure. */
class TemplateError extends Error {
  constructor() {
    super("template");
    this.name = "TemplateError";
  }
}

/**
 * The active `.mrt` is owned by Backend #10 and reached through the same-origin
 * proxy. There is intentionally no static fallback: it could hide a failed
 * save or show a stale template after a container recreation.
 */
async function fetchTemplate(signal: AbortSignal): Promise<string> {
  try {
    return await getReportTemplate(PRICE_LIST_COMPARISON_REPORT_CODE, { signal });
  } catch {
    throw new TemplateError();
  }
}

interface ReportPayload {
  comparison: PriceListComparisonResponse;
  template: string;
  data: ArefilReportData;
}

/**
 * Result of loading one specific A/B pair. Keying the state by the pair (rather
 * than resetting it when the ids change) is what keeps every `setState` inside
 * an async callback: a stale result simply stops matching `key` and is ignored.
 */
interface LoadState {
  key: string;
  payload: ReportPayload | null;
  error: string | null;
}

export function PriceListComparisonReport({ selection }: { selection: ViewerSelection }) {
  const { priceListAId, priceListBId } = selection;
  const key = `${priceListAId}:${priceListBId}`;
  const [state, setState] = useState<LoadState | null>(null);
  const current = state?.key === key ? state : null;

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        // Reuse the dataset the reports page already downloaded; the request
        // below only runs for a pasted or reloaded link, where nothing is cached.
        const cached = readComparisonHandoff({ priceListAId, priceListBId });
        const [template, comparison] = await Promise.all([
          fetchTemplate(controller.signal),
          cached ??
            getPriceListComparison(
              { price_list_a_id: priceListAId, price_list_b_id: priceListBId },
              { signal: controller.signal },
            ),
        ]);
        if (controller.signal.aborted) return;
        setState({ key, payload: { comparison, template, data: toArefilReportData(comparison) }, error: null });
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({
          key,
          payload: null,
          error: err instanceof TemplateError ? TEMPLATE_ERROR : getUserErrorMessage(err, COMPARISON_ERROR),
        });
      }
    }

    void load();
    return () => controller.abort();
  }, [key, priceListAId, priceListBId]);

  const handleViewerError = useCallback(() => {
    setState({ key, payload: null, error: VIEWER_ERROR });
  }, [key]);

  const payload = current?.payload ?? null;
  const error = current?.error ?? null;
  const heading =
    payload == null
      ? "Preparando el reporte..."
      : `${payload.comparison.supplier.name} · ${describeComparisonList(payload.comparison.list_a)} → ${describeComparisonList(payload.comparison.list_b)}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Comparación de listas de precios</h1>
          <p className="truncate text-sm text-muted-foreground">{heading}</p>
        </div>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={REPORTS_HREF} />}>
          <ArrowLeft />
          Volver a Reportes
        </Button>
      </div>

      {error && <ErrorAlert title="No se pudo abrir el reporte" message={error} />}

      {error == null && payload != null && payload.comparison.items.length === 0 && (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            Las listas seleccionadas no tienen productos para comparar; el reporte solo mostrará el resumen.
          </CardContent>
        </Card>
      )}

      {error == null && (
        // `StiViewer` sizes itself with `height: 100%`, so both this container
        // and the plain <div> the `Viewer` component renders need a definite
        // height - otherwise the canvas collapses to a ~40px strip. The viewer
        // brings its own scrollbars, hence `overflow-hidden` here.
        <div className="h-[calc(100dvh-13rem)] min-h-[28rem] overflow-hidden rounded-xl border bg-card [&>div]:h-full">
          {payload == null ? (
            <ViewerPlaceholder message="Generando el reporte..." />
          ) : (
            <StimulsoftReportViewer
              template={payload.template}
              data={payload.data}
              dataSourceName={AREFIL_DATA_SOURCE_NAME}
              onError={handleViewerError}
            />
          )}
        </div>
      )}
    </div>
  );
}
