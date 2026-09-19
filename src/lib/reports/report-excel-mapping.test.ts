import { describe, expect, it } from "vitest";
import {
  buildCellOverlays,
  buildMappingFieldGroups,
  effectivePlaceholder,
  indexMappingOptions,
  pendingKey,
  primaryRepeatableRow,
  repeatableRows,
  savedPlaceholderOf,
  splitPendingKey,
  type PendingCellChange,
} from "./report-excel-mapping";
import type {
  ReportBuilderDefinition,
  ReportWorkbookCellInspection,
  ReportWorkbookSheetInspection,
} from "@/types/api";

const BUILDER = {
  report: {
    parameters: [
      { name: "customer_name", label: "Cliente", data_type: "string", input_type: "text", required: true, default_value: null, display_order: 1, configuration_json: null },
      { name: "quote_date", label: "Fecha", data_type: "date", input_type: "date", required: true, default_value: null, display_order: 0, configuration_json: null },
    ],
  },
  columns: [
    { key: "part_number", label: "No. Parte", column_type: "FIELD", source_field: "product.part_number", source_parameter: null, formula_definition: null, data_type: "string", format_type: "text", display_order: 0, visible: true, width: null },
    { key: "internal_note", label: "Nota interna", column_type: "FIELD", source_field: "product.note", source_parameter: null, formula_definition: null, data_type: "string", format_type: "text", display_order: 1, visible: false, width: null },
  ],
  parameter_groups: [],
  excel_layout: {
    sheet_name: "Cotización", title: null, show_report_name: true, show_generated_at: true,
    show_parameters: true, freeze_header: true, header_row: 1,
    totals: [{ key: "subtotal", label: "Subtotal", column_key: "part_number", operation: "SUM", formula_definition: null, format_type: "currency" }],
  },
} as unknown as ReportBuilderDefinition;

function cell(overrides: Partial<ReportWorkbookCellInspection> = {}): ReportWorkbookCellInspection {
  return {
    coordinate: "A1", row: 1, column: 1, value: null, value_type: "empty", formula: null,
    placeholders: [], style_id: 0, number_format: "General", merged_range: null, merge_anchor: null,
    ...overrides,
  };
}

function sheet(overrides: Partial<ReportWorkbookSheetInspection> = {}): ReportWorkbookSheetInspection {
  return {
    name: "Cotización", index: 0, hidden: false, state: "visible", max_row: 10, max_column: 5,
    used_range: "A1:E10", merged_ranges: [], row_heights: {}, column_widths: {},
    default_row_height: null, default_column_width: null, cells: [], drawings: [],
    ...overrides,
  };
}

describe("buildMappingFieldGroups", () => {
  it("derives groups from the report's own builder contract, not a hardcoded report", () => {
    const groups = buildMappingFieldGroups(BUILDER);
    const byNamespace = Object.fromEntries(groups.map((group) => [group.namespace, group]));

    expect(byNamespace.report.options.map((o) => o.placeholder)).toContain("report.name");
    expect(byNamespace.parameters.options.map((o) => o.key)).toEqual(["quote_date", "customer_name"]);
    expect(byNamespace.rows.options.map((o) => o.key)).toEqual(["row_number", "part_number"]);
    expect(byNamespace.summary.options).toEqual([
      { namespace: "summary", key: "subtotal", label: "Subtotal", abbreviation: "Σ", placeholder: "summary.subtotal" },
    ]);
  });

  it("omits the parameters/summary groups when the report has none", () => {
    const groups = buildMappingFieldGroups({
      ...BUILDER,
      report: { parameters: [] },
      excel_layout: null,
    } as unknown as ReportBuilderDefinition);

    expect(groups.map((g) => g.namespace)).toEqual(["report", "rows"]);
  });

  it("never duplicates rows.row_number when the report exposes it as a column", () => {
    const groups = buildMappingFieldGroups({
      ...BUILDER,
      columns: [
        { key: "row_number", label: "Número de renglón", column_type: "FIELD", source_field: "system.row_number", source_parameter: null, formula_definition: null, data_type: "integer", format_type: "number", display_order: 0, visible: true, width: null },
        ...(BUILDER as unknown as { columns: unknown[] }).columns,
      ],
    } as unknown as ReportBuilderDefinition);
    const rows = groups.find((g) => g.namespace === "rows")!;
    const placeholders = rows.options.map((o) => o.placeholder);

    expect(placeholders.filter((p) => p === "rows.row_number")).toHaveLength(1);
    expect(new Set(placeholders).size).toBe(placeholders.length);
    expect(rows.options.find((o) => o.key === "row_number")?.label).toBe("Número de renglón");
  });

  it("only offers visible columns as row fields, never hidden ones", () => {
    const groups = buildMappingFieldGroups(BUILDER);
    const rows = groups.find((g) => g.namespace === "rows")!;
    expect(rows.options.some((o) => o.key === "internal_note")).toBe(false);
  });

  it("labels a legacy SUM total from the column it pins, since it has no label of its own", () => {
    const groups = buildMappingFieldGroups({
      ...BUILDER,
      excel_layout: { ...BUILDER.excel_layout, totals: [{ column_key: "part_number", operation: "SUM" }] },
    } as unknown as ReportBuilderDefinition);
    const summary = groups.find((g) => g.namespace === "summary")!;
    expect(summary.options[0]).toMatchObject({ key: "part_number", label: "Suma de No. Parte" });
  });
});

