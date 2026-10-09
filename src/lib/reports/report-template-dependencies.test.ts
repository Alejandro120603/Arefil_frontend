import { describe, expect, it } from "vitest";
import {
  NO_TEMPLATE_DEPENDENCIES,
  templateDependencyBlocks,
  templateDependencyMessage,
  templateDependencyTitle,
  templateLocationLabel,
  templatePlaceholderDependencies,
} from "@/lib/reports/report-template-dependencies";
import { inspectionWithPlaceholders } from "@/test/template-inspection";
import type { ReportColumn, ReportParameter, ReportSummaryConfiguration } from "@/types/api";

const CUSTOMER: ReportParameter = {
  name: "customer_name", label: "Cliente", data_type: "string", input_type: "text",
  required: false, default_value: null, display_order: 0, configuration_json: null,
};
const NOTE: ReportParameter = { ...CUSTOMER, name: "note", label: "Nota", display_order: 1 };

function column(overrides: Partial<ReportColumn>): ReportColumn {
  return {
    key: "unit_price", label: "Precio unitario", column_type: "FIELD", source_field: "price.unit_price",
    source_parameter: null, formula_definition: null, data_type: "decimal", format_type: "currency",
    display_order: 0, visible: true, width: null, ...overrides,
  };
}

const SUBTOTAL: ReportSummaryConfiguration = {
  key: "subtotal", label: "Subtotal", column_key: "unit_price", operation: "SUM", formula_definition: null, format_type: "currency",
};
const TOTAL: ReportSummaryConfiguration = {
  key: "total", label: "Total", column_key: null, operation: "FORMULA", formula_definition: "subtotal * 1.16", format_type: "currency",
};

const DEPENDENCIES = templatePlaceholderDependencies(
  inspectionWithPlaceholders(["parameters.customer_name", "rows.unit_price", "summary.subtotal", "report.name"]),
);

describe("templatePlaceholderDependencies", () => {
  it("indexes parameters, rows and summary by key, keeping sheet, cell and placeholder", () => {
    expect(DEPENDENCIES.parameters.get("customer_name")).toEqual([
      { sheet: "Cotización", cell: "B2", range: null, placeholder: "parameters.customer_name" },
    ]);
    expect(DEPENDENCIES.rows.get("unit_price")).toEqual([
      { sheet: "Cotización", cell: "B3", range: null, placeholder: "rows.unit_price" },
    ]);
    expect(DEPENDENCIES.summary.get("subtotal")).toEqual([
      { sheet: "Cotización", cell: "B4", range: null, placeholder: "summary.subtotal" },
    ]);
  });

  it("does not track report.* (fixed keys) and keeps every location of a repeated placeholder", () => {
    const inspection = inspectionWithPlaceholders(["report.name", "parameters.customer_name", "parameters.customer_name"]);
    inspection.sheets[0].cells[2] = { ...inspection.sheets[0].cells[2], merged_range: "B4:C4" };
    const dependencies = templatePlaceholderDependencies(inspection);
    expect([...dependencies.parameters.keys()]).toEqual(["customer_name"]);
    expect(dependencies.parameters.get("customer_name")?.map(templateLocationLabel)).toEqual(["Cotización!B3", "Cotización!B4"]);
    expect(dependencies.parameters.get("customer_name")?.[1].range).toBe("B4:C4");
    expect(Object.values(dependencies).every((map) => !map.has("name"))).toBe(true);
  });

  it("reads several placeholders embedded in one cell from the inspection's own list", () => {
    const inspection = inspectionWithPlaceholders([]);
    inspection.sheets[0].cells = [{
      ...inspectionWithPlaceholders(["rows.unit_price"]).sheets[0].cells[0],
      value: "Cliente: {{parameters.customer_name}} / {{ summary.subtotal }}",
      placeholders: ["{{parameters.customer_name}}", "{{ summary.subtotal }}"],
    }];
    const dependencies = templatePlaceholderDependencies(inspection);
    expect(dependencies.parameters.get("customer_name")?.[0].cell).toBe("B2");
    expect(dependencies.summary.get("subtotal")?.[0].placeholder).toBe("summary.subtotal");
  });

  it("is empty without an inspection", () => {
    expect(templatePlaceholderDependencies(null)).toBe(NO_TEMPLATE_DEPENDENCIES);
  });
});

