"use client";

import { useMemo, type KeyboardEvent } from "react";
import { Image as ImageIcon, LineChart } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  cellDisplayValue,
  columnIndexToLetters,
  indexCellsByPosition,
  isMergeSlave,
  mergeSpan,
  parseCellReference,
  sheetGridBounds,
  resolveCellStyle,
  sheetColumnWidthPx,
  sheetRowHeightPx,
} from "@/lib/reports/report-excel-inspection";
import type { CellOverlay } from "@/lib/reports/report-excel-mapping";
import type {
  ReportWorkbookCellInspection,
  ReportWorkbookDrawingInspection,
  ReportWorkbookSheetInspection,
  ReportWorkbookStyleDescriptor,
} from "@/types/api";

/**
 * The shared workbook grid (Frontend #29/#30/#31): one HTML `<table>`
 * covering a sheet's `used_range`, used both for the editable template
 * inspector/mapper and for the read-only rendered-document preview. There is
 * deliberately only one grid implementation — a preview must never drift
 * visually from the mapper it was built from.
 *
 * Ordinary blank cells the backend omitted are synthesized here from bounds
 * alone; merge slaves are never rendered as their own cell — the anchor
 * carries `rowSpan`/`colSpan` instead, so a click anywhere in the merged
 * region always resolves to the anchor coordinate.
 *
 * Omitting `onSelectCell` makes the grid read-only: cells render as plain,
 * non-focusable table cells with no click/selection affordance at all (the
 * preview mode; #31 requires selecting/mapping to stay unavailable there).
 *
 * `overlays` (#30) replaces a mapped/cleared cell's raw content with a
 * friendly badge; `errorCoordinates` rings a cell the backend just rejected
 * (destructive); `warningCoordinates` rings a cell with a lesser problem, e.g.
 * a leftover unresolved placeholder in a rendered preview (#31, amber);
 * `repeatableRow` tints the sheet's one repeatable-row, if it has one.
 */