describe("indexMappingOptions", () => {
  it("indexes every option of every group by its placeholder", () => {
    const index = indexMappingOptions(buildMappingFieldGroups(BUILDER));
    expect(index.get("parameters.customer_name")?.label).toBe("Cliente");
    expect(index.get("rows.row_number")?.label).toBe("Número de renglón (Item)");
  });
});

describe("pendingKey / splitPendingKey", () => {
  it("round-trips a sheet and cell through the key", () => {
    expect(splitPendingKey(pendingKey("Cotización", "B4"))).toEqual({ sheet: "Cotización", cell: "B4" });
  });
});

describe("savedPlaceholderOf / effectivePlaceholder", () => {
  it("only recognizes a placeholder that is the cell's entire value", () => {
    const clean = cell({ coordinate: "B2", value: "{{parameters.customer_name}}", placeholders: ["{{parameters.customer_name}}"] });
    const embedded = cell({ coordinate: "B3", value: "Total: {{summary.total}}", placeholders: ["{{summary.total}}"] });
    expect(savedPlaceholderOf(clean)).toBe("parameters.customer_name");
    expect(savedPlaceholderOf(embedded)).toBeNull();
  });

  it("prefers a pending change over the saved value", () => {
    const saved = cell({ coordinate: "B2", value: "{{parameters.customer_name}}", placeholders: ["{{parameters.customer_name}}"] });
    const pending = new Map<string, PendingCellChange>([[pendingKey("Cotización", "B2"), { kind: "clear" }]]);
    expect(effectivePlaceholder(saved, pending, "Cotización")).toBeNull();
    expect(effectivePlaceholder(saved, new Map(), "Cotización")).toBe("parameters.customer_name");
  });
});

describe("repeatableRows / primaryRepeatableRow", () => {
  it("finds the row already carrying a saved rows.* placeholder", () => {
    const rowsSheet = sheet({
      cells: [cell({ coordinate: "A13", row: 13, value: "{{rows.part_number}}", placeholders: ["{{rows.part_number}}"] })],
    });
    expect(repeatableRows(rowsSheet, new Map())).toEqual(new Set([13]));
    expect(primaryRepeatableRow(rowsSheet, new Map())).toBe(13);
  });

  it("returns null when nothing is mapped yet", () => {
    expect(primaryRepeatableRow(sheet(), new Map())).toBeNull();
  });

  it("counts a pending rows.* mapping on a blank cell the backend never sent", () => {
    const pending = new Map<string, PendingCellChange>([
      [pendingKey("Cotización", "C13"), { kind: "map", placeholder: "rows.part_number" }],
    ]);
    expect(primaryRepeatableRow(sheet(), pending)).toBe(13);
  });

  it("stops counting a row once its mapping is pending-cleared", () => {
    const rowsSheet = sheet({
      cells: [cell({ coordinate: "A13", row: 13, value: "{{rows.part_number}}", placeholders: ["{{rows.part_number}}"] })],
    });
    const pending = new Map<string, PendingCellChange>([[pendingKey("Cotización", "A13"), { kind: "clear" }]]);
    expect(primaryRepeatableRow(rowsSheet, pending)).toBeNull();
  });

  it("surfaces two rows at once so the mapper can block the save", () => {
    const rowsSheet = sheet({
      cells: [
        cell({ coordinate: "A13", row: 13, value: "{{rows.part_number}}", placeholders: ["{{rows.part_number}}"] }),
        cell({ coordinate: "A20", row: 20, value: "{{rows.row_number}}", placeholders: ["{{rows.row_number}}"] }),
      ],
    });
    expect(repeatableRows(rowsSheet, new Map())).toEqual(new Set([13, 20]));
  });
});

describe("buildCellOverlays", () => {
  const options = indexMappingOptions(buildMappingFieldGroups(BUILDER));

  it("shows a friendly, saved-and-not-dirty badge for an already mapped cell", () => {
    const mappedSheet = sheet({
      cells: [cell({ coordinate: "B2", value: "{{parameters.customer_name}}", placeholders: ["{{parameters.customer_name}}"] })],
    });
    const overlays = buildCellOverlays(mappedSheet, new Map(), options);
    expect(overlays.get("B2")).toEqual({
      kind: "mapped", label: "Cliente", abbreviation: "P", technical: "{{parameters.customer_name}}", dirty: false,
    });
  });

  it("shows a dirty badge for a pending mapping, overriding the saved one", () => {
    const mappedSheet = sheet({
      cells: [cell({ coordinate: "B2", value: "{{parameters.customer_name}}", placeholders: ["{{parameters.customer_name}}"] })],
    });
    const pending = new Map<string, PendingCellChange>([[pendingKey("Cotización", "B2"), { kind: "map", placeholder: "rows.part_number" }]]);
    expect(buildCellOverlays(mappedSheet, pending, options).get("B2")).toMatchObject({ kind: "mapped", label: "No. Parte", dirty: true });
  });

  it("shows a cleared badge for a pending clear on a blank cell not sent by the backend", () => {
    const pending = new Map<string, PendingCellChange>([[pendingKey("Cotización", "C13"), { kind: "map", placeholder: "rows.part_number" }]]);
    expect(buildCellOverlays(sheet(), pending, options).get("C13")).toMatchObject({ kind: "mapped", dirty: true });
  });

  it("omits cells with neither a saved nor a pending mapping", () => {
    const plainSheet = sheet({ cells: [cell({ coordinate: "A4", value: "Cliente:", value_type: "text" })] });
    expect(buildCellOverlays(plainSheet, new Map(), options).has("A4")).toBe(false);
  });
});
