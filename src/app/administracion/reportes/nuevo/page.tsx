import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ReportConfigurationWizard } from "@/components/reports/report-configuration-wizard";

export const metadata = { title: "Nuevo reporte | Arefil" };

export default function NewReportPage() {
  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Administración" }, { label: "Reportes", href: "/administracion/reportes" }, { label: "Nuevo" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo reporte</h1>
        <p className="text-sm text-muted-foreground">
          Un paso a la vez: información, fuente, datos del reporte, plantilla Excel, mapeo visual y vista previa.
        </p>
      </div>
      <ReportConfigurationWizard report={null} initialStepParam={null} />
    </div>
  );
}
