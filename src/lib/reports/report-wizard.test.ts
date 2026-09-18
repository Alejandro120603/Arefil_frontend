import { describe, expect, it } from "vitest";
import {
  buildReportWizardChecklist,
  reportWizardChecklistComplete,
  reportWizardStepFromOrder,
  reportWizardStepOrder,
  resumeReportWizardStep,
} from "./report-wizard";
import type {
  ReportAdminDefinition,
  ReportBuilderDefinition,
  ReportExcelTemplate,
  ReportExcelTemplateInspection,
  ReportWorkbookCellInspection,
  ReportWorkbookSheetInspection,
} from "@/types/api";

const REPORT = {
  code: "COTIZACION", name: "Cotización", description: null, category: null, filename_template: null,
  enabled: false, data_source_id: 1,
  data_source: { id: 1, code: "quotes", name: "Renglones de cotización", description: null, enabled: true, capabilities: ["REPEATABLE_ROWS"] },
  parameters: [], parameter_groups: [], created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
} as unknown as ReportAdminDefinition;

const BUILDER = {
  report: REPORT,
  columns: [{ key: "part_number", label: "No. Parte", column_type: "FIELD", source_field: "product.part_number", source_parameter: null, formula_definition: null, data_type: "string", format_type: "text", display_order: 0, visible: true, width: null }],
  parameter_groups: [],
  excel_layout: null,
} as unknown as ReportBuilderDefinition;

const TEMPLATE: ReportExcelTemplate = {
  report_code: "COTIZACION", original_filename: "COTIZACION.xlsx", size_bytes: 100, version: 4, checksum: "abc",
  is_active: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

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

function inspection(sheets: ReportWorkbookSheetInspection[]): ReportExcelTemplateInspection {
  return { template: { version: 4, filename: "COTIZACION.xlsx", checksum: "abc" }, sheets, styles: {}, truncated: false };
}

describe("step ordering", () => {
  it("round-trips order <-> id", () => {
    expect(reportWizardStepFromOrder(4)).toBe("template");
    expect(reportWizardStepOrder("mapping")).toBe(5);
  });

  it("falls back to the first step for an out-of-range order", () => {
    expect(reportWizardStepFromOrder(99)).toBe("information");
  });
});

describe("resumeReportWizardStep", () => {
  it("resumes at Datos del reporte when no columns are configured", () => {
    expect(resumeReportWizardStep({ builder: { ...BUILDER, columns: [] }, template: null })).toBe("data");
  });

  it("resumes at Plantilla Excel once columns exist but there is no template", () => {
    expect(resumeReportWizardStep({ builder: BUILDER, template: null })).toBe("template");
  });

  it("resumes at Mapear campos once both columns and a template exist", () => {
    expect(resumeReportWizardStep({ builder: BUILDER, template: TEMPLATE })).toBe("mapping");
  });
});

describe("buildReportWizardChecklist", () => {
  it("reflects real backend state, not visited screens", () => {
    const items = buildReportWizardChecklist({
      report: REPORT, builder: BUILDER, template: null, inspection: null, previewGeneratedThisSession: false,
    });
    expect(items.find((item) => item.key === "information")?.done).toBe(true);
    expect(items.find((item) => item.key === "columns")).toMatchObject({ label: "1 columna configurada", done: true });
    expect(items.find((item) => item.key === "template")).toMatchObject({ label: "Plantilla Excel", done: false });
    expect(items.find((item) => item.key === "mappings")).toMatchObject({ label: "0 campos mapeados", done: false });
    expect(items.find((item) => item.key === "repeatable-row")).toMatchObject({ done: false });
    expect(items.find((item) => item.key === "preview")?.done).toBe(false);
  });

  it("counts mapped cells and detects the repeatable row from a fresh inspection", () => {
    const items = buildReportWizardChecklist({
      report: REPORT, builder: BUILDER, template: TEMPLATE,
      inspection: inspection([sheet({
        cells: [
          cell({ coordinate: "B4", value: "{{parameters.customer_name}}", value_type: "text", placeholders: ["{{parameters.customer_name}}"] }),
          cell({ coordinate: "A13", row: 13, value: "{{rows.part_number}}", value_type: "text", placeholders: ["{{rows.part_number}}"] }),
        ],
      })]),
      previewGeneratedThisSession: true,
    });
    expect(items.find((item) => item.key === "template")).toMatchObject({ label: "Plantilla Excel · v4", done: true });
    expect(items.find((item) => item.key === "mappings")).toMatchObject({ label: "2 campos mapeados", done: true });
    expect(items.find((item) => item.key === "repeatable-row")).toMatchObject({ done: true });
    expect(items.find((item) => item.key === "preview")?.done).toBe(true);
  });

  it("never claims a mapped field for a placeholder embedded in ordinary text", () => {
    const items = buildReportWizardChecklist({
      report: REPORT, builder: BUILDER, template: TEMPLATE,
      inspection: inspection([sheet({
        cells: [cell({ coordinate: "B4", value: "Total: {{summary.total}}", value_type: "text", placeholders: ["{{summary.total}}"] })],
      })]),
      previewGeneratedThisSession: false,
    });
    expect(items.find((item) => item.key === "mappings")).toMatchObject({ label: "0 campos mapeados", done: false });
  });

  it("omits the repeatable-row item entirely when the source does not support it", () => {
    const items = buildReportWizardChecklist({
      report: { ...REPORT, data_source: { ...REPORT.data_source, capabilities: [] } },
      builder: BUILDER, template: null, inspection: null, previewGeneratedThisSession: false,
    });
    expect(items.find((item) => item.key === "repeatable-row")).toBeUndefined();
  });

  it("flags a disabled data source as pending even though it was selected", () => {
    const items = buildReportWizardChecklist({
      report: { ...REPORT, data_source: { ...REPORT.data_source, enabled: false } },
      builder: BUILDER, template: null, inspection: null, previewGeneratedThisSession: false,
    });
    expect(items.find((item) => item.key === "source")?.done).toBe(false);
  });
});

describe("reportWizardChecklistComplete", () => {
  it("is true only once every item is done", () => {
    expect(reportWizardChecklistComplete([{ key: "a", label: "a", done: true }])).toBe(true);
    expect(reportWizardChecklistComplete([{ key: "a", label: "a", done: true }, { key: "b", label: "b", done: false }])).toBe(false);
    expect(reportWizardChecklistComplete([])).toBe(true);
  });
});
