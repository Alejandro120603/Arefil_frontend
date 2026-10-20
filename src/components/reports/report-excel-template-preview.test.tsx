// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportExcelTemplatePreview } from "./report-excel-template-preview";
import { ApiError } from "@/lib/api/errors";
import { XLSX_MEDIA_TYPE } from "@/lib/reports/report-excel-template";
import type { ReportBuilderPreviewResponse, ReportDefinition, ReportExcelRenderPreview } from "@/types/api";

const {
  previewReportBuilder, renderReportExcelTemplatePreview, downloadReportDocumentXlsx,
  listAllReportParameterOptions, resolveReportProductOption, searchReportProductOptions,
} = vi.hoisted(() => ({
  previewReportBuilder: vi.fn(),
  renderReportExcelTemplatePreview: vi.fn(),
  downloadReportDocumentXlsx: vi.fn(),
  listAllReportParameterOptions: vi.fn(),
  resolveReportProductOption: vi.fn(),
  searchReportProductOptions: vi.fn(),
}));
vi.mock("@/lib/api/reports", () => ({
  previewReportBuilder, renderReportExcelTemplatePreview, downloadReportDocumentXlsx,
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
  it("uses builder preview for a disabled report and renders its persisted execution_id", async () => {
    previewReportBuilder.mockResolvedValue(executionPayload());
    renderReportExcelTemplatePreview.mockResolvedValue(renderPreview());
    const user = userEvent.setup();
    render(<ReportExcelTemplatePreview report={{ ...REPORT, enabled: false }} hasSummaries={false} templateVersion={4} hasUnsavedChanges={false} />);

    await fillRequiredAndGenerate(user);

    await waitFor(() => expect(previewReportBuilder).toHaveBeenCalledWith("COTIZACION", { customer_name: "BONATTI" }, expect.anything()));
    await waitFor(() => expect(renderReportExcelTemplatePreview).toHaveBeenCalledWith("COTIZACION", "exec-1", expect.anything()));
    expect(await screen.findByText("Vista previa basada en plantilla v4")).toBeTruthy();
    expect(screen.getByLabelText("Celda B2").textContent).toContain("BONATTI MÉXICO");
  });

  it("shows the summaries badge only when the report has summaries configured", async () => {
    previewReportBuilder.mockResolvedValue(executionPayload());
    renderReportExcelTemplatePreview.mockResolvedValue(renderPreview());
    const user = userEvent.setup();
    render(<ReportExcelTemplatePreview report={REPORT} hasSummaries={true} templateVersion={4} hasUnsavedChanges={false} />);

    await fillRequiredAndGenerate(user);
    expect(await screen.findByText("✓ Resúmenes presentes")).toBeTruthy();
  });

  it("shows a plain informational note, not an error, for a 0-row dataset", async () => {
    previewReportBuilder.mockResolvedValue(executionPayload({ row_count: 0 }));
    renderReportExcelTemplatePreview.mockResolvedValue(renderPreview());
    const user = userEvent.setup();
    render(<ReportExcelTemplatePreview report={REPORT} hasSummaries={false} templateVersion={4} hasUnsavedChanges={false} />);

    await fillRequiredAndGenerate(user);
    expect(await screen.findByText(/El dataset generado no tiene renglones/)).toBeTruthy();
    expect(screen.getByText("✓ 0 partidas renderizadas")).toBeTruthy();
  });

  it("uses singular wording for exactly one rendered partida", async () => {
    previewReportBuilder.mockResolvedValue(executionPayload({ row_count: 1 }));
    renderReportExcelTemplatePreview.mockResolvedValue(renderPreview());
    const user = userEvent.setup();
    render(<ReportExcelTemplatePreview report={REPORT} hasSummaries={false} templateVersion={4} hasUnsavedChanges={false} />);

    await fillRequiredAndGenerate(user);
    expect(await screen.findByText("✓ 1 partida renderizada")).toBeTruthy();
  });

  it("switches sheets in the rendered preview", async () => {
    previewReportBuilder.mockResolvedValue(executionPayload());
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
    previewReportBuilder.mockResolvedValue(executionPayload());
    render(<ReportExcelTemplatePreview report={REPORT} hasSummaries={false} templateVersion={4} hasUnsavedChanges={true} />);

    expect(screen.getByText("Guarda los cambios de la plantilla antes de generar la vista previa.")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Generar vista previa/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(previewReportBuilder).not.toHaveBeenCalled();
  });

  it("treats a 404 from render-preview as an expired execution, with the exact regenerate message", async () => {
    previewReportBuilder.mockResolvedValue(executionPayload());
    renderReportExcelTemplatePreview.mockRejectedValue(new ApiError(404, "La ejecución ya no está disponible."));
    const user = userEvent.setup();
    render(<ReportExcelTemplatePreview report={REPORT} hasSummaries={false} templateVersion={4} hasUnsavedChanges={false} />);

    await fillRequiredAndGenerate(user);
    expect(await screen.findByText("La vista previa expiró")).toBeTruthy();
    expect(screen.getByText("Regenera la vista previa para continuar.")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Generar vista previa/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("surfaces a render error from the backend", async () => {
    previewReportBuilder.mockResolvedValue(executionPayload());
    renderReportExcelTemplatePreview.mockRejectedValue(new ApiError(422, "La celda C1 contiene una fórmula que no puede evaluarse."));
    const user = userEvent.setup();
    render(<ReportExcelTemplatePreview report={REPORT} hasSummaries={false} templateVersion={4} hasUnsavedChanges={false} />);

    await fillRequiredAndGenerate(user);
    expect(await screen.findByText("No se pudo generar la vista previa")).toBeTruthy();
    expect(screen.getByText("La celda C1 contiene una fórmula que no puede evaluarse.")).toBeTruthy();
  });

  it("flags cells that still carry an unresolved placeholder in the rendered document", async () => {
    previewReportBuilder.mockResolvedValue(executionPayload());
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
    previewReportBuilder.mockResolvedValue(executionPayload({ execution_id: "exec-1" }));
    renderReportExcelTemplatePreview.mockResolvedValue(renderPreview({ execution_id: "exec-1" }));
    downloadReportDocumentXlsx.mockResolvedValue({ blob: new Blob(["x"], { type: XLSX_MEDIA_TYPE }), filename: "cotizacion.xlsx" });
    const user = userEvent.setup();
    render(<ReportExcelTemplatePreview report={REPORT} hasSummaries={false} templateVersion={4} hasUnsavedChanges={false} />);

    await fillRequiredAndGenerate(user);
    await screen.findByText("Vista previa basada en plantilla v4");
    await user.click(screen.getByRole("button", { name: /Descargar documento Excel/ }));

    await waitFor(() => expect(downloadReportDocumentXlsx).toHaveBeenCalledWith("COTIZACION", "exec-1", expect.anything()));
  });

  it("shows a truncated preview but never offers it for download", async () => {
    previewReportBuilder.mockResolvedValue(executionPayload({ execution_id: "exec-cut", row_count: 100, truncated: true }));
    renderReportExcelTemplatePreview.mockResolvedValue(renderPreview({ execution_id: "exec-cut" }));
    const user = userEvent.setup();
    render(<ReportExcelTemplatePreview report={REPORT} hasSummaries={false} templateVersion={4} hasUnsavedChanges={false} />);

    await fillRequiredAndGenerate(user);
    await screen.findByText("Vista previa basada en plantilla v4");
    expect((screen.getByRole("button", { name: /Descargar documento Excel/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/solo las primeras filas/)).toBeTruthy();
    expect(screen.queryByText(/corresponde exactamente a esta vista previa/)).toBeNull();
    expect(downloadReportDocumentXlsx).not.toHaveBeenCalled();
  });

  it("invalidates the previous preview as soon as a parameter changes", async () => {
    previewReportBuilder.mockResolvedValue(executionPayload());
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

it("notifies the wizard when editing parameters invalidates a generated preview", async () => {
  previewReportBuilder.mockResolvedValue(executionPayload());
  renderReportExcelTemplatePreview.mockResolvedValue(renderPreview());
  const onPreviewInvalidated = vi.fn();
  const user = userEvent.setup();
  render(<ReportExcelTemplatePreview report={REPORT} hasSummaries={false} templateVersion={4} hasUnsavedChanges={false} onPreviewInvalidated={onPreviewInvalidated} />);
  await fillRequiredAndGenerate(user);
  expect(await screen.findByText("Vista previa basada en plantilla v4")).toBeTruthy();
  onPreviewInvalidated.mockClear();
  await user.type(screen.getByLabelText(/Cliente/), " nuevo");
  expect(onPreviewInvalidated).toHaveBeenCalled();
  expect(screen.queryByText("Vista previa basada en plantilla v4")).toBeNull();
});

it("estimates manual rows in the selected list's currency (USD), never MXN", async () => {
  listAllReportParameterOptions.mockResolvedValue([{ value: 9, label: "FLEETGUARD · 2026-01-01 · USD", currency: "USD" }]);
  const report: ReportDefinition = {
    ...REPORT,
    parameters: [{ name: "price_list_id", label: "Lista de precios", data_type: "integer", input_type: "select", required: true, default_value: null, display_order: 0, configuration_json: { options_source: "price_lists" } }],
    parameter_groups: [{
      name: "items", label: "Productos", resolver_key: "products_by_price_list", context_parameter: "price_list_id",
      min_items: 0, max_items: null, display_order: 0, allow_manual_items: true,
      fields: [
        { name: "product_id", label: "Producto", data_type: "integer", input_type: "select", required: true, default_value: null, display_order: 0, configuration_json: { options_source: "products_by_price_list", context_parameter: "price_list_id" } },
        { name: "quantity", label: "Cantidad", data_type: "integer", input_type: "number", required: true, default_value: 1, display_order: 1, configuration_json: { minimum: 0, exclusive_minimum: true } },
      ],
    }],
  };
  const lineAmount = {
    columns: [
      { key: "unit_price", label: "Precio", column_type: "FIELD" as const, source_field: "line.unit_price", source_parameter: null, formula_definition: null, data_type: "decimal" as const, format_type: "currency" as const, display_order: 0, visible: true, width: null },
      { key: "quantity", label: "Cantidad", column_type: "PARAMETER" as const, source_field: null, source_parameter: "items.quantity", formula_definition: null, data_type: "integer" as const, format_type: "number" as const, display_order: 1, visible: true, width: null },
      { key: "line_total", label: "Importe", column_type: "FORMULA" as const, source_field: null, source_parameter: null, formula_definition: "ROUND(quantity * unit_price, 2)", data_type: "decimal" as const, format_type: "currency" as const, display_order: 2, visible: true, width: null },
    ],
    summaries: [{ key: "subtotal", label: "Subtotal", column_key: "line_total", operation: "SUM" as const, formula_definition: null, format_type: "currency" as const }],
  };
  const user = userEvent.setup();
  render(<ReportExcelTemplatePreview report={report} hasSummaries templateVersion={4} hasUnsavedChanges={false} lineAmount={lineAmount} />);
  await screen.findByRole("option", { name: /USD/ });
  await user.selectOptions(screen.getByLabelText(/Lista de precios/), "9");
  await user.click(screen.getByRole("button", { name: "Producto fuera de lista" }));
  await user.type(screen.getByLabelText("Descripción * 1"), "Servicio especial");
  await user.type(screen.getByLabelText("Precio unitario * 1"), "800");
  const usd = new Intl.NumberFormat("es-MX", { style: "currency", currency: "USD" }).format(800).replace(/\s+/g, " ");
  expect(screen.getByText("USD")).toBeTruthy();
  expect(screen.getByText(usd)).toBeTruthy();
  expect(screen.queryByText("$800.00")).toBeNull();
});
