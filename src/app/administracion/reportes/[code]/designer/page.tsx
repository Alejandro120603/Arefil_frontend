import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { ReportDesignerWorkspace } from "@/components/reports/report-designer-workspace";
import { Button } from "@/components/ui/button";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { getReportDefinition } from "@/lib/api/report-catalog";
import type { ReportDefinition } from "@/types/api";

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
      {report != null && <ReportDesignerWorkspace reportDefinition={report} />}
    </div>
  );
}
