import { parseCellReference } from "@/lib/reports/report-excel-inspection";
import type {
  ReportBuilderDefinition,
  ReportWorkbookCellInspection,
  ReportWorkbookSheetInspection,
} from "@/types/api";

/**
 * Visual Template Mapper (Frontend #30 / Backend #29).
 *
 * Turns the report's builder contract into the friendly field picker the
 * issue asks for ("Datos del reporte" / "Datos capturados" / "Renglones" /
 * "Resumen"), and tracks the admin's unsaved edits as an overlay on top of
 * the last-loaded inspection — nothing here calls the backend or touches the
 * DOM, so it can be unit-tested without a browser.
 */

export type MappingNamespace = "report" | "parameters" | "rows" | "summary";

export interface MappingFieldOption {
  /** `"namespace.key"` — what the backend's `ExcelCellMapping.placeholder` expects. */
  placeholder: string;
  namespace: MappingNamespace;
  key: string;
  label: string;
  /** Short glyph for the in-cell badge, e.g. `"P"` for a parameter. */
  abbreviation: string;
}

export interface MappingFieldGroup {
  namespace: MappingNamespace;
  title: string;
  options: MappingFieldOption[];
}

const NAMESPACE_TITLES: Record<MappingNamespace, string> = {
  report: "Datos del reporte",
  parameters: "Datos capturados",
  rows: "Renglones / productos",
  summary: "Resumen y totales",
};

const NAMESPACE_ABBREVIATIONS: Record<MappingNamespace, string> = {
  report: "D",
  parameters: "P",
  rows: "R",
  summary: "Σ",
};

/** Mirrors the backend's fixed `_REPORT_KEYS` (`excel_template_validation.py`). */
const REPORT_FIELD_LABELS: Record<string, string> = {
  code: "Código",
  name: "Nombre del reporte",
  description: "Descripción",
  category: "Categoría",
  template_version: "Versión de plantilla",
};

function fieldOption(namespace: MappingNamespace, key: string, label: string): MappingFieldOption {
  return { namespace, key, label, abbreviation: NAMESPACE_ABBREVIATIONS[namespace], placeholder: `${namespace}.${key}` };
}

/**
 * Derives the picker's groups from the report's own builder contract — never
 * hardcoded to one report. Empty groups (no parameters, no totals configured)
 * are omitted; "Datos del reporte" and "Renglones" always exist.
 */
export function buildMappingFieldGroups(builder: ReportBuilderDefinition): MappingFieldGroup[] {
  const reportOptions = Object.entries(REPORT_FIELD_LABELS).map(([key, label]) => fieldOption("report", key, label));

  const parameterOptions = [...builder.report.parameters]
    .sort((a, b) => a.display_order - b.display_order)
    .map((parameter) => fieldOption("parameters", parameter.name, parameter.label));

  const visibleColumns = [...builder.columns]
    .filter((column) => column.visible)
    .sort((a, b) => a.display_order - b.display_order);
  // `rows.row_number` is always available, but a report may also expose it as
  // an ordinary visible column (a `system.row_number` field). Emitting both
  // would hand the picker two options with the same placeholder.
  const columnOptions = visibleColumns.map((column) => fieldOption("rows", column.key, column.label));
  const rowsOptions = visibleColumns.some((column) => column.key === "row_number")
    ? columnOptions
    : [fieldOption("rows", "row_number", "Número de renglón (Item)"), ...columnOptions];

  const totals = builder.excel_layout?.totals ?? [];
  const summaryOptions = totals.map((total) => {
    if ("key" in total) return fieldOption("summary", total.key, total.label);
    // Legacy pre-#20 reports: the summary is identified by the column it sums.
    const column = builder.columns.find((candidate) => candidate.key === total.column_key);
    return fieldOption("summary", total.column_key, column ? `Suma de ${column.label}` : total.column_key);
  });

  const groups: MappingFieldGroup[] = [{ namespace: "report", title: NAMESPACE_TITLES.report, options: reportOptions }];
  if (parameterOptions.length > 0) {
    groups.push({ namespace: "parameters", title: NAMESPACE_TITLES.parameters, options: parameterOptions });
  }
  groups.push({ namespace: "rows", title: NAMESPACE_TITLES.rows, options: rowsOptions });
  if (summaryOptions.length > 0) {
    groups.push({ namespace: "summary", title: NAMESPACE_TITLES.summary, options: summaryOptions });
  }
  return groups;
}

export function indexMappingOptions(groups: MappingFieldGroup[]): Map<string, MappingFieldOption> {
  const map = new Map<string, MappingFieldOption>();
  for (const group of groups) for (const option of group.options) map.set(option.placeholder, option);
  return map;
}

/**
 * One unsaved edit, keyed by `pendingKey(sheet, cell)` in the mapper's state.
 * `"map"` writes a placeholder; `"clear"` blanks a cell that holds one.
 */
export type PendingCellChange = { kind: "map"; placeholder: string } | { kind: "clear" };

export function pendingKey(sheet: string, cell: string): string {
  return `${sheet}!${cell}`;
}

export function splitPendingKey(key: string): ExcelCellTargetLike {
  const separator = key.indexOf("!");
  return { sheet: key.slice(0, separator), cell: key.slice(separator + 1) };
}

