import Link from "next/link";
import { Download, Eye, PencilRuler, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PRICE_LIST_COMPARISON_CODE } from "@/lib/reports/report-constants";
import type { ReportDefinition } from "@/types/api";

export function ReportCatalogCards({ reports }: { reports: ReportDefinition[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {reports.map((report) => {
        const supportsOperation = report.code === PRICE_LIST_COMPARISON_CODE;
        const operationHref = `/donaldson/reports/${encodeURIComponent(report.code)}`;
        return (
          <Card key={report.code}>
            <CardHeader className="gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle>{report.name}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">{report.description ?? "Sin descripción"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {report.category && <Badge variant="outline">{report.category}</Badge>}
                  <Badge variant={report.active_template_version == null ? "outline" : "secondary"}>
                    {report.active_template_version == null ? "Sin plantilla" : `Template v${report.active_template_version}`}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {supportsOperation && (
                  <>
                    <Button size="sm" nativeButton={false} render={<Link href={operationHref} />}><Eye /> Ver</Button>
                    <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`${operationHref}#ejecucion`} />}>
                      <Download /> Descargar datos
                    </Button>
                  </>
                )}
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/administracion/reportes/${encodeURIComponent(report.code)}/designer`} />}>
                  <PencilRuler /> Diseñar
                </Button>
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/administracion/reportes/${encodeURIComponent(report.code)}`} />}>
                  <Settings /> Configurar
                </Button>
              </div>
              {!supportsOperation && (
                <p className="text-xs text-muted-foreground">
                  La ejecución y descarga genéricas de este reporte se habilitarán con el Runner de Frontend #12.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
