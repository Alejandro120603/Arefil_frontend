import Link from "next/link";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { GenericReportRuntime } from "@/components/reports/generic-report-runtime";
import { Button } from "@/components/ui/button";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { getReportDefinition } from "@/lib/api/report-catalog";
import type { ReportDefinition } from "@/types/api";

interface ReportOperationPageProps { params: Promise<{ code: string }> }

export default async function ReportOperationPage({ params }: ReportOperationPageProps) {
  const { code } = await params;
  let report: ReportDefinition | null = null;
  let errorMessage: string | null = null;
  try {
    report = await getReportDefinition(code);
    if (!report.enabled) errorMessage = "Este reporte está deshabilitado y no puede ejecutarse.";
  } catch (error) {
    errorMessage = getUserErrorMessage(error, error instanceof ApiError && error.status === 404 ? "El reporte solicitado no existe." : "No se pudo cargar el reporte.");
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
      {errorMessage && <ErrorAlert title="No se pudo abrir el reporte" message={errorMessage} />}
      {report != null && !errorMessage && <GenericReportRuntime report={report} />}
    </div>
  );
}
