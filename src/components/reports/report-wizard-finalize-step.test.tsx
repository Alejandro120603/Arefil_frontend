// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportWizardFinalizeStep } from "./report-wizard-finalize-step";
import { ApiError } from "@/lib/api/errors";
import type { ReportAdminDefinition, ReportBuilderDefinition, ReportExcelTemplate } from "@/types/api";

const { getReportBuilder, getReportExcelTemplate, inspectReportExcelTemplate, updateReport } = vi.hoisted(() => ({
  getReportBuilder: vi.fn(),
  getReportExcelTemplate: vi.fn(),
  inspectReportExcelTemplate: vi.fn(),
  updateReport: vi.fn(),
}));
vi.mock("@/lib/api/reports", () => ({ getReportBuilder, getReportExcelTemplate, inspectReportExcelTemplate, updateReport }));

const REPORT: ReportAdminDefinition = {
  code: "COTIZACION", name: "Cotización", description: null, category: null, filename_template: null,
  enabled: false, data_source_id: 1,
  data_source: { id: 1, code: "quotes", name: "Cotizaciones", description: null, enabled: true, capabilities: [] },
  parameters: [], parameter_groups: [], created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

const BUILDER = {
  report: REPORT,
  columns: [{ key: "part_number", label: "No. Parte", column_type: "FIELD", source_field: "product.part_number", source_parameter: null, formula_definition: null, data_type: "string", format_type: "text", display_order: 0, visible: true, width: null }],
  parameter_groups: [], excel_layout: null,
} as unknown as ReportBuilderDefinition;

const TEMPLATE: ReportExcelTemplate = {
  report_code: "COTIZACION", original_filename: "COTIZACION.xlsx", size_bytes: 100, version: 4, checksum: "abc",
  is_active: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReportWizardFinalizeStep", () => {
  it("shows the checklist computed from a fresh backend read", async () => {
    getReportBuilder.mockResolvedValue(BUILDER);
    getReportExcelTemplate.mockRejectedValue(new ApiError(404, "no template"));
    render(<ReportWizardFinalizeStep report={REPORT} previewGeneratedThisSession={false} onReportChange={vi.fn()} />);

    expect(await screen.findByText("Información guardada")).toBeTruthy();
    expect(screen.getByText("1 columna configurada")).toBeTruthy();
    expect(screen.getByText("Plantilla Excel")).toBeTruthy();
    expect(screen.getAllByText("Pendiente").length).toBeGreaterThan(0);
  });

  it("shows the template version and mapped-field count once a template and inspection are available", async () => {
    getReportBuilder.mockResolvedValue(BUILDER);
    getReportExcelTemplate.mockResolvedValue(TEMPLATE);
    inspectReportExcelTemplate.mockResolvedValue({
      template: { version: 4, filename: "COTIZACION.xlsx", checksum: "abc" },
      styles: {}, truncated: false,
      sheets: [{
        name: "Cotización", index: 0, hidden: false, state: "visible", max_row: 10, max_column: 5,
        used_range: "A1:E10", merged_ranges: [], row_heights: {}, column_widths: {},
        default_row_height: null, default_column_width: null,
        cells: [{
          coordinate: "B4", row: 4, column: 2, value: "{{parameters.customer_name}}", value_type: "text", formula: null,
          placeholders: ["{{parameters.customer_name}}"], style_id: 0, number_format: "General", merged_range: null, merge_anchor: null,
        }],
        drawings: [],
      }],
    });
    render(<ReportWizardFinalizeStep report={REPORT} previewGeneratedThisSession={true} onReportChange={vi.fn()} />);

    expect(await screen.findByText("Plantilla Excel · v4")).toBeTruthy();
    expect(screen.getByText("1 campo mapeado")).toBeTruthy();
    expect(screen.getByText("Vista previa generada")).toBeTruthy();
  });

  it("enables the report and reports the updated definition back", async () => {
    getReportBuilder.mockResolvedValue(BUILDER);
    getReportExcelTemplate.mockRejectedValue(new ApiError(404, "no template"));
    updateReport.mockResolvedValue({ ...REPORT, enabled: true });
    const onReportChange = vi.fn();
    const user = userEvent.setup();
    render(<ReportWizardFinalizeStep report={REPORT} previewGeneratedThisSession={false} onReportChange={onReportChange} />);

    await user.click(await screen.findByRole("button", { name: /Habilitar reporte/ }));

    await waitFor(() => expect(updateReport).toHaveBeenCalledWith("COTIZACION", expect.objectContaining({ enabled: true })));
    expect(onReportChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  it("shows a wrap-up action instead of a fake publish flow once already enabled", async () => {
    getReportBuilder.mockResolvedValue(BUILDER);
    getReportExcelTemplate.mockRejectedValue(new ApiError(404, "no template"));
    render(<ReportWizardFinalizeStep report={{ ...REPORT, enabled: true }} previewGeneratedThisSession={false} onReportChange={vi.fn()} />);

    expect(await screen.findByText("Reporte habilitado")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guardar y finalizar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Habilitar reporte/ })).toBeNull();
  });

  it("surfaces an error enabling the report without losing the checklist", async () => {
    getReportBuilder.mockResolvedValue(BUILDER);
    getReportExcelTemplate.mockRejectedValue(new ApiError(404, "no template"));
    updateReport.mockRejectedValue(new ApiError(500, "Error inesperado."));
    const user = userEvent.setup();
    render(<ReportWizardFinalizeStep report={REPORT} previewGeneratedThisSession={false} onReportChange={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: /Habilitar reporte/ }));
    expect(await screen.findByText("No se pudo habilitar el reporte")).toBeTruthy();
    expect(screen.getByText("Información guardada")).toBeTruthy();
  });

  it("shows a retry action when the fresh status read itself fails", async () => {
    getReportBuilder.mockRejectedValue(new ApiError(500, "Backend caído."));
    render(<ReportWizardFinalizeStep report={REPORT} previewGeneratedThisSession={false} onReportChange={vi.fn()} />);

    expect(await screen.findByText("No se pudo cargar el estado del reporte")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Reintentar/ })).toBeTruthy();
  });
});

it("reads fresh backend state when entering Finalizar after it was kept hidden", async () => {
  getReportBuilder.mockResolvedValue(BUILDER);
  getReportExcelTemplate.mockResolvedValue(TEMPLATE);
  inspectReportExcelTemplate.mockResolvedValue({ sheets: [], styles: {}, truncated: false });
  const props = { report: REPORT, previewGeneratedThisSession: false, onReportChange: vi.fn() };
  const view = render(<ReportWizardFinalizeStep {...props} active={false} />);
  expect(getReportBuilder).not.toHaveBeenCalled();
  view.rerender(<ReportWizardFinalizeStep {...props} active />);
  expect(await screen.findByText("Plantilla Excel · v4")).toBeTruthy();
  view.rerender(<ReportWizardFinalizeStep {...props} active={false} />);
  getReportExcelTemplate.mockResolvedValue({ ...TEMPLATE, version: 5 });
  view.rerender(<ReportWizardFinalizeStep {...props} active />);
  expect(await screen.findByText("Plantilla Excel · v5")).toBeTruthy();
});
