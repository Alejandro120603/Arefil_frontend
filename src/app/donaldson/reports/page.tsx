import Link from "next/link";
import { Plus } from "lucide-react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { ReportCatalogCards } from "@/components/reports/report-catalog-cards";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getUserErrorMessage } from "@/lib/api/errors";
import { listReportDefinitions } from "@/lib/api/report-catalog";
import type { ReportDefinition } from "@/types/api";

export const metadata = {
  title: "Reportes | Arefil",
};

export default async function ReportsPage() {
  let reports: ReportDefinition[] = [];
  let errorMessage: string | null = null;
  try {
    reports = (await listReportDefinitions()).filter((report) => report.enabled);
  } catch (error) {
    errorMessage = getUserErrorMessage(
      error,
      "No se pudo comunicar con el backend. Verifica que el servicio esté disponible e intenta de nuevo.",
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Donaldson" }, { label: "Reportes" }]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
          <p className="text-sm text-muted-foreground">
            Consulta los reportes habilitados y abre las acciones disponibles para cada definición.
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/administracion/reportes/nuevo" />}>
          <Plus /> Nuevo reporte
        </Button>
      </div>

      {errorMessage && <ErrorAlert title="No se pudo cargar el catálogo de reportes" message={errorMessage} />}

      {!errorMessage && reports.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No hay reportes habilitados para operación.
          </CardContent>
        </Card>
      )}

      {!errorMessage && reports.length > 0 && <ReportCatalogCards reports={reports} />}
    </div>
  );
}
