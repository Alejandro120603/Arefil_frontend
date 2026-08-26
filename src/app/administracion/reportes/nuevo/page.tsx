import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ReportDefinitionForm } from "@/components/reports/report-definition-form";

export const metadata = { title: "Nuevo reporte | Arefil" };

export default function NewReportPage() {
  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Administración" }, { label: "Reportes", href: "/administracion/reportes" }, { label: "Nuevo" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo reporte</h1>
        <p className="text-sm text-muted-foreground">Crea una definición transaccional con su fuente de datos y parámetros.</p>
      </div>
      <ReportDefinitionForm />
    </div>
  );
}
