// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportDefinitionForm } from "./report-definition-form";
import type { ReportAdminDefinition, ReportDefinition } from "@/types/api";

const { push, refresh, createReport, updateReport, previewReport } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  createReport: vi.fn(),
  updateReport: vi.fn(),
  previewReport: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/api/reports", () => ({
  createReport,
  updateReport,
  previewReport,
  getReportParameterOptions: vi.fn().mockResolvedValue([]),
}));

const SQL_REPORT: ReportAdminDefinition = {
  code: "PRODUCT_CATALOG",
  name: "Catálogo",
  description: "Productos",
  category: "Catálogo",
  enabled: false,
  data_source_type: "SQL_QUERY",
  data_source_key: null,
  query_text: "SELECT id FROM products",
  active_template_version: null,
  parameters: [],
  parameter_groups: [],
  created_at: "2026-08-25T12:00:00Z",
  updated_at: "2026-08-25T12:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReportDefinitionForm", () => {
  it("creates a SQL report once and navigates only after backend confirmation", async () => {
    const user = userEvent.setup();
    createReport.mockResolvedValue({ ...SQL_REPORT } satisfies ReportDefinition);
    render(<ReportDefinitionForm />);

    await user.type(screen.getByLabelText("Nombre"), "Catálogo");
    await user.type(screen.getByLabelText("Código"), "product-catalog");
    await user.type(screen.getByLabelText("Consulta"), "SELECT id FROM products");
    await user.click(screen.getByRole("button", { name: "Crear reporte" }));

    await waitFor(() => expect(createReport).toHaveBeenCalledTimes(1));
    expect(createReport.mock.calls[0]?.[0]).toMatchObject({
      code: "PRODUCT_CATALOG",
      data_source_type: "SQL_QUERY",
      enabled: false,
    });
    expect(push).toHaveBeenCalledWith("/administracion/reportes/PRODUCT_CATALOG");
  });

  it("preserves form data and never announces success when creation fails", async () => {
    const user = userEvent.setup();
    createReport.mockRejectedValue(new Error("network"));
    render(<ReportDefinitionForm />);

    await user.type(screen.getByLabelText("Nombre"), "Sin guardar");
    await user.type(screen.getByLabelText("Código"), "FAILED_REPORT");
    await user.type(screen.getByLabelText("Consulta"), "SELECT 1");
    await user.click(screen.getByRole("button", { name: "Crear reporte" }));

    expect(await screen.findByText("No se pudo guardar el reporte. Tus cambios siguen en el formulario.")).toBeTruthy();
    expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe("Sin guardar");
    expect(push).not.toHaveBeenCalled();
  });

  it("previews a persisted clean SQL definition and identifies the limited sample", async () => {
    const user = userEvent.setup();
    previewReport.mockResolvedValue({ columns: ["id"], rows: [{ id: 1 }], row_count: 1, truncated: false });
    render(<ReportDefinitionForm report={SQL_REPORT} />);

    await user.click(screen.getByRole("button", { name: "Probar consulta" }));

    expect(await screen.findByText("Muestra de datos")).toBeTruthy();
    expect(screen.getByText("Preview limitado")).toBeTruthy();
    expect(previewReport).toHaveBeenCalledWith("PRODUCT_CATALOG", {});
  });

  it("switches to the only allow-listed handler and locks its contract", async () => {
    const user = userEvent.setup();
    render(<ReportDefinitionForm />);

    await user.selectOptions(screen.getByLabelText("Tipo de fuente"), "HANDLER");

    expect((screen.getByDisplayValue("price_list_a_id") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByDisplayValue("price_list_b_id") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/No se aceptan nombres de función/)).toBeTruthy();
    expect(screen.queryByLabelText("Consulta")).toBeNull();
  });

  it("creates the repeatable_rows handler with an editable price-list context", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    createReport.mockResolvedValue({ ...SQL_REPORT, code: "COTIZACION", name: "Cotización", data_source_type: "HANDLER", enabled: true });
    render(<ReportDefinitionForm />);
    await user.type(screen.getByLabelText("Nombre"), "Cotización");
    await user.type(screen.getByLabelText("Código"), "COTIZACION");
    await user.selectOptions(screen.getByLabelText("Tipo de fuente"), "HANDLER");
    await user.selectOptions(screen.getByLabelText("Handler permitido"), "repeatable_rows");

    expect((screen.getByDisplayValue("price_list_id") as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByDisplayValue("price_list_a_id")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Crear reporte" }));
    await waitFor(() => expect(createReport).toHaveBeenCalledWith(expect.objectContaining({
      code: "COTIZACION", data_source_type: "HANDLER", data_source_key: "repeatable_rows", enabled: true,
      parameters: [expect.objectContaining({ name: "price_list_id", configuration_json: { options_source: "price_lists" } })],
    })));
  });
});
