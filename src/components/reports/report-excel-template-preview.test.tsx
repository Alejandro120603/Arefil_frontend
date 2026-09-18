// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportExcelTemplatePreview } from "./report-excel-template-preview";
import { ApiError } from "@/lib/api/errors";
import type { ReportBuilderPreviewResponse, ReportDefinition, ReportExcelRenderPreview } from "@/types/api";

const {
  executeReport, renderReportExcelTemplatePreview, downloadReportDocumentXlsx,
  listAllReportParameterOptions, resolveReportProductOption, searchReportProductOptions,
} = vi.hoisted(() => ({
  executeReport: vi.fn(),
  renderReportExcelTemplatePreview: vi.fn(),
  downloadReportDocumentXlsx: vi.fn(),
  listAllReportParameterOptions: vi.fn(),
  resolveReportProductOption: vi.fn(),
  searchReportProductOptions: vi.fn(),
}));
vi.mock("@/lib/api/reports", () => ({
  executeReport, renderReportExcelTemplatePreview, downloadReportDocumentXlsx,
  listAllReportParameterOptions, resolveReportProductOption, searchReportProductOptions,
}));

const REPORT: ReportDefinition = {
  code: "COTIZACION", name: "Cotización", description: null, category: null, filename_template: null,
  enabled: true, data_source_id: 1,
  data_source: { id: 1, code: "quotes", name: "Cotizaciones", description: null, enabled: true, capabilities: [] },
  parameters: [
    { name: "customer_name", label: "Cliente", data_type: "string", input_type: "text", required: true, default_value: null, display_order: 0, configuration_json: null },
  ],
  parameter_groups: [],
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

function executionPayload(overrides: Partial<ReportBuilderPreviewResponse> = {}): ReportBuilderPreviewResponse {
  return {
    execution_id: "exec-1", columns: [{ key: "part_number", label: "No. Parte", data_type: "string", format_type: "text" }],
    parameters: {}, rows: [], summary: {}, totals: {}, row_count: 1, truncated: false,
    ...overrides,
  };
}

function renderPreview(overrides: Partial<ReportExcelRenderPreview> = {}): ReportExcelRenderPreview {
  return {
    kind: "rendered_document", report_code: "COTIZACION", template_version: 4, template_checksum: "abc",
    execution_id: "exec-1", generated_at: "2026-01-01T00:00:00Z",
    template: { version: 4, filename: "COTIZACION.xlsx", checksum: "abc" },
    styles: {}, truncated: false,
    sheets: [{
      name: "Cotización", index: 0, hidden: false, state: "visible", max_row: 4, max_column: 2,
      used_range: "A1:B4", merged_ranges: [], row_heights: {}, column_widths: {},
      default_row_height: null, default_column_width: null,
      cells: [{
        coordinate: "B2", row: 2, column: 2, value: "BONATTI MÉXICO", value_type: "text", formula: null,
        placeholders: [], style_id: 0, number_format: "General", merged_range: null, merge_anchor: null,
      }],
      drawings: [],
    }],
    ...overrides,
  };
}

async function fillRequiredAndGenerate(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Cliente/), "BONATTI");
  await user.click(screen.getByRole("button", { name: /Generar vista previa/ }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReportExcelTemplatePreview", () => {
  it("captures test parameters, runs a real execution, and renders the preview with its execution_id", async () => {
    executeReport.mockResolvedValue(executionPayload());
    renderReportExcelTemplatePreview.mockResolvedValue(renderPreview());
    const user = userEvent.setup();
    render(<ReportExcelTemplatePreview report={REPORT} hasSummaries={false} templateVersion={4} hasUnsavedChanges={false} />);

    await fillRequiredAndGenerate(user);

    await waitFor(() => expect(executeReport).toHaveBeenCalledWith("COTIZACION", { customer_name: "BONATTI" }, expect.anything()));
    await waitFor(() => expect(renderReportExcelTemplatePreview).toHaveBeenCalledWith("COTIZACION", "exec-1", expect.anything()));
    expect(await screen.findByText("Vista previa basada en plantilla v4")).toBeTruthy();
    expect(screen.getByLabelText("Celda B2").textContent).toContain("BONATTI MÉXICO");
  });

  it("shows the summaries badge only when the report has summaries configured", async () => {
    executeReport.mockResolvedValue(executionPayload());
    renderReportExcelTemplatePreview.mockResolvedValue(renderPreview());
    const user = userEvent.setup();
    render(<ReportExcelTemplatePreview report={REPORT} hasSummaries={true} templateVersion={4} hasUnsavedChanges={false} />);

    await fillRequiredAndGenerate(user);
    expect(await screen.findByText("✓ Resúmenes presentes")).toBeTruthy();
  });

  it("shows a plain informational note, not an error, for a 0-row dataset", async () => {
    executeReport.mockResolvedValue(executionPayload({ row_count: 0 }));
    renderReportExcelTemplatePreview.mockResolvedValue(renderPreview());
    const user = userEvent.setup();
    render(<ReportExcelTemplatePreview report={REPORT} hasSummaries={false} templateVersion={4} hasUnsavedChanges={false} />);

    await fillRequiredAndGenerate(user);
    expect(await screen.findByText(/El dataset generado no tiene renglones/)).toBeTruthy();
    expect(screen.getByText("✓ 0 partidas renderizadas")).toBeTruthy();
  });

  it("uses singular wording for exactly one rendered partida", async () => {
    executeReport.mockResolvedValue(executionPayload({ row_count: 1 }));
    renderReportExcelTemplatePreview.mockResolvedValue(renderPreview());
    const user = userEvent.setup();
    render(<ReportExcelTemplatePreview report={REPORT} hasSummaries={false} templateVersion={4} hasUnsavedChanges={false} />);

    await fillRequiredAndGenerate(user);
    expect(await screen.findByText("✓ 1 partida renderizada")).toBeTruthy();
  });

  it("switches sheets in the rendered preview", async () => {
    executeReport.mockResolvedValue(executionPayload());
    renderReportExcelTemplatePreview.mockResolvedValue(renderPreview({
      sheets: [
        renderPreview().sheets[0],
        { ...renderPreview().sheets[0], name: "Anexos", index: 1, cells: [] },
      ],
    }));
    const user = userEvent.setup();
    render(<ReportExcelTemplatePreview report={REPORT} hasSummaries={false} templateVersion={4} hasUnsavedChanges={false} />);

    await fillRequiredAndGenerate(user);
    expect((await screen.findByLabelText("Celda B2")).textContent).toContain("BONATTI MÉXICO");
    await user.click(screen.getByRole("tab", { name: "Anexos" }));
    expect(screen.getByLabelText("Celda B2").textContent).not.toContain("BONATTI MÉXICO");
  });

  it("blocks generating a preview while the template has unsaved changes", async () => {
    executeReport.mockResolvedValue(executionPayload());
    render(<ReportExcelTemplatePreview report={REPORT} hasSummaries={false} templateVersion={4} hasUnsavedChanges={true} />);

    expect(screen.getByText("Guarda los cambios de la plantilla antes de generar la vista previa.")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Generar vista previa/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(executeReport).not.toHaveBeenCalled();
  });

  it("treats a 404 from render-preview as an expired execution, with the exact regenerate message", async () => {
    executeReport.mockResolvedValue(executionPayload());
    renderReportExcelTemplatePreview.mockRejectedValue(new ApiError(404, "La ejecución ya no está disponible."));
    const user = userEvent.setup();
    render(<ReportExcelTemplatePreview report={REPORT} hasSummaries={false} templateVersion={4} hasUnsavedChanges={false} />);

    await fillRequiredAndGenerate(user);
    expect(await screen.findByText("La vista previa expiró")).toBeTruthy();
    expect(screen.getByText("Regenera la vista previa para continuar.")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Generar vista previa/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("surfaces a render error from the backend", async () => {
    executeReport.mockResolvedValue(executionPayload());
    renderReportExcelTemplatePreview.mockRejectedValue(new ApiError(422, "La celda C1 contiene una fórmula que no puede evaluarse."));
    const user = userEvent.setup();
    render(<ReportExcelTemplatePreview report={REPORT} hasSummaries={false} templateVersion={4} hasUnsavedChanges={false} />);

    await fillRequiredAndGenerate(user);
    expect(await screen.findByText("No se pudo generar la vista previa")).toBeTruthy();
    expect(screen.getByText("La celda C1 contiene una fórmula que no puede evaluarse.")).toBeTruthy();
  });

  it("flags cells that still carry an unresolved placeholder in the rendered document", async () => {
    executeReport.mockResolvedValue(executionPayload());
    renderReportExcelTemplatePreview.mockResolvedValue(renderPreview({
      sheets: [{
        ...renderPreview().sheets[0],
        cells: [{
          coordinate: "B2", row: 2, column: 2, value: "{{parameters.missing}}", value_type: "text", formula: null,
          placeholders: ["{{parameters.missing}}"], style_id: 0, number_format: "General", merged_range: null, merge_anchor: null,
        }],
      }],
    }));
    const user = userEvent.setup();
    render(<ReportExcelTemplatePreview report={REPORT} hasSummaries={false} templateVersion={4} hasUnsavedChanges={false} />);

    await fillRequiredAndGenerate(user);
    expect(await screen.findByText("Placeholders sin resolver")).toBeTruthy();
  });

  it("the download button reuses the preview's own execution_id, not local state", async () => {
    executeReport.mockResolvedValue(executionPayload({ execution_id: "exec-1" }));
    renderReportExcelTemplatePreview.mockResolvedValue(renderPreview({ execution_id: "exec-1" }));
    downloadReportDocumentXlsx.mockResolvedValue({ blob: new Blob(["x"]), filename: "cotizacion.xlsx" });
    const user = userEvent.setup();
    render(<ReportExcelTemplatePreview report={REPORT} hasSummaries={false} templateVersion={4} hasUnsavedChanges={false} />);

    await fillRequiredAndGenerate(user);
    await screen.findByText("Vista previa basada en plantilla v4");
    await user.click(screen.getByRole("button", { name: /Descargar cotización Excel/ }));

    await waitFor(() => expect(downloadReportDocumentXlsx).toHaveBeenCalledWith("COTIZACION", "exec-1", expect.anything()));
  });

  it("invalidates the previous preview as soon as a parameter changes", async () => {
    executeReport.mockResolvedValue(executionPayload());
    renderReportExcelTemplatePreview.mockResolvedValue(renderPreview());
    const user = userEvent.setup();
    render(<ReportExcelTemplatePreview report={REPORT} hasSummaries={false} templateVersion={4} hasUnsavedChanges={false} />);

    await fillRequiredAndGenerate(user);
    await screen.findByText("Vista previa basada en plantilla v4");

    await user.type(screen.getByLabelText(/Cliente/), " SA");
    expect(screen.queryByText("Vista previa basada en plantilla v4")).toBeNull();
    expect(screen.getByRole("button", { name: "Generar vista previa" })).toBeTruthy();
  });
});
