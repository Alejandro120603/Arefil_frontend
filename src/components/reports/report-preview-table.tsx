import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ReportPreviewResponse } from "@/types/api";

function displayValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function ReportPreviewTable({ preview }: { preview: ReportPreviewResponse }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Muestra de datos</p>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{preview.row_count} filas</Badge>
            <Badge variant="secondary">Preview limitado{preview.truncated ? " · truncado" : ""}</Badge>
          </div>
        </div>
        {preview.rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">La consulta no devolvió filas de muestra.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>{preview.columns.map((column) => <TableHead key={column}>{column}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {preview.rows.map((row, index) => (
                <TableRow key={index}>
                  {preview.columns.map((column) => <TableCell key={column}>{displayValue(row[column])}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground">
          Que el preview devuelva filas no garantiza por sí solo que el reporte final sea correcto.
        </p>
      </CardContent>
    </Card>
  );
}