interface ExcelCellTargetLike {
  sheet: string;
  cell: string;
}

const WRAPPED_PLACEHOLDER = /^\{\{\s*([a-z]+\.[A-Za-z][A-Za-z0-9_]*)\s*\}\}$/;

/**
 * A cell only counts as "carrying a placeholder" when its whole value is
 * exactly one recognized token — matches what the backend's `clear` accepts
 * and what the panel offers to remove. A token embedded in a longer string is
 * left as ordinary text; overwriting it still works via a normal mapping.
 *
 * Returns the bare `"namespace.key"` form (what `ExcelCellMapping.placeholder`
 * expects), not the inspection's `"{{namespace.key}}"` wrapper.
 */
export function savedPlaceholderOf(cell: ReportWorkbookCellInspection): string | null {
  if (cell.placeholders.length !== 1 || cell.placeholders[0] !== cell.value) return null;
  return WRAPPED_PLACEHOLDER.exec(cell.placeholders[0])?.[1] ?? null;
}

/** The placeholder a cell would save as right now: the pending edit if there is one, else what's already saved. */
export function effectivePlaceholder(
  cell: ReportWorkbookCellInspection,
  pending: ReadonlyMap<string, PendingCellChange>,
  sheetName: string,
): string | null {
  const change = pending.get(pendingKey(sheetName, cell.coordinate));
  if (change) return change.kind === "map" ? change.placeholder : null;
  return savedPlaceholderOf(cell);
}

/**
 * Rows on this sheet that carry a `rows.*` mapping right now (saved or
 * pending). The backend allows at most one per sheet
 * (`multiple_repeatable_rows`); the mapper uses this to highlight the row and
 * to keep new `rows.*` assignments confined to it.
 */
export function repeatableRows(
  sheet: ReportWorkbookSheetInspection,
  pending: ReadonlyMap<string, PendingCellChange>,
): Set<number> {
  const rows = new Set<number>();
  const known = new Set<string>();
  for (const cell of sheet.cells) {
    known.add(cell.coordinate);
    if (effectivePlaceholder(cell, pending, sheet.name)?.startsWith("rows.")) rows.add(cell.row);
  }
  const prefix = `${sheet.name}!`;
  for (const [key, change] of pending) {
    if (!key.startsWith(prefix) || change.kind !== "map" || !change.placeholder.startsWith("rows.")) continue;
    const coordinate = key.slice(prefix.length);
    if (known.has(coordinate)) continue;
    const reference = parseCellReference(coordinate);
    if (reference) rows.add(reference.row);
  }
  return rows;
}

/** The sheet's single repeatable row, or `null` when none is established yet. */
export function primaryRepeatableRow(
  sheet: ReportWorkbookSheetInspection,
  pending: ReadonlyMap<string, PendingCellChange>,
): number | null {
  const rows = repeatableRows(sheet, pending);
  return rows.size === 0 ? null : Math.min(...rows);
}

export interface CellOverlay {
  kind: "mapped" | "cleared";
  label: string;
  abbreviation: string;
  /** The raw `{{namespace.key}}` text, shown in a tooltip rather than as the cell's main label. */
  technical: string;
  /** `true` while the change is only staged locally, not yet saved. */
  dirty: boolean;
}

/**
 * What each cell of this sheet should show instead of its raw content: a
 * friendly badge for a mapped/cleared cell, saved or pending. Cells with
 * neither are absent from the map, so the grid falls back to its normal
 * rendering.
 */
export function buildCellOverlays(
  sheet: ReportWorkbookSheetInspection,
  pending: ReadonlyMap<string, PendingCellChange>,
  optionsByPlaceholder: ReadonlyMap<string, MappingFieldOption>,
): Map<string, CellOverlay> {
  const overlays = new Map<string, CellOverlay>();
  const cellsByCoordinate = new Map(sheet.cells.map((cell) => [cell.coordinate, cell]));
  const prefix = `${sheet.name}!`;
  const coordinates = new Set<string>(cellsByCoordinate.keys());
  for (const key of pending.keys()) {
    if (key.startsWith(prefix)) coordinates.add(key.slice(prefix.length));
  }

  for (const coordinate of coordinates) {
    const change = pending.get(pendingKey(sheet.name, coordinate));
    if (change) {
      if (change.kind === "clear") {
        overlays.set(coordinate, { kind: "cleared", label: "", abbreviation: "", technical: "", dirty: true });
      } else {
        const option = optionsByPlaceholder.get(change.placeholder);
        overlays.set(coordinate, {
          kind: "mapped",
          label: option?.label ?? change.placeholder,
          abbreviation: option?.abbreviation ?? "?",
          technical: `{{${change.placeholder}}}`,
          dirty: true,
        });
      }
      continue;
    }
    const cell = cellsByCoordinate.get(coordinate);
    const saved = cell ? savedPlaceholderOf(cell) : null;
    if (!saved) continue;
    const option = optionsByPlaceholder.get(saved);
    overlays.set(coordinate, {
      kind: "mapped",
      label: option?.label ?? saved,
      abbreviation: option?.abbreviation ?? "?",
      technical: `{{${saved}}}`,
      dirty: false,
    });
  }
  return overlays;
}
