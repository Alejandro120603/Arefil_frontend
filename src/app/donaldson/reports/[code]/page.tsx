import Link from "next/link";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PriceListComparison } from "@/components/donaldson/price-list-comparison";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { listAllPriceLists } from "@/lib/api/price-lists";
import { getReportDefinition } from "@/lib/api/report-catalog";
import { PRICE_LIST_COMPARISON_CODE } from "@/lib/reports/report-constants";
import type { PriceList, ReportDefinition } from "@/types/api";

interface ReportOperationPageProps { params: Promise<{ code: string }> }

export default async function ReportOperationPage({ params }: ReportOperationPageProps) {
  const { code } = await params;
  let report: ReportDefinition | null = null;
  let priceLists: PriceList[] = [];
  let errorMessage: string | null = null;
  try {
    report = await getReportDefinition(code);
    if (!report.enabled) errorMessage = "Este reporte está deshabilitado y no puede ejecutarse.";
    if (report.code === PRICE_LIST_COMPARISON_CODE && report.enabled) priceLists = await listAllPriceLists();
  } catch (error) {
    errorMessage = getUserErrorMessage(error, error instanceof ApiError && error.status === 404 ? "El reporte solicitado no existe." : "No se pudo cargar el reporte.");
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "Dashboard", href: "/" }, { label: "Donaldson" }, { label: "Reportes", href: "/donaldson/reports" }, { label: report?.name ?? code }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{report?.name ?? "Reporte"}</h1>
        <p className="text-sm text-muted-foreground">{report?.description ?? code}</p>
      </div>
      {errorMessage && <ErrorAlert title="No se pudo abrir el reporte" message={errorMessage} />}
      {report?.code === PRICE_LIST_COMPARISON_CODE && !errorMessage && priceLists.length < 2 && (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
          Se necesitan al menos dos listas de precios importadas para ejecutar esta comparación.
        </CardContent></Card>
      )}
      {report?.code === PRICE_LIST_COMPARISON_CODE && !errorMessage && priceLists.length >= 2 && <PriceListComparison priceLists={priceLists} />}
      {report != null && report.code !== PRICE_LIST_COMPARISON_CODE && !errorMessage && (
        <Card><CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <p className="text-sm text-muted-foreground">La ejecución genérica de este reporte se incorporará en Frontend #12.</p>
          <Button size="sm" nativeButton={false} render={<Link href="/donaldson/reports" />}>Volver al catálogo</Button>
        </CardContent></Card>
      )}
    </div>
  );
}
