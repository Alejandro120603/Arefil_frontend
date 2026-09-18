import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { ReportConfigurationWizard } from "@/components/reports/report-configuration-wizard";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { getAdminReportDefinition } from "@/lib/api/report-catalog";
import type { ReportAdminDefinition } from "@/types/api";

export const metadata = { title: "Configurar reporte | Arefil" };

interface ConfigureReportWizardPageProps {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ step?: string }>;
}

export default async function ConfigureReportWizardPage({ params, searchParams }: ConfigureReportWizardPageProps) {
  const { code } = await params;
  const { step } = await searchParams;
  const initialStepParam = step ? Number.parseInt(step, 10) : null;

  let report: ReportAdminDefinition | null = null;
  let errorMessage: string | null = null;
  try {
    report = await getAdminReportDefinition(code);
  } catch (error) {
    errorMessage = getUserErrorMessage(
      error,
      error instanceof ApiError && error.status === 404 ? "El reporte solicitado no existe." : "No se pudo cargar la configuración del reporte.",
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/" },
          { label: "Administración" },
          { label: "Reportes", href: "/administracion/reportes" },
          { label: report?.name ?? code },
          { label: "Configurar" },
        ]}
      />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{report ? `Configurar ${report.name}` : "Configurar reporte"}</h1>
        <p className="text-sm text-muted-foreground">
          Un paso a la vez: información, fuente, datos del reporte, plantilla Excel, mapeo visual y vista previa.
        </p>
      </div>
      {errorMessage && <ErrorAlert title="No se pudo abrir la configuración" message={errorMessage} />}
      {report && (
        <ReportConfigurationWizard
          report={report}
          initialStepParam={Number.isFinite(initialStepParam) && initialStepParam ? initialStepParam : null}
        />
      )}
    </div>
  );
}
