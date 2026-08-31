import { describe, expect, it } from "vitest";
import {
  documentDatasetSample,
  documentDatasetSchema,
  templateFilename,
  templateStatus,
} from "./report-document";
import type { ReportColumn, ReportParameter, ReportSummaryConfiguration, ReportTemplate } from "@/types/api";

const PARAMETERS: ReportParameter[] = [
  { name: "customer_name", label: "Cliente", data_type: "string", input_type: "text", required: true, default_value: null, display_order: 1, configuration_json: null },
  { name: "price_list_id", label: "Lista de precios", data_type: "integer", input_type: "select", required: true, default_value: null, display_order: 0, configuration_json: { options_source: "price_lists" } },
];

function column(overrides: Partial<ReportColumn> & Pick<ReportColumn, "key" | "label">): ReportColumn {
  return {
    column_type: "FIELD", source_field: "product.part_number", source_parameter: null, formula_definition: null,
    data_type: "string", format_type: "text", display_order: 0, visible: true, width: null,
    ...overrides,
  };
}

const COLUMNS: ReportColumn[] = [
  column({ key: "line_total", label: "Precio Total", data_type: "decimal", format_type: "currency", display_order: 2, column_type: "FORMULA", source_field: null, formula_definition: "quantity * unit_price" }),
  column({ key: "part_number", label: "No. Parte", display_order: 0 }),
  column({ key: "internal_cost", label: "Costo", data_type: "decimal", display_order: 1, visible: false }),
];

const SUMMARIES: ReportSummaryConfiguration[] = [
  { key: "subtotal", label: "Subtotal", column_key: "line_total", operation: "SUM", formula_definition: null, format_type: "currency" },
  { key: "tax", label: "IVA", column_key: null, operation: "FORMULA", formula_definition: "subtotal * tax_rate / 100", format_type: "currency" },
];

const TEMPLATE: ReportTemplate = {
  format: "mrt", content: "{}", version: 3, active: true,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
};

describe("report document contract", () => {
  it("describes every bindable field in reading order and hides invisible columns", () => {
    expect(documentDatasetSchema(PARAMETERS, COLUMNS, SUMMARIES).map((field) => field.path)).toEqual([
      "report.code", "report.name", "report.generated_at",
      "parameters.price_list_id", "parameters.customer_name",
      "rows.part_number", "rows.line_total",
      "summary.subtotal", "summary.tax",
    ]);
    expect(documentDatasetSchema(PARAMETERS, COLUMNS, SUMMARIES).find((field) => field.path === "summary.tax")).toMatchObject({
      label: "IVA", section: "Resúmenes", data_type: "decimal",
    });
  });

  it("fills a sample of the same contract, without the invisible column", () => {
    const sample = documentDatasetSample({ code: "COTIZACION", name: "Cotización" }, PARAMETERS, COLUMNS, SUMMARIES);
    expect(sample.report).toEqual({ code: "COTIZACION", name: "Cotización", generated_at: "2026-01-31T12:00:00Z" });
    expect(sample.parameters).toEqual({ price_list_id: 1, customer_name: "Texto de ejemplo" });
    expect(sample.rows).toHaveLength(2);
    expect(Object.keys(sample.rows[0])).toEqual(["part_number", "line_total"]);
    expect(sample.summary).toEqual({ subtotal: "574.13", tax: "1148.26" });
  });

  it("reports the template state the designer header shows", () => {
    expect(templateStatus(null, false)).toBe("missing");
    expect(templateStatus(TEMPLATE, false)).toBe("configured");
    expect(templateStatus(TEMPLATE, true)).toBe("dirty");
    expect(templateStatus(null, true)).toBe("dirty");
    expect(templateFilename("COTIZACION_2026", "mrt")).toBe("cotizacion-2026.mrt");
  });
});
