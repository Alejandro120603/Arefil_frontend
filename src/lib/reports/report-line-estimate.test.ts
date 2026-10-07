import { describe, expect, it } from "vitest";
import { estimateLineAmount, evaluateFormula, lineAmountColumn } from "@/lib/reports/report-line-estimate";
import type { ReportColumn, ReportProductOption, ReportSummaryConfiguration } from "@/types/api";

function column(key: string, overrides: Partial<ReportColumn>): ReportColumn {
  return {
    key, label: key, column_type: "FIELD", source_field: null, source_parameter: null, formula_definition: null,
    data_type: "decimal", format_type: "currency", display_order: 0, visible: true, width: null, ...overrides,
  };
}
const SUM = (columnKey: string): ReportSummaryConfiguration => ({
  key: "subtotal", label: "Subtotal", column_key: columnKey, operation: "SUM", formula_definition: null, format_type: "currency",
});
const PRODUCT: ReportProductOption = {
  value: 1, label: "SMK-001", product_id: 1, part_number: "SMK-001", item_number: null, description: "Filtro",
  unit_price: "125.00", currency: "USD", classification: null,
};

/** The wizard-built quotation of the smoke test: `unit_price * cantidad`. */
const SMOKE = {
  columns: [
    column("part_number", { source_field: "product.part_number", data_type: "string" }),
    column("unit_price", { source_field: "price_list_item.unit_price" }),
    column("cantidad", { column_type: "PARAMETER", source_parameter: "productos.cantidad", data_type: "integer" }),
    column("calculo", { column_type: "FORMULA", formula_definition: "unit_price * cantidad" }),
  ],
  summaries: [SUM("calculo")],
};

function estimate(row: Record<string, string>, overrides: Partial<typeof SMOKE> = {}, product: ReportProductOption | null = PRODUCT) {
  return estimateLineAmount({ ...SMOKE, ...overrides, groupName: "productos", row, scalars: {}, product });
}

describe("evaluateFormula — mirrors the backend grammar", () => {
  const values: Record<string, number | null> = { a: 2, b: 3, empty: null };
  const resolve = (name: string) => values[name] ?? null;

  it("respects precedence, unary signs, parentheses and modulo", () => {
    expect(evaluateFormula("a + b * 2", resolve)).toBe(8);
    expect(evaluateFormula("-(a + b) * 2", resolve)).toBe(-10);
    expect(evaluateFormula("7 % b", resolve)).toBe(1);
  });

  it("rounds half up like Decimal ROUND_HALF_UP", () => {
    expect(evaluateFormula("ROUND(2.675, 2)", resolve)).toBe(2.68);
    expect(evaluateFormula("ROUND(-2.5)", resolve)).toBe(-3);
    expect(evaluateFormula("ROUND(1234, -2)", resolve)).toBe(1200);
  });

  it("propagates a missing value and never throws", () => {
    expect(evaluateFormula("a * empty", resolve)).toBeNull();
    expect(evaluateFormula("a / 0", resolve)).toBeNull();
    expect(evaluateFormula("MAX(a, b)", resolve)).toBeNull();
    expect(evaluateFormula("a +", resolve)).toBeNull();
  });
});

describe("estimateLineAmount", () => {
  it("I: evaluates the report's own line formula with the product price", () => {
    expect(estimate({ cantidad: "2" })).toBe(250);
  });

  it("J: follows the quantity", () => {
    expect(estimate({ cantidad: "3" })).toBe(375);
  });

  it("uses the summed column as the line amount", () => {
    expect(lineAmountColumn(SMOKE.columns, SMOKE.summaries)?.key).toBe("calculo");
    expect(lineAmountColumn(SMOKE.columns, [])).toBeNull();
  });

  it("L: answers null without a product, a quantity, or a value the browser cannot know", () => {
    expect(estimate({ cantidad: "2" }, {}, null)).toBeNull();
    expect(estimate({ cantidad: "" })).toBeNull();
    expect(estimate({ cantidad: "abc" })).toBeNull();
    const unknownField = SMOKE.columns.map((item) => item.key === "unit_price"
      ? { ...item, source_field: "price_list_item.unit_weight_kg" }
      : item);
    expect(estimate({ cantidad: "2" }, { columns: unknownField })).toBeNull();
  });

  it("applies a discount only when the report's formula does", () => {
    const withDiscount = [
      ...SMOKE.columns.filter((item) => item.key !== "calculo"),
      column("descuento", { column_type: "PARAMETER", source_parameter: "productos.descuento" }),
      column("calculo", { column_type: "FORMULA", formula_definition: "ROUND(unit_price * cantidad - descuento, 2)" }),
    ];
    expect(estimate({ cantidad: "2", descuento: "10" }, { columns: withDiscount })).toBe(240);
    expect(estimate({ cantidad: "2", descuento: "10" })).toBe(250);
  });

  it("refuses a formula cycle instead of recursing forever", () => {
    const cyclic = [column("x", { column_type: "FORMULA", formula_definition: "y" }), column("y", { column_type: "FORMULA", formula_definition: "x" })];
    expect(estimate({}, { columns: cyclic, summaries: [SUM("x")] })).toBeNull();
  });
});
