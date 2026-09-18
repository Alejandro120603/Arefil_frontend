import { describe, expect, it } from "vitest";
import {
  MAX_RENDERABLE_CELLS,
  columnIndexToLetters,
  columnWidthToPx,
  indexCellsByPosition,
  isMergeSlave,
  mergeSpan,
  parseCellReference,
  parseUsedRange,
  resolveCellStyle,
  rowHeightToPx,
  usedRangeCellCount,
  cellDisplayValue,
} from "./report-excel-inspection";
import type { ReportWorkbookCellInspection, ReportWorkbookStyleDescriptor } from "@/types/api";

function cell(overrides: Partial<ReportWorkbookCellInspection> = {}): ReportWorkbookCellInspection {
  return {
    coordinate: "A1",
    row: 1,
    column: 1,
    value: null,
    value_type: "empty",
    formula: null,
    placeholders: [],
    style_id: 0,
    number_format: "General",
    merged_range: null,
    merge_anchor: null,
    ...overrides,
  };
}

describe("columnIndexToLetters", () => {
  it("converts single and double letter columns", () => {
    expect(columnIndexToLetters(1)).toBe("A");
    expect(columnIndexToLetters(26)).toBe("Z");
    expect(columnIndexToLetters(27)).toBe("AA");
    expect(columnIndexToLetters(52)).toBe("AZ");
  });
});

describe("parseCellReference", () => {
  it("parses a coordinate into row/column", () => {
    expect(parseCellReference("B4")).toEqual({ row: 4, column: 2 });
    expect(parseCellReference("AA10")).toEqual({ row: 10, column: 27 });
  });

  it("returns null for anything that is not a bare coordinate", () => {
    expect(parseCellReference("A1:B2")).toBeNull();
    expect(parseCellReference("")).toBeNull();
  });
});

describe("parseUsedRange", () => {
  it("parses a multi-cell range", () => {
    expect(parseUsedRange("B2:J35")).toEqual({ startColumn: 2, startRow: 2, endColumn: 10, endRow: 35 });
  });

  it("falls back to a single A1 cell for the empty-sheet convention and malformed input", () => {
    expect(parseUsedRange("A1:A1")).toEqual({ startColumn: 1, startRow: 1, endColumn: 1, endRow: 1 });
    expect(parseUsedRange("garbage")).toEqual({ startColumn: 1, startRow: 1, endColumn: 1, endRow: 1 });
  });
});

describe("usedRangeCellCount", () => {
  it("counts the rectangle, not the number of populated cells", () => {
    expect(usedRangeCellCount(parseUsedRange("A1:J35"))).toBe(10 * 35);
  });

  it("stays under MAX_RENDERABLE_CELLS for a realistic quotation template", () => {
    expect(usedRangeCellCount(parseUsedRange("A1:J60"))).toBeLessThan(MAX_RENDERABLE_CELLS);
  });
});

describe("indexCellsByPosition", () => {
  it("indexes by numeric row/column, not by coordinate string", () => {
    const cells = [cell({ coordinate: "B4", row: 4, column: 2, value: "Cliente:", value_type: "text" })];
    const map = indexCellsByPosition(cells);
    expect(map.get("4,2")?.value).toBe("Cliente:");
    expect(map.get("2,4")).toBeUndefined();
  });
});

describe("mergeSpan / isMergeSlave", () => {
  const anchor = cell({ coordinate: "A1", row: 1, column: 1, merged_range: "A1:C2", merge_anchor: "A1" });
  const slave = cell({ coordinate: "B1", row: 1, column: 2, merged_range: "A1:C2", merge_anchor: "A1" });
  const plain = cell({ coordinate: "D1", row: 1, column: 4 });

  it("computes the anchor's row/column span from the merged range", () => {
    expect(mergeSpan(anchor)).toEqual({ rowSpan: 2, columnSpan: 3 });
  });

  it("gives a 1x1 span to a slave or a cell outside any merge", () => {
    expect(mergeSpan(slave)).toEqual({ rowSpan: 1, columnSpan: 1 });
    expect(mergeSpan(plain)).toEqual({ rowSpan: 1, columnSpan: 1 });
  });

  it("flags only the slave, never the anchor or an unrelated cell", () => {
    expect(isMergeSlave(anchor)).toBe(false);
    expect(isMergeSlave(slave)).toBe(true);
    expect(isMergeSlave(plain)).toBe(false);
    expect(isMergeSlave(undefined)).toBe(false);
  });
});

describe("columnWidthToPx / rowHeightToPx", () => {
  it("converts Excel units to a clamped pixel size", () => {
    expect(columnWidthToPx(12.5, null)).toBeGreaterThan(0);
    expect(columnWidthToPx(undefined, 8.43)).toBeGreaterThan(0);
    expect(columnWidthToPx(1000, null)).toBeLessThanOrEqual(280);
    expect(columnWidthToPx(0, null)).toBeGreaterThanOrEqual(48);
  });

  it("converts points to pixels for row height", () => {
    expect(rowHeightToPx(24, null)).toBeGreaterThan(rowHeightToPx(15, null));
    expect(rowHeightToPx(undefined, null)).toBeGreaterThanOrEqual(20);
  });
});

describe("resolveCellStyle", () => {
  const style: ReportWorkbookStyleDescriptor = {
    bold: true,
    italic: false,
    font_size: 12,
    horizontal_alignment: "center",
    vertical_alignment: "center",
    wrap_text: true,
    fill_rgb: "FFCC00",
    font_rgb: "#000000",
    borders: { top: "thin", bottom: "none", left: null, right: "medium" },
    number_format: "General",
  };

  it("resolves bold/alignment/fill and normalizes RGB with a leading #", () => {
    const resolved = resolveCellStyle(style);
    expect(resolved.fontWeight).toBe("bold");
    expect(resolved.textAlign).toBe("center");
    expect(resolved.verticalAlign).toBe("middle");
    expect(resolved.backgroundColor).toBe("#FFCC00");
    expect(resolved.color).toBe("#000000");
    expect(resolved.borderTop).toBe(true);
    expect(resolved.borderBottom).toBe(false);
    expect(resolved.borderLeft).toBe(false);
    expect(resolved.borderRight).toBe(true);
  });

  it("falls back to neutral defaults for a cell with no style catalog entry", () => {
    const resolved = resolveCellStyle(undefined);
    expect(resolved.fontWeight).toBe("normal");
    expect(resolved.backgroundColor).toBeNull();
    expect(resolved.borderTop).toBe(false);
  });
});

describe("cellDisplayValue", () => {
  it("shows the formula text for a formula cell, not its null value", () => {
    expect(cellDisplayValue(cell({ value_type: "formula", value: null, formula: "=SUM(A1:A9)" }))).toBe("=SUM(A1:A9)");
  });

  it("shows the value for anything else, and an empty string for a missing cell", () => {
    expect(cellDisplayValue(cell({ value_type: "text", value: "Cliente:" }))).toBe("Cliente:");
    expect(cellDisplayValue(cell({ value_type: "number", value: 42 }))).toBe("42");
    expect(cellDisplayValue(undefined)).toBe("");
  });
});
