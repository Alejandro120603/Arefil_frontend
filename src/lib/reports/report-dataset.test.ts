import { describe, expect, it } from "vitest";
import { adaptReportDataset, ReportDatasetAdapterError } from "./report-dataset";
import type { PriceListComparisonResponse, ReportDefinition } from "@/types/api";

const BASE: ReportDefinition = {
  code: "PRODUCT_CATALOG",
  name: "Catálogo de productos",
  description: "Productos activos",
  category: "Catálogo",
  enabled: true,
  data_source_type: "SQL_QUERY",
  active_template_version: 1,
  parameters: [],
  created_at: "2026-08-26T12:00:00Z",
  updated_at: "2026-08-26T12:00:00Z",
};

describe("generic Stimulsoft dataset adapters", () => {
  it("registers SQL_QUERY data under the stable report/parameters/rows convention", () => {
    const adapted = adaptReportDataset(BASE, { supplier_id: 3 }, {
      columns: ["id", "part_number"],
      rows: [{ id: 1, part_number: "P-1" }],
      row_count: 1,
    });
    expect(adapted).toEqual({
      rowCount: 1,
      data: {
        report: [{
          code: "PRODUCT_CATALOG",
          name: "Catálogo de productos",
          description: "Productos activos",
          category: "Catálogo",
          data_source_type: "SQL_QUERY",
        }],
        parameters: [{ supplier_id: 3 }],
        rows: [{ id: 1, part_number: "P-1" }],
      },
    });
  });

  it("preserves the established A/B adapter for the allow-listed handler", () => {
    const comparison: PriceListComparisonResponse = {
      report: { code: "PRICE_LIST_COMPARISON", generated_at: "2026-08-26T12:00:00Z" },
      supplier: { id: 1, code: "DONALDSON", name: "Donaldson" },
      list_a: { id: 1, effective_date: "2026-01-01", currency: "MXN", source_filename: "a.xlsx" },
      list_b: { id: 2, effective_date: "2026-02-01", currency: "MXN", source_filename: "b.xlsx" },
      summary: { total_products: 0, increased: 0, decreased: 0, unchanged: 0, new: 0, removed: 0, average_percentage_change: null },
      items: [],
    };
    const adapted = adaptReportDataset({ ...BASE, code: "PRICE_LIST_COMPARISON", data_source_type: "HANDLER" }, {}, comparison);
    expect(adapted.rowCount).toBe(0);
    expect(adapted.data).toMatchObject({ report: [{ code: "PRICE_LIST_COMPARISON" }], items: [] });
  });

  it("refuses arbitrary handlers instead of resolving user-controlled imports", () => {
    expect(() => adaptReportDataset({ ...BASE, code: "UNKNOWN", data_source_type: "HANDLER" }, {}, {}))
      .toThrow(ReportDatasetAdapterError);
  });
});
