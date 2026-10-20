import { describe, expect, it } from "vitest";
import {
  estimateDiscountedUnitPrice,
  estimateLineAmount,
  evaluateFormula,
  lineAmountColumn,
} from "@/lib/reports/report-line-estimate";
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

describe("estimateDiscountedUnitPrice", () => {
  it.each([
    ["0", 125],
    ["5", 118.75],
    ["10", 112.5],
    ["50", 62.5],
    ["100", 0],
  ])("applies an individual %s%% discount", (discount, expected) => {
    expect(estimateDiscountedUnitPrice(PRODUCT, discount)).toBe(expected);
  });

  it("returns null for missing, negative, over-100 or invalid discounts", () => {
    expect(estimateDiscountedUnitPrice(null, "10")).toBeNull();
    expect(estimateDiscountedUnitPrice(PRODUCT, "")).toBeNull();
    expect(estimateDiscountedUnitPrice(PRODUCT, "-0.01")).toBeNull();
    expect(estimateDiscountedUnitPrice(PRODUCT, "100.01")).toBeNull();
    expect(estimateDiscountedUnitPrice(PRODUCT, "invalid")).toBeNull();
  });
});

describe("manual lines (MANUAL_PRODUCT)", () => {
  /** The definitive quotation: `line.unit_price` resolves list and manual lines. */
  const QUOTATION = {
    columns: [
      column("unit_price", { source_field: "line.unit_price" }),
      column("quantity", { column_type: "PARAMETER", source_parameter: "items.quantity", data_type: "integer" }),
      column("discount", { column_type: "PARAMETER", source_parameter: "items.discount" }),
      column("discounted", { column_type: "FORMULA", formula_definition: "ROUND(unit_price * (1 - discount / 100), 2)" }),
      column("line_total", { column_type: "FORMULA", formula_definition: "ROUND(quantity * discounted, 2)" }),
    ],
    summaries: [SUM("line_total")],
  };
  const lineEstimate = (row: Record<string, string>, product: ReportProductOption | null, manual: { unit_price: string } | null) =>
    estimateLineAmount({ ...QUOTATION, groupName: "items", row, scalars: {}, product, manual });

  it("prices a manual line from the captured price", () => {
    expect(lineEstimate({ quantity: "3", discount: "33.33" }, null, { unit_price: "99.99" })).toBe(199.98);
    expect(lineEstimate({ quantity: "1", discount: "100" }, null, { unit_price: "800" })).toBe(0);
  });

  it("prices a list line from the list through line.unit_price", () => {
    expect(lineEstimate({ quantity: "2", discount: "10" }, PRODUCT, null)).toBe(225);
  });

  it("stays unknown until the manual price is captured", () => {
    expect(lineEstimate({ quantity: "2", discount: "0" }, null, { unit_price: "" })).toBeNull();
    expect(lineEstimate({ quantity: "2", discount: "0" }, null, null)).toBeNull();
  });

  it("never gives a manual line a list price", () => {
    const listPriced = { ...QUOTATION, columns: QUOTATION.columns.map((item) => item.key === "unit_price" ? { ...item, source_field: "price_list_item.unit_price" } : item) };
    expect(estimateLineAmount({ ...listPriced, groupName: "items", row: { quantity: "1", discount: "0" }, scalars: {}, product: null, manual: { unit_price: "50" } })).toBeNull();
  });

  it("estimates the discounted price of a manual line", () => {
    expect(estimateDiscountedUnitPrice({ unit_price: "800.00" }, "15")).toBe(680);
    expect(estimateDiscountedUnitPrice({ unit_price: "" }, "15")).toBeNull();
    expect(estimateDiscountedUnitPrice({ unit_price: "-1" }, "15")).toBeNull();
  });
});