export function WorkbookGrid({
  sheet,
  styles,
  selectedCoordinate = null,
  onSelectCell,
  overlays,
  errorCoordinates,
  warningCoordinates,
  repeatableRow = null,
}: {
  sheet: ReportWorkbookSheetInspection;
  styles: Record<string, ReportWorkbookStyleDescriptor>;
  selectedCoordinate?: string | null;
  /** Absent = read-only grid: no cell is selectable or focusable. */
  onSelectCell?: (cell: ReportWorkbookCellInspection) => void;
  overlays?: Map<string, CellOverlay>;
  errorCoordinates?: Set<string>;
  warningCoordinates?: Set<string>;
  repeatableRow?: number | null;
}) {
  const bounds = useMemo(() => sheetGridBounds(sheet), [sheet]);
  const cellsByPosition = useMemo(() => indexCellsByPosition(sheet.cells), [sheet.cells]);
  const drawingsByAnchor = useMemo(() => {
    const map = new Map<string, ReportWorkbookDrawingInspection[]>();
    for (const drawing of sheet.drawings) {
      if (!drawing.anchor) continue;
      const position = parseCellReference(drawing.anchor);
      const cell = position ? cellsByPosition.get(`${position.row},${position.column}`) : undefined;
      const anchor = cell?.merge_anchor ?? drawing.anchor;
      const list = map.get(anchor) ?? [];
      list.push(drawing);
      map.set(anchor, list);
    }
    return map;
  }, [sheet.drawings, cellsByPosition]);

  const columns = useMemo(
    () => Array.from({ length: bounds.endColumn - bounds.startColumn + 1 }, (_, i) => bounds.startColumn + i),
    [bounds],
  );
  const rows = useMemo(
    () => Array.from({ length: bounds.endRow - bounds.startRow + 1 }, (_, i) => bounds.startRow + i),
    [bounds],
  );

  return (
    <div className="max-h-[65vh] overflow-auto rounded-lg border" role="region" aria-label={`Cuadrícula de la hoja ${sheet.name}`}>
      <table className="border-collapse text-sm" style={{ tableLayout: "fixed", width: 40 + columns.reduce((total, column) => total + sheetColumnWidthPx(sheet, column), 0) }}>
        <colgroup>
          <col style={{ width: 40 }} />
          {columns.map((column) => <col key={column} style={{ width: sheetColumnWidthPx(sheet, column) }} />)}
        </colgroup>
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-20 w-10 border bg-muted" aria-hidden="true" />
            {columns.map((column) => (
              <th
                key={column}
                className="sticky top-0 z-10 border bg-muted px-1 py-0.5 text-center font-medium text-muted-foreground"
                style={{ width: sheetColumnWidthPx(sheet, column) }}
              >
                {columnIndexToLetters(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row} style={{ height: sheetRowHeightPx(sheet, row) }}>
              <th
                className={cn(
                  "sticky left-0 z-10 border bg-muted px-1 text-center font-medium text-muted-foreground",
                  row === repeatableRow && "bg-amber-500/20 text-amber-900 dark:text-amber-200",
                )}
                title={row === repeatableRow ? "Fila repetible: se duplica por cada renglón del reporte." : undefined}
              >
                {row}
              </th>
              {columns.map((column) => {
                const key = `${row},${column}`;
                const stored = cellsByPosition.get(key);
                if (isMergeSlave(stored)) return null;

                const coordinate = stored?.coordinate ?? `${columnIndexToLetters(column)}${row}`;
                // Ordinary blanks are omitted by the backend; synthesize a minimal cell so
                // every position in the used range is still selectable and describable.
                const cell: ReportWorkbookCellInspection = stored ?? {
                  coordinate,
                  row,
                  column,
                  value: null,
                  value_type: "empty",
                  formula: null,
                  placeholders: [],
                  style_id: -1,
                  number_format: "General",
                  merged_range: null,
                  merge_anchor: null,
                };
                const span = mergeSpan(cell);
                const resolved = resolveCellStyle(styles[String(cell.style_id)]);
                const isSelected = selectedCoordinate === coordinate;
                const hasPlaceholders = cell.placeholders.length > 0;
                const drawings = drawingsByAnchor.get(coordinate) ?? [];
                const overlay = overlays?.get(coordinate);
                const hasError = errorCoordinates?.has(coordinate) ?? false;
                const hasWarning = !hasError && (warningCoordinates?.has(coordinate) ?? false);
                const isFormula = cell.value_type === "formula";
                const interactive = onSelectCell != null;

                return (
                  <td
                    key={key}
                    {...(interactive
                      ? {
                          role: "button",
                          tabIndex: 0,
                          "aria-pressed": isSelected,
                          onClick: () => onSelectCell(cell),
                          onKeyDown: (event: KeyboardEvent<HTMLTableCellElement>) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onSelectCell(cell);
                            }
                          },
                        }
                      : {})}
                    aria-label={`Celda ${coordinate}`}
                    rowSpan={span.rowSpan}
                    colSpan={span.columnSpan}
                    className={cn(
                      "select-none overflow-hidden text-ellipsis whitespace-nowrap border px-1 align-top outline-none",
                      interactive && "cursor-pointer focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                      isSelected && "ring-2 ring-inset ring-primary",
                      hasPlaceholders && !isSelected && !overlay && "bg-primary/10",
                      row === repeatableRow && !overlay && "bg-amber-500/10",
                      hasError && "ring-2 ring-inset ring-destructive",
                      hasWarning && "ring-2 ring-inset ring-amber-500",
                    )}
                    style={{
                      fontWeight: resolved.fontWeight,
                      fontStyle: resolved.fontStyle,
                      fontSize: resolved.fontSize ?? undefined,
                      textAlign: resolved.textAlign ?? undefined,
                      verticalAlign: resolved.verticalAlign ?? "top",
                      whiteSpace: resolved.whiteSpace,
                      backgroundColor: resolved.backgroundColor ?? undefined,
                      color: resolved.color ?? undefined,
                      borderTopWidth: resolved.borderTop ? 2 : undefined,
                      borderRightWidth: resolved.borderRight ? 2 : undefined,
                      borderBottomWidth: resolved.borderBottom ? 2 : undefined,
                      borderLeftWidth: resolved.borderLeft ? 2 : undefined,
                    }}
                  >
                    {overlay ? (
                      <span
                        title={overlay.kind === "mapped" ? overlay.technical : "Se eliminará al guardar."}
                        className={cn(
                          "inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 text-xs",
                          overlay.kind === "mapped" ? "bg-primary/15 text-foreground" : "bg-destructive/10 text-destructive",
                          overlay.dirty && "border border-dashed border-amber-500",
                        )}
                      >
                        {overlay.kind === "mapped" ? (
                          <>
                            <span className="font-semibold">[{overlay.abbreviation}]</span>
                            <span className="truncate">{overlay.label}</span>
                          </>
                        ) : (
                          <span className="italic text-muted-foreground">(vacío)</span>
                        )}
                      </span>
                    ) : (
                      <>
                        {isFormula && (
                          <span
                            title="Celda con fórmula: no se puede mapear desde el editor visual."
                            className="mr-1 inline-flex items-center rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground"
                          >
                            ƒx
                          </span>
                        )}
                        {drawings.map((drawing, index) => (
                          <span
                            key={index}
                            className="mr-1 inline-flex items-center gap-0.5 rounded bg-muted px-1 text-xs text-muted-foreground"
                          >
                            {drawing.type === "image" ? <ImageIcon className="h-3 w-3" /> : <LineChart className="h-3 w-3" />}
                            {drawing.type === "image" ? "Imagen" : "Gráfica"}
                          </span>
                        ))}
                        {cellDisplayValue(cell)}
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
