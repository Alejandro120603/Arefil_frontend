import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { ReportBuilderWorkspace } from "@/components/reports/report-builder-workspace";
import { ReportDefinitionForm } from "@/components/reports/report-definition-form";
import { ReportExcelTemplateCard } from "@/components/reports/report-excel-template-card";
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
        <p className="text-sm text-muted-foreground">Edita metadata, parámetros, columnas, fórmulas, formato Excel y la plantilla Excel del documento usando el contrato administrativo.</p>
      </div>
      {errorMessage && <ErrorAlert title="No se pudo abrir la configuración" message={errorMessage} />}
      {report && (
        <>
          <ReportDefinitionForm report={report} />
          {/* The builder edits the *saved* parameters: a PARAMETER column or a
              formula reference the backend has not persisted yet would be
              rejected on save. Editing parameters above and saving refreshes
              this server component with the new list. */}
          <ReportBuilderWorkspace
            code={report.code}
            parameters={report.parameters}
            dataSourceCapabilities={report.data_source.capabilities}
          />
          {/* The document layer is independent of the builder: the Excel
              template can be uploaded, replaced or removed without touching
              columns or formulas, and a report with no template still runs and
              exports data. */}
          <ReportExcelTemplateCard code={report.code} parameters={report.parameters} />
        </>
      )}
    </div>
  );
}
