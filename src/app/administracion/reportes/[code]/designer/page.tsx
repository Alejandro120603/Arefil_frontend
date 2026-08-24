import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { ReportDesignerWorkspace } from "@/components/reports/report-designer-workspace";
import { Button } from "@/components/ui/button";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { listAllPriceLists } from "@/lib/api/price-lists";
import { getReportDefinition } from "@/lib/api/report-catalog";
import { PRICE_LIST_COMPARISON_REPORT_CODE } from "@/lib/reports/stimulsoft-dataset";
import type { PriceList, ReportDefinition } from "@/types/api";

export const metadata = {
  title: "Diseñador de reportes | Arefil",
};

interface DesignerPageProps {
  params: Promise<{ code: string }>;
}

export default async function ReportDesignerPage({ params }: DesignerPageProps) {
  const { code } = await params;
  let report: ReportDefinition | null = null;
  let reportError: string | null = null;
  let priceLists: PriceList[] = [];
  let previewError: string | null = null;

  try {
    report = await getReportDefinition(code);
  } catch (error) {
    reportError = getUserErrorMessage(
      error,
      error instanceof ApiError && error.status === 404
        ? "El reporte solicitado no existe."
        : "No se pudo consultar la definición del reporte.",
    );
  }

  if (report?.code === PRICE_LIST_COMPARISON_REPORT_CODE) {
    try {
      priceLists = await listAllPriceLists();
    } catch (error) {
      previewError = getUserErrorMessage(
        error,
        "No se pudieron cargar las listas para Preview. La edición y el guardado siguen disponibles.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/" },
          { label: "Administración" },
          { label: "Reportes", href: "/administracion/reportes" },
          { label: report?.name ?? code },
          { label: "Diseñador" },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{report?.name ?? "Diseñador de reportes"}</h1>
          <p className="text-sm text-muted-foreground">{code} · Stimulsoft Designer</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link href="/administracion/reportes" />}
        >
          <ArrowLeft /> Volver al catálogo
        </Button>
      </div>

      {reportError && <ErrorAlert title="No se pudo abrir el reporte" message={reportError} />}
      {previewError && <ErrorAlert title="Preview no disponible" message={previewError} />}
      {report != null && <ReportDesignerWorkspace reportDefinition={report} priceLists={priceLists} />}
    </div>
  );
}
