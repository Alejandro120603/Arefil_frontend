import Link from "next/link";
import { FileText, PencilRuler, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReportDefinition } from "@/types/api";

export function ReportCatalogCards({ reports }: { reports: ReportDefinition[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {reports.map((report) => {
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
                {report.enabled ? (
                  <>
                    <Button size="sm" nativeButton={false} render={<Link href={operationHref} />}><FileText /> Generar</Button>
                    <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/administracion/reportes/${encodeURIComponent(report.code)}`} />}>
                      <Settings /> Configurar
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" disabled><FileText /> Generar</Button>
                    <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/administracion/reportes/${encodeURIComponent(report.code)}`} />}>
                      <Settings /> Configurar
                    </Button>
                  </>
                )}
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/administracion/reportes/${encodeURIComponent(report.code)}/designer`} />}>
                  <PencilRuler /> Diseñar
                </Button>
              </div>
              {!report.enabled && (
                <p className="text-xs text-muted-foreground">
                  Este reporte está deshabilitado; puedes diseñarlo o configurarlo, pero no ejecutarlo.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
