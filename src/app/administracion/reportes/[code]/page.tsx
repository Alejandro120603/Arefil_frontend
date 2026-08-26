import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { ReportDefinitionForm } from "@/components/reports/report-definition-form";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { getAdminReportDefinition } from "@/lib/api/report-catalog";
import type { ReportAdminDefinition } from "@/types/api";

export const metadata = { title: "Configurar reporte | Arefil" };

interface ConfigureReportPageProps { params: Promise<{ code: string }> }

export default async function ConfigureReportPage({ params }: ConfigureReportPageProps) {
  const { code } = await params;
  let report: ReportAdminDefinition | null = null;
  let errorMessage: string | null = null;
  try {
    report = await getAdminReportDefinition(code);
  } catch (error) {
    errorMessage = getUserErrorMessage(error, error instanceof ApiError && error.status === 404 ? "El reporte solicitado no existe." : "No se pudo cargar la configuración del reporte.");
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Administración" }, { label: "Reportes", href: "/administracion/reportes" }, { label: report?.name ?? code }, { label: "Configurar" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{report ? `Configurar ${report.name}` : "Configurar reporte"}</h1>
        <p className="text-sm text-muted-foreground">Edita metadata, datasource y parámetros usando el contrato administrativo.</p>
      </div>
      {errorMessage && <ErrorAlert title="No se pudo abrir la configuración" message={errorMessage} />}
      {report && <ReportDefinitionForm report={report} />}
    </div>
  );
}
