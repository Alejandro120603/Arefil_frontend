import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format/date";
import { formatCurrency, formatNumber, parseDecimal } from "@/lib/format/decimal";
import type { ReportBuilderPreviewColumn, ReportBuilderPreviewResponse } from "@/types/api";

/**
 * Renders `POST /reports/{code}/builder/preview` as the official web preview.
 *
 * Every numeric cell arrives as a Decimal *string* already computed by the
 * backend's formula engine — nothing here recalculates a monetary value, the
 * formatting below is presentation only.
 */
function formatCell(value: unknown, column: ReportBuilderPreviewColumn): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  const text = String(value);
  switch (column.format_type) {
    case "currency":
      return formatCurrency(text);
    case "number":
      return formatNumber(text);
    case "percent": {
      const parsed = parseDecimal(text);
      return parsed == null ? text : `${formatNumber(text)}%`;
    }
    case "date":
      return formatDate(text);
    case "datetime":
      return formatDateTime(text);
    default:
      return text;
  }
}

export function ReportBuilderPreviewTable({
  preview,
  title = "Vista previa del reporte",
}: {
  preview: ReportBuilderPreviewResponse;
  title?: string;
}) {
  const hasTotals = preview.columns.some((column) => preview.totals[column.key] !== undefined);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{title}</p>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{preview.row_count} filas</Badge>
            {preview.truncated && <Badge variant="secondary">Resultado truncado</Badge>}
          </div>
        </div>

        {preview.columns.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Ninguna columna visible está configurada para este reporte.
          </p>
        ) : preview.rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            El reporte no devolvió filas con estos parámetros.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {preview.columns.map((column) => <TableHead key={column.key}>{column.label}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.rows.map((row, index) => (
                <TableRow key={index}>
                  {preview.columns.map((column) => (
                    <TableCell key={column.key}>{formatCell(row[column.key], column)}</TableCell>
                  ))}
                </TableRow>
              ))}
              {hasTotals && (
                <TableRow>
                  {preview.columns.map((column, index) => {
                    const total = preview.totals[column.key];
                    return (
                      <TableCell key={column.key} className="font-medium">
                        {total !== undefined ? formatCell(total, column) : index === 0 ? "Totales" : ""}
                      </TableCell>
                    );
                  })}
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {preview.truncated && (
          <p className="text-xs text-muted-foreground">
            El backend limitó las filas devueltas; la exportación completa no está truncada.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
