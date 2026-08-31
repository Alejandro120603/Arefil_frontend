// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportDocumentDesigner } from "./report-document-designer";
import { ApiError } from "@/lib/api/errors";
import type { ReportBuilderDefinition, ReportParameter, ReportTemplate } from "@/types/api";

const { getReportTemplate, saveReportTemplate, deleteReportTemplate, getReportBuilder } = vi.hoisted(() => ({
  getReportTemplate: vi.fn(), saveReportTemplate: vi.fn(), deleteReportTemplate: vi.fn(), getReportBuilder: vi.fn(),
}));
vi.mock("@/lib/api/reports", () => ({
  getReportTemplate, saveReportTemplate, deleteReportTemplate, getReportBuilder,
}));

const PARAMETERS: ReportParameter[] = [
  { name: "customer_name", label: "Cliente", data_type: "string", input_type: "text", required: true, default_value: null, display_order: 0, configuration_json: null },
];

const BUILDER = {
  report: {} as ReportBuilderDefinition["report"],
  columns: [{
    key: "line_total", label: "Precio Total", column_type: "FORMULA", source_field: null, source_parameter: null,
    formula_definition: "quantity * unit_price", data_type: "decimal", format_type: "currency",
    display_order: 0, visible: true, width: null,
  }],
  parameter_groups: [],
  excel_layout: {
    sheet_name: "Cotización", title: null, show_report_name: true, show_generated_at: true,
    show_parameters: true, freeze_header: true, header_row: 1,
    totals: [{ key: "subtotal", label: "Subtotal", column_key: "line_total", operation: "SUM", formula_definition: null, format_type: "currency" }],
  },
} as unknown as ReportBuilderDefinition;

const TEMPLATE: ReportTemplate = {
  format: "mrt", content: '{"ReportName":"Cotizacion"}', version: 2, active: true,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
};

function renderDesigner() {
  return render(<ReportDocumentDesigner code="COTIZACION" name="Cotización" parameters={PARAMETERS} />);
}

beforeEach(() => {
  getReportBuilder.mockResolvedValue(BUILDER);
  getReportTemplate.mockRejectedValue(new ApiError(404, "El reporte no tiene template activo."));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReportDocumentDesigner", () => {
  it("treats a report without template as a state, not a failure, and lists the dataset the designer can bind to", async () => {
    const user = userEvent.setup();
    renderDesigner();

    expect(await screen.findByText("Sin template")).toBeTruthy();
    expect(screen.queryByText("No se pudo cargar el template")).toBeNull();
    expect(screen.getByText(/Este reporte todavía no tiene documento/)).toBeTruthy();

    await user.click(await screen.findByRole("button", { name: /Dataset disponible para el diseñador/ }));
    expect(screen.getByText("rows.line_total")).toBeTruthy();
    expect(screen.getByText("summary.subtotal")).toBeTruthy();
    expect(screen.getByText("parameters.customer_name")).toBeTruthy();
  });

  it("loads the active template, marks local edits and saves them", async () => {
    getReportTemplate.mockResolvedValue(TEMPLATE);
    saveReportTemplate.mockResolvedValue({ ...TEMPLATE, content: '{"ReportName":"Cotizacion2"}', version: 3 });
    const user = userEvent.setup();
    renderDesigner();

    expect(await screen.findByText("Configurado · v2")).toBeTruthy();
    const editor = screen.getByLabelText("Template") as HTMLTextAreaElement;
    expect(editor.value).toBe(TEMPLATE.content);

    await user.clear(editor);
    await user.type(editor, '{{"ReportName":"Cotizacion2"}');
    expect(screen.getByText("Cambios sin guardar")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Guardar template" }));
    await waitFor(() => expect(saveReportTemplate).toHaveBeenCalledWith("COTIZACION", {
      format: "mrt", content: '{"ReportName":"Cotizacion2"}',
    }));
    expect(await screen.findByText("Template guardado")).toBeTruthy();
    expect(screen.getByText("Configurado · v3")).toBeTruthy();
  });

  it("keeps the edited template on screen when the backend refuses to save it", async () => {
    getReportTemplate.mockResolvedValue(TEMPLATE);
    saveReportTemplate.mockRejectedValue(new ApiError(422, "El template no es válido."));
    const user = userEvent.setup();
    renderDesigner();

    const editor = await screen.findByLabelText("Template") as HTMLTextAreaElement;
    await user.clear(editor);
    await user.type(editor, "roto");
    await user.click(screen.getByRole("button", { name: "Guardar template" }));

    expect(await screen.findByText("El template no es válido.")).toBeTruthy();
    expect((screen.getByLabelText("Template") as HTMLTextAreaElement).value).toBe("roto");
    expect(screen.getByText("Cambios sin guardar")).toBeTruthy();
  });

  it("removes the active template only after confirmation", async () => {
    getReportTemplate.mockResolvedValue(TEMPLATE);
    deleteReportTemplate.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderDesigner();

    await user.click(await screen.findByRole("button", { name: "Eliminar template" }));
    expect(deleteReportTemplate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(deleteReportTemplate).toHaveBeenCalledWith("COTIZACION"));
    expect(await screen.findByText("Sin template")).toBeTruthy();
    expect((screen.getByLabelText("Template") as HTMLTextAreaElement).value).toBe("");
  });

  it("explains that the visual designer is not configured without blocking template editing", async () => {
    renderDesigner();
    expect(await screen.findByText("Diseñador Stimulsoft no configurado")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Abrir diseñador Stimulsoft" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText("Template")).toBeTruthy();
    expect(screen.getByLabelText("Subir template")).toBeTruthy();
  });
});
