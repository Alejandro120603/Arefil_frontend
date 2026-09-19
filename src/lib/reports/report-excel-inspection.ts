import type {
  ReportWorkbookCellInspection,
  ReportWorkbookSheetInspection,
  ReportWorkbookStyleDescriptor,
} from "@/types/api";

/**
 * Grid geometry and style resolution for the Visual Template Inspector
 * (Frontend #29 / Backend #28).
 *
 * This is deliberately not a spreadsheet engine: it turns the backend's cell
 * list into the small amount of geometry an HTML `<table>` needs (bounds,
 * merge spans, approximate sizing) and resolves the deduplicated style
 * catalog into inline styles. Nothing here evaluates formulas, reproduces
 * theme colors or replicates Excel pixel-perfectly.
 */

/** 1 -> "A", 27 -> "AA". Columns are always >= 1 (openpyxl/Excel convention). */
export function columnIndexToLetters(column: number): string {
  let value = column;
  let letters = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters || "A";
}

const RANGE_PATTERN = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/;
const CELL_PATTERN = /^([A-Z]+)(\d+)$/;

function lettersToColumnIndex(letters: string): number {
  let value = 0;
  for (const char of letters) {
    value = value * 26 + (char.charCodeAt(0) - 64);
  }
  return value;
}

export interface CellReference {
  row: number;
  column: number;
}

/** Parses a single coordinate like `"B4"`. Returns `null` for anything else. */
export function parseCellReference(coordinate: string): CellReference | null {
  const match = CELL_PATTERN.exec(coordinate);
  if (!match) return null;
  return { column: lettersToColumnIndex(match[1]), row: Number.parseInt(match[2], 10) };
}

export interface GridBounds {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}

/**
 * Parses `used_range` (`"A1:J35"`, or `"A1:A1"` for an empty sheet — the
 * openpyxl convention). A malformed range falls back to a single A1 cell
 * rather than throwing: the grid still renders, just as a 1x1 sheet.
 */
export function parseUsedRange(usedRange: string): GridBounds {
  const match = RANGE_PATTERN.exec(usedRange.trim());
  if (!match) return { startRow: 1, endRow: 1, startColumn: 1, endColumn: 1 };
  return {
    startColumn: lettersToColumnIndex(match[1]),
    startRow: Number.parseInt(match[2], 10),
    endColumn: lettersToColumnIndex(match[3]),
    endRow: Number.parseInt(match[4], 10),
  };
}

/** Objects can be anchored beyond the cells included in Excel's used range. */
export function sheetGridBounds(sheet: ReportWorkbookSheetInspection): GridBounds {
  const bounds = parseUsedRange(sheet.used_range);
  for (const drawing of sheet.drawings) {
    const anchor = drawing.anchor ? parseCellReference(drawing.anchor) : null;
    if (!anchor) continue;
    bounds.startRow = Math.min(bounds.startRow, anchor.row);
    bounds.endRow = Math.max(bounds.endRow, anchor.row);
    bounds.startColumn = Math.min(bounds.startColumn, anchor.column);
    bounds.endColumn = Math.max(bounds.endColumn, anchor.column);
  }
  return bounds;
}

function cellKey(row: number, column: number): string {
  return `${row},${column}`;
}

/**
 * Cells the backend omitted (ordinary blanks) are reconstructed on demand by
 * the grid; this only indexes what the backend actually sent.
 */
export function indexCellsByPosition(
  cells: ReportWorkbookCellInspection[],
): Map<string, ReportWorkbookCellInspection> {
  const map = new Map<string, ReportWorkbookCellInspection>();
  for (const cell of cells) map.set(cellKey(cell.row, cell.column), cell);
  return map;
}

export interface MergeSpan {
  rowSpan: number;
  columnSpan: number;
}

/** The size of the merge a cell anchors, in rows/columns. 1x1 when it anchors nothing. */
export function mergeSpan(cell: ReportWorkbookCellInspection): MergeSpan {
  if (!cell.merged_range || cell.merge_anchor !== cell.coordinate) return { rowSpan: 1, columnSpan: 1 };
  const bounds = parseUsedRange(cell.merged_range);
  return {
    rowSpan: bounds.endRow - bounds.startRow + 1,
    columnSpan: bounds.endColumn - bounds.startColumn + 1,
  };
}

/** A cell that belongs to a merge but is not its anchor: never independently selectable. */
export function isMergeSlave(cell: ReportWorkbookCellInspection | undefined): boolean {
  return cell != null && cell.merged_range != null && cell.merge_anchor !== cell.coordinate;
}

const DEFAULT_COLUMN_WIDTH = 8.43;
const DEFAULT_ROW_HEIGHT = 15;
const MIN_COLUMN_PX = 48;
const MAX_COLUMN_PX = 280;
const MIN_ROW_PX = 20;
const MAX_ROW_PX = 96;

