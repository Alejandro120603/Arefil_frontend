import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AREFIL_DATA_SOURCE_NAME,
  AREFIL_REPORT_BINDINGS,
  PRICE_LIST_COMPARISON_REFERENCE_URL,
  toArefilReportData,
} from "./stimulsoft-dataset";
import type { ComparisonStatus, PriceListComparisonItem, PriceListComparisonResponse } from "@/types/api";

function makeItem(overrides: Partial<PriceListComparisonItem> & { status: ComparisonStatus }): PriceListComparisonItem {
  return {
    product_id: 1,
    part_number: "P1",
    item_number: null,
    description: null,
    price_a_cents: null,
    price_a: null,
    price_b_cents: null,
    price_b: null,
    absolute_change_cents: null,
    absolute_change: null,
    percentage_change: null,
    classification_a: null,
    classification_b: null,
    ...overrides,
  };
}

/**
 * The dataset from the Frontend #8 acceptance run, plus the two edge rows the
 * issue calls out by name: `P-ZERO` (A was exactly 0, so the backend cannot
 * produce a percentage) and the NEW/REMOVED pair.
 */
const COMPARISON: PriceListComparisonResponse = {
  report: { code: "PRICE_LIST_COMPARISON", generated_at: "2026-08-24T16:30:00Z" },
  supplier: { id: 1, code: "DONALDSON", name: "Donaldson" },
  list_a: { id: 7, effective_date: "2025-10-20", currency: "MXN", source_filename: "a.xlsx" },
  list_b: { id: 9, effective_date: "2026-01-15", currency: "MXN", source_filename: "b.xlsx" },
  summary: {
    total_products: 4,
    increased: 2,
    decreased: 0,
    unchanged: 0,
    new: 1,
    removed: 1,
    average_percentage_change: "10.00",
  },
  items: [
    makeItem({
      product_id: 1,
      part_number: "P-INC",
      description: "Filtro de aire",
      status: "INCREASED",
      price_a: "100.00",
      price_b: "110.00",
      absolute_change: "10.00",
      percentage_change: "10.00",
    }),
    makeItem({
      product_id: 2,
      part_number: "P-ZERO",
      status: "INCREASED",
      price_a: "0.00",
      price_b: "25.00",
      absolute_change: "25.00",
      percentage_change: null,
    }),
    makeItem({ product_id: 3, part_number: "P-GONE", status: "REMOVED", price_a: "400.00" }),
    makeItem({ product_id: 4, part_number: "P-NEW", status: "NEW", price_b: "75.50" }),
  ],
};

const data = toArefilReportData(COMPARISON);
const [pInc, pZero, pGone, pNew] = data.items;

describe("toArefilReportData", () => {
  it("keeps the six top-level sections of the backend contract", () => {
    expect(Object.keys(data)).toEqual(["report", "supplier", "list_a", "list_b", "summary", "items"]);
  });

  it("wraps the singleton sections in one-row tables for DataSet.readJson", () => {
    expect(data.report).toHaveLength(1);
    expect(data.supplier).toHaveLength(1);
    expect(data.list_a).toHaveLength(1);
    expect(data.list_b).toHaveLength(1);
    expect(data.summary).toHaveLength(1);
  });

  it("copies the supplier and both lists verbatim", () => {
    expect(data.supplier[0]).toEqual(COMPARISON.supplier);
    expect(data.list_a[0]).toMatchObject({ id: 7, effective_date: "2025-10-20", currency: "MXN", source_filename: "a.xlsx" });
    expect(data.list_b[0]).toMatchObject({ id: 9, effective_date: "2026-01-15", currency: "MXN", source_filename: "b.xlsx" });
    expect(data.report[0]).toMatchObject({ code: "PRICE_LIST_COMPARISON", generated_at: "2026-08-24T16:30:00Z" });
  });

  it("carries the summary through without recomputing a single count", () => {
    expect(data.summary[0]).toMatchObject({
      total_products: 4,
      increased: 2,
      decreased: 0,
      unchanged: 0,
      new: 1,
      removed: 1,
      average_percentage_change: "10.00",
      average_percentage_change_display: "+10.00%",
    });
  });

  it("shows the placeholder when no row had a comparable percentage", () => {
    const withoutAverage = toArefilReportData({
      ...COMPARISON,
      summary: { ...COMPARISON.summary, average_percentage_change: null },
    });
    expect(withoutAverage.summary[0].average_percentage_change_display).toBe("—");
  });

  it("keeps every raw item field alongside the formatted ones", () => {
    expect(pInc).toMatchObject(COMPARISON.items[0]);
  });

  it("formats a normal increase as money and a signed percentage", () => {
    expect(pInc.price_a_display).toBe("$100.00");
    expect(pInc.price_b_display).toBe("$110.00");
    expect(pInc.absolute_change_display).toBe("+$10.00");
    expect(pInc.percentage_change_display).toBe("+10.00%");
    expect(pInc.status_label).toBe("Aumentó");
    expect(pInc.description_display).toBe("Filtro de aire");
  });

  it("never invents a percentage for a price A of exactly zero", () => {
    expect(pZero.price_a_display).toBe("$0.00");
    expect(pZero.price_b_display).toBe("$25.00");
    expect(pZero.absolute_change_display).toBe("+$25.00");
    expect(pZero.percentage_change_display).toBe("—");
  });

  it("renders REMOVED without a B price and NEW without an A price", () => {
    expect(pGone).toMatchObject({
      price_a_display: "$400.00",
      price_b_display: "—",
      absolute_change_display: "—",
      percentage_change_display: "—",
      status_label: "Retirado",
    });
    expect(pNew).toMatchObject({
      price_a_display: "—",
      price_b_display: "$75.50",
      absolute_change_display: "—",
      percentage_change_display: "—",
      status_label: "Nuevo",
    });
  });

  it("replaces a missing description with the placeholder", () => {
    expect(pNew.description_display).toBe("—");
  });

  it("never emits NaN, Infinity, null or undefined into a display field", () => {
    const forbidden = /NaN|Infinity|null|undefined/;
    for (const item of data.items) {
      for (const [field, value] of Object.entries(item)) {
        if (!field.endsWith("_display") && field !== "status_label") continue;
        expect(typeof value).toBe("string");
        expect(String(value)).not.toMatch(forbidden);
      }
    }
    expect(data.summary[0].average_percentage_change_display).not.toMatch(forbidden);
  });

  it("survives an empty comparison", () => {
    const empty = toArefilReportData({ ...COMPARISON, items: [] });
    expect(empty.items).toEqual([]);
    expect(empty.summary).toHaveLength(1);
  });
});

