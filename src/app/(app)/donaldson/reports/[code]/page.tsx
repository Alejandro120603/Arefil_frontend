import Link from "next/link";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { GenericReportRuntime } from "@/components/reports/generic-report-runtime";
import { Button } from "@/components/ui/button";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { getReportBuilderDefinition, getRuntimeReportDefinition } from "@/lib/api/report-catalog";
import { normalizeSummaries } from "@/lib/reports/report-builder";
import { PRICE_LIST_COMPARISON_CODE } from "@/lib/reports/report-constants";
import type { ReportColumn, ReportRuntimeDefinition, ReportSummaryConfiguration } from "@/types/api";

interface ReportOperationPageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function positiveId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function ReportOperationPage({ params, searchParams }: ReportOperationPageProps) {
  const { code } = await params;
  const query = await searchParams;
  let report: ReportRuntimeDefinition | null = null;
  let summaries: ReportSummaryConfiguration[] = [];
  let columns: ReportColumn[] = [];
  let errorTitle: string | null = null;
  let errorMessage: string | null = null;
  try {
    report = await getRuntimeReportDefinition(code);
    if (!report.enabled) {
      errorTitle = "Reporte no disponible";
      errorMessage = "Este reporte está deshabilitado y no puede utilizarse en este momento.";
    } else if (!report.ready) {
      errorTitle = "Reporte temporalmente no disponible";
      errorMessage = "Este reporte requiere atención antes de poder utilizarse. Intenta nuevamente más tarde o contacta al administrador.";
    }
  } catch (error) {
    errorTitle = "No se pudo abrir el reporte";
    errorMessage = getUserErrorMessage(error, error instanceof ApiError && error.status === 404 ? "El reporte solicitado no existe." : "No se pudo cargar el reporte.");
  }
  if (report != null && !errorMessage) {
    try {
      // Labels and the line-amount estimate only: a report with no builder still runs.
      const builder = await getReportBuilderDefinition(code);
      summaries = normalizeSummaries(builder.excel_layout?.totals ?? [], builder.columns);
      columns = builder.columns;
    } catch {
      summaries = [];
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Donaldson" }, { label: "Reportes", href: "/donaldson/reports" }, { label: report?.name ?? code }]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{report?.name ?? "Reporte"}</h1>
          <p className="text-sm text-muted-foreground">{report?.description ?? code}</p>
        </div>
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/donaldson/reports" />}>
          Volver al catálogo
        </Button>
      </div>
      {errorMessage && <ErrorAlert title={errorTitle ?? "No se pudo abrir el reporte"} message={errorMessage} />}
      {report != null && !errorMessage && (
        <GenericReportRuntime
          report={report}
          summaries={summaries}
          columns={columns}
          initialParameters={code === PRICE_LIST_COMPARISON_CODE ? {
            price_list_a_id: positiveId(query.price_list_a_id ?? query.a),
            price_list_b_id: positiveId(query.price_list_b_id ?? query.b),
          } : undefined}
        />
      )}
    </div>
  );
}