/** Excel's character-width column unit, converted to an approximate pixel width. */
export function columnWidthToPx(width: number | undefined, defaultWidth: number | null): number {
  const value = width ?? defaultWidth ?? DEFAULT_COLUMN_WIDTH;
  const px = Math.round(value * 7 + 5);
  return Math.min(MAX_COLUMN_PX, Math.max(MIN_COLUMN_PX, px));
}

/** Excel row height is in points; 1pt ≈ 1.333px. */
export function rowHeightToPx(height: number | undefined, defaultHeight: number | null): number {
  const value = height ?? defaultHeight ?? DEFAULT_ROW_HEIGHT;
  const px = Math.round(value * 1.333);
  return Math.min(MAX_ROW_PX, Math.max(MIN_ROW_PX, px));
}

export function sheetColumnWidthPx(
  sheet: ReportWorkbookSheetInspection,
  column: number,
): number {
  return columnWidthToPx(sheet.column_widths[columnIndexToLetters(column)], sheet.default_column_width);
}

export function sheetRowHeightPx(sheet: ReportWorkbookSheetInspection, row: number): number {
  return rowHeightToPx(sheet.row_heights[String(row)], sheet.default_row_height);
}

/** Resolved, display-ready style for one cell — `null` fields mean "inherit the default". */
export interface ResolvedCellStyle {
  fontWeight: "bold" | "normal";
  fontStyle: "italic" | "normal";
  fontSize: number | null;
  textAlign: "left" | "center" | "right" | "justify" | null;
  verticalAlign: "top" | "middle" | "bottom" | null;
  whiteSpace: "normal" | "nowrap";
  backgroundColor: string | null;
  color: string | null;
  borderTop: boolean;
  borderRight: boolean;
  borderBottom: boolean;
  borderLeft: boolean;
}

const HORIZONTAL_ALIGNMENTS: Record<string, ResolvedCellStyle["textAlign"]> = {
  left: "left",
  center: "center",
  centercontinuous: "center",
  right: "right",
  justify: "justify",
  general: null,
};

const VERTICAL_ALIGNMENTS: Record<string, ResolvedCellStyle["verticalAlign"]> = {
  top: "top",
  center: "middle",
  bottom: "bottom",
};

function normalizeRgb(rgb: string | null): string | null {
  if (!rgb) return null;
  return rgb.startsWith("#") ? rgb : `#${rgb}`;
}

/** A border side counts as drawn for anything other than absent/`"none"`. */
function hasBorder(borders: Record<string, string | null>, side: string): boolean {
  const value = borders[side];
  return value != null && value.toLowerCase() !== "none";
}

export function resolveCellStyle(style: ReportWorkbookStyleDescriptor | undefined): ResolvedCellStyle {
  if (!style) {
    return {
      fontWeight: "normal",
      fontStyle: "normal",
      fontSize: null,
      textAlign: null,
      verticalAlign: null,
      whiteSpace: "normal",
      backgroundColor: null,
      color: null,
      borderTop: false,
      borderRight: false,
      borderBottom: false,
      borderLeft: false,
    };
  }
  return {
    fontWeight: style.bold ? "bold" : "normal",
    fontStyle: style.italic ? "italic" : "normal",
    fontSize: style.font_size,
    textAlign: style.horizontal_alignment ? HORIZONTAL_ALIGNMENTS[style.horizontal_alignment.toLowerCase()] ?? null : null,
    verticalAlign: style.vertical_alignment ? VERTICAL_ALIGNMENTS[style.vertical_alignment.toLowerCase()] ?? null : null,
    whiteSpace: style.wrap_text ? "normal" : "nowrap",
    backgroundColor: normalizeRgb(style.fill_rgb),
    color: normalizeRgb(style.font_rgb),
    borderTop: hasBorder(style.borders, "top"),
    borderRight: hasBorder(style.borders, "right"),
    borderBottom: hasBorder(style.borders, "bottom"),
    borderLeft: hasBorder(style.borders, "left"),
  };
}

export const VALUE_TYPE_LABELS: Record<ReportWorkbookCellInspection["value_type"], string> = {
  empty: "Vacía",
  text: "Texto",
  number: "Número",
  boolean: "Booleano",
  date: "Fecha",
  time: "Hora",
  formula: "Fórmula",
  error: "Error",
};

/** What the grid prints inside a cell: the formula text when there is one, else the value. */
export function cellDisplayValue(cell: ReportWorkbookCellInspection | undefined): string {
  if (!cell) return "";
  if (cell.value_type === "formula") return cell.formula ?? "";
  if (cell.value == null) return "";
  return String(cell.value);
}

/**
 * A practical rendering cap, not a backend limit: a plain `<table>` of tens
 * of thousands of cells locks up the browser well before the backend's own
 * `EXCEL_INSPECTION_MAX_CELLS`. Real report templates are a page or two, so
 * this is generous for the intended use and documented as a known fidelity
 * limit rather than solved with virtualization the feature doesn't need yet.
 */
export const MAX_RENDERABLE_CELLS = 4000;

export function usedRangeCellCount(bounds: GridBounds): number {
  return (bounds.endRow - bounds.startRow + 1) * (bounds.endColumn - bounds.startColumn + 1);
}
