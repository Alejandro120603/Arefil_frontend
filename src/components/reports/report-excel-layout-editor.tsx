"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_HEADER_ROW,
  MAX_SHEET_NAME_LENGTH,
  MIN_HEADER_ROW,
  summableColumns,
  toggleTotal,
} from "@/lib/reports/report-builder";
import type { ReportColumn, ReportExcelLayout } from "@/types/api";

const TOGGLES: { key: keyof ReportExcelLayout; label: string; hint: string }[] = [
  { key: "show_report_name", label: "Mostrar nombre del reporte", hint: "Escribe el nombre en la cabecera del archivo." },
  { key: "show_generated_at", label: "Mostrar fecha de generación", hint: "Sella cuándo se exportó el archivo." },
  { key: "show_parameters", label: "Mostrar parámetros", hint: "Lista los valores con los que se ejecutó." },
  { key: "freeze_header", label: "Congelar encabezados", hint: "Mantiene visible la fila de títulos al desplazar." },
];

/**
 * Edits `ReportExcelLayout` exactly as Backend #12 defines it. This is a
 * layout *contract*, not a spreadsheet designer: there is no canvas, no
 * cell-by-cell editing and no merging — those are out of scope for #13.
 */
export function ReportExcelLayoutEditor({
  layout,
  columns,
  disabled = false,
  onChange,
}: {
  layout: ReportExcelLayout;
  columns: ReportColumn[];
  disabled?: boolean;
  onChange: (layout: ReportExcelLayout) => void;
}) {
  // SUM is refused on hidden or non-numeric columns, so they are never offered.
  const totalCandidates = summableColumns(columns);
  const selectedTotals = new Set(layout.totals.map((total) => total.column_key));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="layout-sheet-name">Nombre de hoja</Label>
          <Input
            id="layout-sheet-name"
            value={layout.sheet_name}
            maxLength={MAX_SHEET_NAME_LENGTH}
            disabled={disabled}
            onChange={(event) => onChange({ ...layout, sheet_name: event.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Máximo {MAX_SHEET_NAME_LENGTH} caracteres, sin [ ] : * ? / \
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="layout-title">Título</Label>
          <Input
            id="layout-title"
            value={layout.title ?? ""}
            placeholder="Opcional"
            disabled={disabled}
            onChange={(event) => onChange({ ...layout, title: event.target.value || null })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="layout-header-row">Fila de encabezado</Label>
          <Input
            id="layout-header-row"
            type="number"
            min={MIN_HEADER_ROW}
            max={MAX_HEADER_ROW}
            value={layout.header_row}
            disabled={disabled}
            onChange={(event) => onChange({
              ...layout,
              header_row: event.target.value === "" ? MIN_HEADER_ROW : Number.parseInt(event.target.value, 10),
            })}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {TOGGLES.map((toggle) => (
          <label key={toggle.key} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={Boolean(layout[toggle.key])}
              disabled={disabled}
              onChange={(event) => onChange({ ...layout, [toggle.key]: event.target.checked })}
            />
            <span>
              {toggle.label}
              <span className="block text-xs text-muted-foreground">{toggle.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Fila de totales</p>
        {totalCandidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ninguna columna numérica visible puede totalizarse todavía.
          </p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {totalCandidates.map((column) => (
              <label key={column.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedTotals.has(column.key)}
                  disabled={disabled}
                  onChange={() => onChange(toggleTotal(layout, column.key))}
                />
                SUM de {column.label || column.key}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