describe("templateDependencyBlocks", () => {
  it("allows removing a parameter the template does not use, blocks one it uses", () => {
    expect(templateDependencyBlocks(DEPENDENCIES, { parameters: [CUSTOMER, NOTE] }, { parameters: [CUSTOMER] })).toEqual([]);
    const [block] = templateDependencyBlocks(DEPENDENCIES, { parameters: [CUSTOMER, NOTE] }, { parameters: [NOTE] });
    expect(block).toEqual(expect.objectContaining({ kind: "parameter", action: "remove", key: "customer_name", label: "Cliente" }));
    expect(templateDependencyTitle(block)).toBe('No puedes quitar "Cliente".');
    expect(templateDependencyMessage(block)).toBe('Plantilla Excel — usa el dato "Cliente" en Cotización!B2, que se quitaría.');
  });

  it("never blocks a relabel or a type change that keeps the parameter name", () => {
    const renamed = { ...CUSTOMER, label: "Cliente principal", data_type: "integer" as const, input_type: "number" as const };
    expect(templateDependencyBlocks(DEPENDENCIES, { parameters: [CUSTOMER] }, { parameters: [renamed] })).toEqual([]);
  });

  it("blocks removing or hiding a used column, never a label, source or format change", () => {
    const before = { columns: [column({}), column({ key: "notes", label: "Notas" })] };
    expect(templateDependencyBlocks(DEPENDENCIES, before, { columns: [column({})] })).toEqual([]);
    expect(templateDependencyBlocks(DEPENDENCIES, before, { columns: [column({ key: "notes" })] })[0])
      .toEqual(expect.objectContaining({ kind: "column", action: "remove", label: "Precio unitario" }));
    const [hidden] = templateDependencyBlocks(DEPENDENCIES, before, { columns: [column({ visible: false })] });
    expect(hidden.action).toBe("hide");
    expect(templateDependencyTitle(hidden)).toBe('No puedes ocultar "Precio unitario" porque la plantilla Excel la utiliza.');
    const edited = column({ label: "Precio", source_field: "price.list_price", format_type: "number" });
    expect(templateDependencyBlocks(DEPENDENCIES, before, { columns: [edited] })).toEqual([]);
  });

  it("ignores a used column that was already hidden (the template could not read it)", () => {
    const hidden = column({ visible: false });
    expect(templateDependencyBlocks(DEPENDENCIES, { columns: [hidden] }, { columns: [] })).toEqual([]);
  });

  it("blocks removing a used summary, never one that keeps its key with another formula or label", () => {
    expect(templateDependencyBlocks(DEPENDENCIES, { summaries: [SUBTOTAL, TOTAL] }, { summaries: [SUBTOTAL] })).toEqual([]);
    const [block] = templateDependencyBlocks(DEPENDENCIES, { summaries: [SUBTOTAL, TOTAL] }, { summaries: [TOTAL] });
    expect(templateDependencyTitle(block)).toBe('No puedes quitar "Subtotal" porque la plantilla Excel lo utiliza.');
    const reworked = { ...SUBTOTAL, label: "Suma", operation: "FORMULA" as const, column_key: null, formula_definition: "1 + 1" };
    expect(templateDependencyBlocks(DEPENDENCIES, { summaries: [SUBTOTAL] }, { summaries: [reworked] })).toEqual([]);
  });

  it("does nothing without a template", () => {
    expect(templateDependencyBlocks(NO_TEMPLATE_DEPENDENCIES, { parameters: [CUSTOMER], columns: [column({})] }, { parameters: [], columns: [] })).toEqual([]);
  });
});
