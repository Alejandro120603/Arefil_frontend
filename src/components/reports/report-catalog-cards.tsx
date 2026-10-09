import Link from "next/link";
import { FileText, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReportRuntimeCatalogItem } from "@/types/api";

type ReportCard = Omit<ReportRuntimeCatalogItem, "ready">;

/** `canConfigure` comes from the server-side session; the backend still answers 403 without it. */
export function ReportCatalogCards({ reports, canConfigure }: { reports: ReportCard[]; canConfigure: boolean }) {
  const configureHref = (code: string) => `/administracion/reportes/${encodeURIComponent(code)}/configurar`;
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
                {report.category && <Badge variant="outline">{report.category}</Badge>}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {report.enabled ? (
                  <>
                    <Button size="sm" nativeButton={false} render={<Link href={operationHref} />}><FileText /> Generar</Button>
                    {canConfigure && (
                      <Button size="sm" variant="outline" nativeButton={false} render={<Link href={configureHref(report.code)} />}>
                        <Settings /> Configurar
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Button size="sm" disabled><FileText /> Generar</Button>
                    {canConfigure && (
                      <Button size="sm" variant="outline" nativeButton={false} render={<Link href={configureHref(report.code)} />}>
                        <Settings /> Configurar
                      </Button>
                    )}
                  </>
                )}
              </div>
              {!report.enabled && (
                <p className="text-xs text-muted-foreground">
                  {canConfigure
                    ? "Este reporte está deshabilitado; puedes configurarlo, pero no ejecutarlo."
                    : "Este reporte está deshabilitado."}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
