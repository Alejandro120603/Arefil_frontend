import { describe, expect, it } from "vitest";
import { emptyExcelLayout } from "./report-builder";
import { sourceChangeDependencyErrors } from "./report-input-dependencies";
import type {
  ReportBuilderDefinition,
  ReportColumn,
  ReportDataSource,
  ReportParameter,
  ReportParameterGroup,
} from "@/types/api";

const TAX: ReportParameter = {
  name: "tax_rate", label: "IVA %", data_type: "decimal", input_type: "number",
  required: false, default_value: 16, display_order: 0, configuration_json: null,
};
const CUSTOMER: ReportParameter = {
  name: "customer_id", label: "Cliente", data_type: "integer", input_type: "number",
  required: false, default_value: null, display_order: 1, configuration_json: null,
};
const GROUP: ReportParameterGroup = {
  name: "items", label: "Productos", resolver_key: "products_by_price_list", context_parameter: "price_list_id",
  min_items: 1, max_items: null, display_order: 0,
  fields: [{
    name: "quantity", label: "Cantidad", data_type: "integer", input_type: "number",
    required: true, default_value: 1, display_order: 0, configuration_json: null,
  }],
};

function column(overrides: Partial<ReportColumn>): ReportColumn {
  return {
    key: "price", label: "Precio unitario", column_type: "FIELD",
    source_field: "price_list_item.unit_price", source_parameter: null, formula_definition: null,
    data_type: "decimal", format_type: "currency", display_order: 0, visible: true, width: null,
    ...overrides,
  };
}

const COLUMNS = [
  column({}),
  column({ key: "customer", label: "Cliente elegido", column_type: "PARAMETER", source_field: null, source_parameter: "customer_id", data_type: "integer" }),
  column({ key: "quantity", label: "Cantidad", column_type: "PARAMETER", source_field: null, source_parameter: "items.quantity", data_type: "integer" }),
  column({ key: "line_total", label: "Precio total", column_type: "FORMULA", source_field: null, formula_definition: "quantity + tax_rate", data_type: "decimal" }),
];

const BUILDER: ReportBuilderDefinition = {
  report: {
    code: "QUOTE", name: "Cotización", description: null, category: null, filename_template: null, enabled: true,
    data_source_id: 1,
    data_source: { id: 1, code: "ROWS", name: "Renglones", description: null, enabled: true, capabilities: ["REPEATABLE_ROWS"] },
    parameters: [TAX, CUSTOMER], parameter_groups: [GROUP], created_at: "2026-01-01", updated_at: "2026-01-01",
  },
  columns: COLUMNS,
  parameter_groups: [GROUP],
  excel_layout: {
    ...emptyExcelLayout(),
    totals: [{ key: "tax_total", label: "IVA total", column_key: null, operation: "FORMULA", formula_definition: "tax_rate * 100", format_type: "currency" }],
  },
};

const TARGET: ReportDataSource = {
  id: 2, code: "CATALOG", name: "Catálogo", description: null, enabled: true, capabilities: [], parameters: [],
  fields: [{ key: "product.part_number", label: "Número de parte", data_type: "string", group: "Producto", required_context: "product" }],
};

describe("sourceChangeDependencyErrors", () => {
  it("reports FIELD, scalar, group, column formula, and summary formula with human labels", () => {
    const errors = sourceChangeDependencyErrors({ persisted: BUILDER, targetSource: TARGET, parameters: [], groups: [] });

    expect(errors).toContain("Columna \"Precio unitario\" — ese dato no existe en la nueva fuente.");
    expect(errors).toContain("Columna \"Cliente elegido\" — usa el dato \"Cliente\", que se quitará.");
    expect(errors).toContain("Columna \"Cantidad\" — usa Productos por renglón, que se quitarán.");
    expect(errors).toContain("Cálculo \"Precio total\" — depende de la columna \"Cantidad\", que deja de ser válida.");
    expect(errors).toContain("Cálculo \"Precio total\" — usa el dato \"IVA %\", que se quitará.");
    expect(errors).toContain("Total \"IVA total\" — usa el dato \"IVA %\", que se quitará.");
  });

  it("accepts a builder that remains compatible with the target source", () => {
    const compatible = {
      ...BUILDER,
      columns: [column({ source_field: "product.part_number", data_type: "string", format_type: "text" })],
      excel_layout: { ...emptyExcelLayout(), totals: [] },
    };
    expect(sourceChangeDependencyErrors({ persisted: compatible, targetSource: TARGET, parameters: [], groups: [] })).toEqual([]);
  });
});
