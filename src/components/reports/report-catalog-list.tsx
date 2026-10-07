import Link from "next/link";
import { FileText, Settings } from "lucide-react";
import { EnabledBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ReportDefinition } from "@/types/api";

/**
 * Compact tabular catalogue. Reports share one structure, so a list scales from
 * 5 to 50+ definitions and stays scannable, where a two-column card grid does
 * not. `Generar` is the primary action per row; `Configurar` stays visible
 * because it is the only way into the administrative surface from here.
 */
export function ReportCatalogList({ reports, canConfigure }: { reports: ReportDefinition[]; canConfigure: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-full">Reporte</TableHead>
          <TableHead>Categoría</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reports.map((report) => {
          const operationHref = `/donaldson/reports/${encodeURIComponent(report.code)}`;
          const configureHref = `/administracion/reportes/${encodeURIComponent(report.code)}/configurar`;
          return (
            <TableRow key={report.code}>
              <TableCell className="min-w-72 max-w-[46rem] whitespace-normal align-top">
                <div className="flex flex-col gap-0.5 py-0.5">
                  <span className="font-medium">{report.name}</span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {report.description ?? "Sin descripción"}
                  </span>
                  {!report.enabled && (
                    <span className="text-xs text-muted-foreground">
                      {canConfigure
                        ? "Este reporte está deshabilitado; puedes configurarlo, pero no ejecutarlo."
                        : "Este reporte está deshabilitado."}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="align-top">
                {report.category ? <Badge variant="outline">{report.category}</Badge> : <span className="text-muted-foreground">—</span>}
              </TableCell>
              <TableCell className="align-top">
                <EnabledBadge enabled={report.enabled} />
              </TableCell>
              <TableCell className="align-top text-right">
                <div className="flex justify-end gap-2">
                  {report.enabled ? (
                    <Button size="sm" nativeButton={false} render={<Link href={operationHref} />}>
                      <FileText /> Generar
                    </Button>
                  ) : (
                    <Button size="sm" disabled>
                      <FileText /> Generar
                    </Button>
                  )}
                  {canConfigure && (
                    <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={configureHref} />}>
                      <Settings /> Configurar
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