/**
 * `price-list-comparison.mrt` is generated by
 * `scripts/build-price-list-comparison-mrt.mjs` and committed. These assertions
 * are what stops the committed template and the adapter from drifting apart -
 * a renamed field would otherwise only show up as a blank column in the PDF.
 */
describe("price-list-comparison.mrt", () => {
  const template = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../../public/reports/price-list-comparison.mrt", import.meta.url)), "utf8"),
  );
  const dataSources = Object.values(template.Dictionary.DataSources) as {
    Name: string;
    NameInSource: string;
    Columns: Record<string, { Name: string }>;
  }[];
  const serialized = JSON.stringify(template);

  it("keeps the compatibility reference at its established public path", () => {
    expect(PRICE_LIST_COMPARISON_REFERENCE_URL).toBe("/reports/price-list-comparison.mrt");
  });

  it("declares one data source per section of ArefilReportData", () => {
    expect(dataSources.map((source) => source.Name).sort()).toEqual(
      Object.keys(AREFIL_REPORT_BINDINGS).sort(),
    );
    for (const source of dataSources) {
      expect(source.NameInSource).toBe(`${AREFIL_DATA_SOURCE_NAME}.${source.Name}`);
    }
  });

  it("declares exactly the columns the adapter produces", () => {
    for (const source of dataSources) {
      const declared = Object.values(source.Columns).map((column) => column.Name);
      const expected = AREFIL_REPORT_BINDINGS[source.Name as keyof typeof AREFIL_REPORT_BINDINGS];
      expect(new Set(declared)).toEqual(new Set(expected));
    }
  });

  it("ships without a data connection so the browser can register the live one", () => {
    expect(template.Dictionary.Databases).toBeUndefined();
  });

  it("binds the seven detail columns and the seven summary tiles", () => {
    for (const field of [
      "part_number",
      "description_display",
      "price_a_display",
      "price_b_display",
      "absolute_change_display",
      "percentage_change_display",
      "status_label",
    ]) {
      expect(serialized).toContain(`{items.${field}}`);
    }
    for (const field of ["total_products", "increased", "decreased", "unchanged", "new", "removed", "average_percentage_change_display"]) {
      expect(serialized).toContain(`{summary.${field}}`);
    }
  });

  it("prints the header fields the report is required to carry", () => {
    expect(serialized).toContain("AREFIL");
    expect(serialized).toContain("Comparación de listas de precios");
    expect(serialized).toContain("{supplier.name}");
    expect(serialized).toContain("{list_a.effective_date_display}");
    expect(serialized).toContain("{list_a.source_filename}");
    expect(serialized).toContain("{list_b.effective_date_display}");
    expect(serialized).toContain("{list_b.source_filename}");
    expect(serialized).toContain("{list_b.currency}");
    expect(serialized).toContain("{report.generated_at_display}");
  });

  it("does no arithmetic of its own - the backend owns every number", () => {
    // Stimulsoft aggregates would silently recompute what Backend #9 already
    // decided; none of them may appear in the template.
    expect(serialized).not.toMatch(/\{(Sum|Count|Avg|Min|Max)\(/);
  });
});
