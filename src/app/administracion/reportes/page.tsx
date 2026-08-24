import Link from "next/link";
import { PencilRuler } from "lucide-react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getUserErrorMessage } from "@/lib/api/errors";
import { listReportDefinitions } from "@/lib/api/report-catalog";
import type { ReportDefinition } from "@/types/api";

export const metadata = {
  title: "Administración de reportes | Arefil",
};

export default async function AdminReportsPage() {
  let reports: ReportDefinition[] = [];
  let errorMessage: string | null = null;
  try {
    reports = await listReportDefinitions();
  } catch (error) {
    errorMessage = getUserErrorMessage(
      error,
      "No se pudo cargar el catálogo de reportes. Verifica que el backend esté disponible.",
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/" }, { label: "Administración" }, { label: "Reportes" }]}
      />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Administración de reportes</h1>
        <p className="text-sm text-muted-foreground">
          Catálogo y plantillas de presentación administradas por Arefil.
        </p>
      </div>

      {errorMessage && <ErrorAlert title="No se pudo cargar el catálogo" message={errorMessage} />}

      {!errorMessage && reports.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No hay reportes registrados en el backend.
          </CardContent>
        </Card>
      )}

      {!errorMessage && reports.length > 0 && (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reporte</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.code}>
                    <TableCell className="min-w-64 whitespace-normal">
                      <p className="font-medium">{report.name}</p>
                      <p className="text-xs text-muted-foreground">{report.description ?? "Sin descripción"}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{report.code}</TableCell>
                    <TableCell>{report.category ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={report.enabled ? "secondary" : "outline"}>
                        {report.enabled ? "Habilitado" : "Deshabilitado"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {report.active_template_version == null ? "Sin plantilla" : `Versión ${report.active_template_version}`}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        nativeButton={false}
                        render={<Link href={`/administracion/reportes/${encodeURIComponent(report.code)}/designer`} />}
                      >
                        <PencilRuler /> Diseñar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
