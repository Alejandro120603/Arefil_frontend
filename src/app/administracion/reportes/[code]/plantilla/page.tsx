import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { ReportExcelTemplateInspector } from "@/components/reports/report-excel-template-inspector";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { getAdminReportDefinition } from "@/lib/api/report-catalog";
import type { ReportAdminDefinition } from "@/types/api";

export const metadata = { title: "Editor visual de plantilla | Arefil" };

interface VisualTemplatePageProps { params: Promise<{ code: string }> }

export default async function VisualTemplatePage({ params }: VisualTemplatePageProps) {
  const { code } = await params;
  let report: ReportAdminDefinition | null = null;
  let errorMessage: string | null = null;
  try {
    report = await getAdminReportDefinition(code);
  } catch (error) {
    errorMessage = getUserErrorMessage(
      error,
      error instanceof ApiError && error.status === 404 ? "El reporte solicitado no existe." : "No se pudo cargar el reporte.",
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/" },
          { label: "Administración" },
          { label: "Reportes", href: "/administracion/reportes" },
          { label: report?.name ?? code, href: `/administracion/reportes/${encodeURIComponent(code)}` },
          { label: "Editor visual" },
        ]}
      />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {report ? `Plantilla de ${report.name}` : "Editor visual de plantilla"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Ubica una celda de la plantilla Excel activa para saber dónde colocar cada campo, sin abrir Excel.
        </p>
      </div>
      {errorMessage && <ErrorAlert title="No se pudo abrir el editor visual" message={errorMessage} />}
      {report && <ReportExcelTemplateInspector code={report.code} />}
    </div>
  );
}
