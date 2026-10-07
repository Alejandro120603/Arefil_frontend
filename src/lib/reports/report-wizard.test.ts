import { describe, expect, it } from "vitest";
import {
  reportWizardStepFromOrder,
  reportWizardStepOrder,
  resumeReportWizardStep,
} from "./report-wizard";
import type {
  ReportAdminDefinition,
  ReportBuilderDefinition,
  ReportExcelTemplate,
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
