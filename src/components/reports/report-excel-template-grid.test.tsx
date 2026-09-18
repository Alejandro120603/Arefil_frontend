// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportExcelTemplateGrid } from "./report-excel-template-grid";
import type {
  ReportWorkbookCellInspection,
  ReportWorkbookSheetInspection,
  ReportWorkbookStyleDescriptor,
} from "@/types/api";

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

function sheet(overrides: Partial<ReportWorkbookSheetInspection> = {}): ReportWorkbookSheetInspection {
  return {
    name: "Cotización",
    index: 0,
    hidden: false,
    state: "visible",
    max_row: 4,
    max_column: 3,
    used_range: "A1:C4",
    merged_ranges: [],
    row_heights: {},
    column_widths: {},
    default_row_height: null,
    default_column_width: null,
    cells: [],
    drawings: [],
    ...overrides,
  };
}

const STYLES: Record<string, ReportWorkbookStyleDescriptor> = {};

afterEach(cleanup);

describe("ReportExcelTemplateGrid", () => {
  it("renders column letters, row numbers and cell content within the used range", () => {
    render(
      <ReportExcelTemplateGrid
        sheet={sheet({ cells: [cell({ coordinate: "B4", row: 4, column: 2, value: "Cliente:", value_type: "text" })] })}
        styles={STYLES}
        selectedCoordinate={null}
        onSelectCell={vi.fn()}
      />,
    );

    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("C")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByLabelText("Celda B4")).toBeTruthy();
    expect(screen.getByText("Cliente:")).toBeTruthy();
  });

  it("selects a cell on click", async () => {
    const onSelectCell = vi.fn();
    const user = userEvent.setup();
    render(
      <ReportExcelTemplateGrid
        sheet={sheet({ cells: [cell({ coordinate: "B4", row: 4, column: 2, value: "Cliente:", value_type: "text" })] })}
        styles={STYLES}
        selectedCoordinate={null}
        onSelectCell={onSelectCell}
      />,
    );

    await user.click(screen.getByLabelText("Celda B4"));
    expect(onSelectCell).toHaveBeenCalledWith(expect.objectContaining({ coordinate: "B4" }));
  });

  it("renders a merge as one spanning cell and never as an independently selectable slave", async () => {
    const anchor = cell({ coordinate: "A1", row: 1, column: 1, value: "Título", value_type: "text", merged_range: "A1:B2", merge_anchor: "A1" });
    const slaveRight = cell({ coordinate: "B1", row: 1, column: 2, merged_range: "A1:B2", merge_anchor: "A1" });
    const slaveBelow = cell({ coordinate: "A2", row: 2, column: 1, merged_range: "A1:B2", merge_anchor: "A1" });
    const slaveDiagonal = cell({ coordinate: "B2", row: 2, column: 2, merged_range: "A1:B2", merge_anchor: "A1" });
    const onSelectCell = vi.fn();
    const user = userEvent.setup();

    render(
      <ReportExcelTemplateGrid
        sheet={sheet({ used_range: "A1:C4", cells: [anchor, slaveRight, slaveBelow, slaveDiagonal] })}
        styles={STYLES}
        selectedCoordinate={null}
        onSelectCell={onSelectCell}
      />,
    );

    const anchorCell = screen.getByLabelText("Celda A1");
    expect(anchorCell.getAttribute("colspan")).toBe("2");
    expect(anchorCell.getAttribute("rowspan")).toBe("2");
    expect(screen.queryByLabelText("Celda B1")).toBeNull();
    expect(screen.queryByLabelText("Celda A2")).toBeNull();
    expect(screen.queryByLabelText("Celda B2")).toBeNull();

    await user.click(anchorCell);
    expect(onSelectCell).toHaveBeenCalledWith(expect.objectContaining({ coordinate: "A1" }));
  });

  it("highlights the currently selected coordinate", () => {
    render(
      <ReportExcelTemplateGrid
        sheet={sheet({ cells: [cell({ coordinate: "A1", row: 1, column: 1 })] })}
        styles={STYLES}
        selectedCoordinate="A1"
        onSelectCell={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Celda A1").getAttribute("aria-pressed")).toBe("true");
  });

  it("shows an image/chart marker on the drawing's anchor cell", () => {
    render(
      <ReportExcelTemplateGrid
        sheet={sheet({ drawings: [{ type: "image", anchor: "A1", end: null, x_emu: null, y_emu: null, width_emu: null, height_emu: null }] })}
        styles={STYLES}
        selectedCoordinate={null}
        onSelectCell={vi.fn()}
      />,
    );

    expect(screen.getByText("Imagen")).toBeTruthy();
  });

  it("keeps drawings visible beyond used_range and inside a merged region", () => {
    render(
      <ReportExcelTemplateGrid
        sheet={sheet({
          used_range: "A1:B1",
          cells: [
            cell({ merged_range: "A1:B1", merge_anchor: "A1" }),
            cell({ coordinate: "B1", column: 2, merged_range: "A1:B1", merge_anchor: "A1" }),
          ],
          drawings: [
            { type: "image", anchor: "B1", end: null, x_emu: null, y_emu: null, width_emu: null, height_emu: null },
            { type: "chart", anchor: "E5", end: null, x_emu: null, y_emu: null, width_emu: null, height_emu: null },
          ],
        })}
        styles={STYLES}
        selectedCoordinate={null}
        onSelectCell={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Celda A1").textContent).toContain("Imagen");
    expect(screen.queryByLabelText("Celda B1")).toBeNull();
    expect(screen.getByLabelText("Celda E5").textContent).toContain("Gráfica");
  });

  it("applies column widths, row heights and the backend style catalog", () => {
    render(
      <ReportExcelTemplateGrid
        sheet={sheet({ column_widths: { A: 20 }, row_heights: { "1": 30 }, cells: [cell()] })}
        styles={{ "0": { bold: true, italic: true, font_size: 14, horizontal_alignment: "center", vertical_alignment: "center", wrap_text: true, fill_rgb: "#ABCDEF", font_rgb: "#123456", borders: { bottom: "thin" }, number_format: "General" } }}
        selectedCoordinate={null}
        onSelectCell={vi.fn()}
      />,
    );
    const target = screen.getByLabelText("Celda A1");
    expect(target.style.fontWeight).toBe("bold");
    expect(target.style.backgroundColor).toBe("rgb(171, 205, 239)");
    expect(target.style.textAlign).toBe("center");
    expect(target.style.borderBottomWidth).toBe("2px");
    expect(target.parentElement?.style.height).toBe("40px");
    expect(screen.getByText("A").style.width).toBe("145px");
    expect(target.closest("table")?.style.width).toBe("313px");
  });

  it("shows a friendly badge instead of the raw placeholder for a mapped cell", () => {
    render(
      <ReportExcelTemplateGrid
        sheet={sheet({ cells: [cell({ coordinate: "B2", row: 2, column: 2, value: "{{parameters.customer_name}}", placeholders: ["{{parameters.customer_name}}"] })] })}
        styles={STYLES}
        selectedCoordinate={null}
        onSelectCell={vi.fn()}
        overlays={new Map([["B2", { kind: "mapped", label: "Cliente", abbreviation: "P", technical: "{{parameters.customer_name}}", dirty: false }]])}
      />,
    );

    expect(screen.getByText("Cliente")).toBeTruthy();
    expect(screen.queryByText("{{parameters.customer_name}}")).toBeNull();
  });

  it("shows a formula indicator and never an overlay badge on a formula cell", () => {
    render(
      <ReportExcelTemplateGrid
        sheet={sheet({ cells: [cell({ coordinate: "C3", value_type: "formula", formula: "=A1+A2" })] })}
        styles={STYLES}
        selectedCoordinate={null}
        onSelectCell={vi.fn()}
      />,
    );

    expect(screen.getByTitle("Celda con fórmula: no se puede mapear desde el editor visual.")).toBeTruthy();
  });

  it("rings a cell the backend just rejected", () => {
    render(
      <ReportExcelTemplateGrid
        sheet={sheet({ cells: [cell({ coordinate: "A1" })] })}
        styles={STYLES}
        selectedCoordinate={null}
        onSelectCell={vi.fn()}
        errorCoordinates={new Set(["A1"])}
      />,
    );

    expect(screen.getByLabelText("Celda A1").className).toContain("ring-destructive");
  });

  it("tints the repeatable row's header", () => {
    render(
      <ReportExcelTemplateGrid
        sheet={sheet({ cells: [cell({ coordinate: "A1" })] })}
        styles={STYLES}
        selectedCoordinate={null}
        onSelectCell={vi.fn()}
        repeatableRow={1}
      />,
    );

    expect(screen.getByText("1").className).toContain("bg-amber-500/20");
  });
});
