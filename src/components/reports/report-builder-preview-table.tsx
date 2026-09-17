import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format/date";
import { formatCurrency, formatNumber, parseDecimal } from "@/lib/format/decimal";
import type {
  ReportBuilderPreviewColumn,
  ReportBuilderPreviewResponse,
  ReportParameter,
  ReportSummaryConfiguration,
} from "@/types/api";

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

/** A summary carries its own format; the row cell formatter handles the rest. */
function formatSummary(value: unknown, summary: ReportSummaryConfiguration | null): string {
  return formatCell(value, {
    key: summary?.key ?? "",
    label: summary?.label ?? "",
    data_type: "decimal",
    format_type: summary?.format_type ?? "number",
  });
}

export function ReportBuilderPreviewTable({
  preview,
  summaries = [],
  parameters = [],
  title = "Vista previa del reporte",
}: {
  preview: ReportBuilderPreviewResponse;
  /** Saved summary configuration, the only place their labels exist. */
  summaries?: ReportSummaryConfiguration[];
  /** Report parameters, used to label the values the backend ran with. */
  parameters?: ReportParameter[];
  title?: string;
}) {
  const values = preview.summary ?? preview.totals;
  // A pre-#20 layout keys its totals by column, and renders under that column.
  const legacy = summaries.length === 0
    && Object.keys(values).every((key) => preview.columns.some((column) => column.key === key));
  const hasTotals = legacy && preview.columns.some((column) => values[column.key] !== undefined);
  const summaryRows = legacy
    ? []
    : Object.entries(values).map(([key, value]) => {
      const summary = summaries.find((candidate) => candidate.key === key) ?? null;
      return { key, label: summary?.label || key, value: formatSummary(value, summary) };
    });
  const parameterRows = Object.entries(preview.parameters ?? {})
    .filter(([, value]) => value != null && value !== "")
    .map(([name, value]) => ({
      name,
      label: parameters.find((parameter) => parameter.name === name)?.label || name,
      value: typeof value === "boolean" ? (value ? "Sí" : "No") : String(value),
    }));

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

        {parameterRows.length > 0 && (
          <dl className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border bg-muted/20 p-3 text-sm">
            {parameterRows.map((parameter) => (
              <div key={parameter.name} className="flex gap-1.5">
                <dt className="text-muted-foreground">{parameter.label}:</dt>
                <dd className="font-medium">{parameter.value}</dd>
              </div>
            ))}
          </dl>
        )}

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
                    const total = values[column.key];
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

        {summaryRows.length > 0 && (
          <dl className="ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
            {summaryRows.map((summary) => (
              <div key={summary.key} className="flex justify-between gap-4 border-b py-1 last:border-b-0 last:font-semibold">
                <dt>{summary.label}</dt>
                <dd className="tabular-nums">{summary.value}</dd>
              </div>
            ))}
          </dl>
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
