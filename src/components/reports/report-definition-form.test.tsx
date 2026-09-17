// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportDefinitionForm } from "./report-definition-form";
import { ApiError } from "@/lib/api/errors";
import type { ReportAdminDefinition, ReportDataSource, ReportDefinition } from "@/types/api";

const { push, refresh, createReport, updateReport, listReportDataSources } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  createReport: vi.fn(),
  updateReport: vi.fn(),
  listReportDataSources: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/api/reports", () => ({
  createReport,
  updateReport,
  listReportDataSources,
}));

const PRODUCT_SOURCE: ReportDataSource = {
  id: 1,
  code: "PRODUCT_CATALOG",
  name: "Catálogo de productos",
  description: "Catálogo actual de productos disponibles.",
  enabled: true,
  capabilities: [],
  parameters: [],
  fields: [
    { key: "product.part_number", label: "Número de parte", data_type: "string", group: "Producto", required_context: "product" },
  ],
};

const HISTORY_SOURCE: ReportDataSource = {
  id: 2,
  code: "PRICE_HISTORY",
  name: "Historial de precios",
  description: "Evolución cronológica del precio.",
  enabled: true,
  capabilities: [],
  parameters: [{
    name: "product_id",
    label: "Producto",
    data_type: "integer",
    input_type: "select",
    required: true,
    default_value: null,
    display_order: 0,
    configuration_json: { options_source: "products" },
  }],
  fields: [
    { key: "price_history.absolute_change", label: "Cambio absoluto", data_type: "decimal", group: "Historial", required_context: "price_history" },
  ],
};

const PRICE_LIST_PARAMETER = {
  name: "price_list_id",
  label: "Lista de precios",
  data_type: "integer" as const,
  input_type: "select" as const,
  required: true,
  default_value: null,
  display_order: 0,
  configuration_json: { options_source: "price_lists" as const },
};

const QUOTATION_SOURCE: ReportDataSource = {
  id: 3,
  code: "QUOTATION_ROWS",
  name: "Renglones de cotización",
  description: "Renglones capturados por producto.",
  enabled: true,
  capabilities: ["REPEATABLE_ROWS"],
  parameters: [PRICE_LIST_PARAMETER],
  fields: [
    { key: "system.row_number", label: "Número de renglón", data_type: "integer", group: "Sistema", required_context: "row" },
  ],
};

const REPORT: ReportAdminDefinition = {
  code: "PRODUCT_REPORT",
  name: "Catálogo",
  description: "Productos",
  category: "Catálogo",
  filename_template: null,
  enabled: true,
  data_source_id: PRODUCT_SOURCE.id,
  data_source: PRODUCT_SOURCE,
  parameters: [],
  parameter_groups: [],
  created_at: "2026-08-25T12:00:00Z",
  updated_at: "2026-08-25T12:00:00Z",
};

const QUOTATION_REPORT: ReportAdminDefinition = {
  ...REPORT,
  code: "COTIZACION",
  name: "Cotización",
  data_source_id: QUOTATION_SOURCE.id,
  data_source: QUOTATION_SOURCE,
  parameters: [PRICE_LIST_PARAMETER],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  listReportDataSources.mockResolvedValue([PRODUCT_SOURCE, HISTORY_SOURCE, QUOTATION_SOURCE]);
});

describe("ReportDefinitionForm", () => {
  it("loads reusable sources and never renders technical executors or SQL", async () => {
    render(<ReportDefinitionForm />);

    expect(await screen.findByRole("option", { name: "Catálogo de productos" })).toBeTruthy();
    expect(screen.queryByText("SQL_QUERY")).toBeNull();
    expect(screen.queryByText("HANDLER")).toBeNull();
    expect(screen.queryByLabelText("Consulta")).toBeNull();
    expect(listReportDataSources).toHaveBeenCalledTimes(1);
  });

  it("selects a source, shows metadata, and creates without query_text", async () => {
    const user = userEvent.setup();
    createReport.mockResolvedValue({ ...REPORT } satisfies ReportDefinition);
    render(<ReportDefinitionForm />);

    await screen.findByRole("option", { name: "Catálogo de productos" });
    await user.type(screen.getByLabelText("Nombre"), "Catálogo");
    await user.type(screen.getByLabelText("Código"), "product-report");
    await user.selectOptions(screen.getByLabelText("Fuente de datos"), String(PRODUCT_SOURCE.id));

    expect(screen.getByText(PRODUCT_SOURCE.description!)).toBeTruthy();
    expect(screen.getByText("Número de parte")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Crear reporte" }));

    await waitFor(() => expect(createReport).toHaveBeenCalledTimes(1));
    expect(createReport.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      code: "PRODUCT_REPORT",
      data_source_id: PRODUCT_SOURCE.id,
      enabled: true,
      parameters: [],
    }));
    expect(createReport.mock.calls[0]?.[0]).not.toHaveProperty("query_text");
    expect(createReport.mock.calls[0]?.[0]).not.toHaveProperty("data_source_type");
    expect(push).toHaveBeenCalledWith("/administracion/reportes/PRODUCT_REPORT");
  });

  it("loads source parameters from backend metadata and locks their contract", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    render(<ReportDefinitionForm />);
    await screen.findByRole("option", { name: "Historial de precios" });

    await user.selectOptions(screen.getByLabelText("Fuente de datos"), String(HISTORY_SOURCE.id));

    const sourceSection = screen.getByRole("region", { name: "Parámetros de fuente" });
    expect(within(sourceSection).getByDisplayValue("product_id")).toBeTruthy();
    expect(screen.getByText("Cambio absoluto")).toBeTruthy();
    expect((screen.getByDisplayValue("product_id") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Etiqueta") as HTMLInputElement).disabled).toBe(false);
    expect(within(screen.getByRole("region", { name: "Parámetros del reporte" }))
      .getByText(/no declara parámetros propios/)).toBeTruthy();
  });

  it("separates the source contract from the report's own parameters and saves both", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    updateReport.mockResolvedValue({ ...QUOTATION_REPORT });
    render(<ReportDefinitionForm report={QUOTATION_REPORT} />);
    await screen.findByRole("option", { name: "Renglones de cotización" });

    const sourceSection = screen.getByRole("region", { name: "Parámetros de fuente" });
    expect((within(sourceSection).getByDisplayValue("price_list_id") as HTMLInputElement).disabled).toBe(true);

    const reportSection = screen.getByRole("region", { name: "Parámetros del reporte" });
    await user.selectOptions(within(reportSection).getByLabelText("Agregar parámetro común"), "customer_name");
    await user.selectOptions(within(reportSection).getByLabelText("Agregar parámetro común"), "tax_rate");
    // A report parameter stays editable, unlike the source contract above.
    expect((screen.getByDisplayValue("customer_name") as HTMLInputElement).disabled).toBe(false);

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(updateReport).toHaveBeenCalledTimes(1));
    expect(updateReport.mock.calls[0]?.[1].parameters).toEqual([
      expect.objectContaining({ name: "price_list_id", data_type: "integer", required: true, display_order: 0 }),
      expect.objectContaining({ name: "customer_name", label: "Cliente", data_type: "string", display_order: 1 }),
      expect.objectContaining({ name: "tax_rate", label: "IVA %", data_type: "decimal", display_order: 2 }),
    ]);
  });

  it("keeps the report's own parameters when the data source changes", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    render(<ReportDefinitionForm report={QUOTATION_REPORT} />);
    await screen.findByRole("option", { name: "Historial de precios" });

    const reportSection = screen.getByRole("region", { name: "Parámetros del reporte" });
    await user.selectOptions(within(reportSection).getByLabelText("Agregar parámetro común"), "customer_name");
    await user.selectOptions(screen.getByLabelText("Fuente de datos"), String(HISTORY_SOURCE.id));

    expect(screen.getByDisplayValue("customer_name")).toBeTruthy();
    expect(screen.queryByDisplayValue("price_list_id")).toBeNull();
    expect(screen.getByDisplayValue("product_id")).toBeTruthy();
  });

  it("refuses to save a report that dropped a parameter its source requires", async () => {
    const user = userEvent.setup();
    render(<ReportDefinitionForm report={{ ...QUOTATION_REPORT, parameters: [] }} />);
    await screen.findByRole("option", { name: "Renglones de cotización" });

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("La fuente requiere el parámetro 'price_list_id'.")).toBeTruthy();
    expect(updateReport).not.toHaveBeenCalled();
  });

  it("preserves form data and surfaces catalog and create errors", async () => {
    const user = userEvent.setup();
    createReport.mockRejectedValue(new Error("network"));
    render(<ReportDefinitionForm />);
    await screen.findByRole("option", { name: "Catálogo de productos" });

    await user.type(screen.getByLabelText("Nombre"), "Sin guardar");
    await user.type(screen.getByLabelText("Código"), "FAILED_REPORT");
    await user.selectOptions(screen.getByLabelText("Fuente de datos"), String(PRODUCT_SOURCE.id));
    await user.click(screen.getByRole("button", { name: "Crear reporte" }));

    expect(await screen.findByText("No se pudo guardar el reporte. Tus cambios siguen en el formulario.")).toBeTruthy();
    expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe("Sin guardar");
    expect(push).not.toHaveBeenCalled();
  });

  it("saves the filename pattern built from the supported placeholders", async () => {
    const user = userEvent.setup();
    updateReport.mockResolvedValue({ ...QUOTATION_REPORT, filename_template: "{{parameters.price_list_id}}" });
    render(<ReportDefinitionForm report={QUOTATION_REPORT} />);
    await screen.findByRole("option", { name: "Renglones de cotización" });

    await user.click(screen.getByRole("button", { name: "{{parameters.price_list_id}}" }));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(updateReport).toHaveBeenCalledTimes(1));
    expect(updateReport.mock.calls[0]?.[1].filename_template).toBe("{{parameters.price_list_id}}");
  });

  it("sends null when the pattern is cleared, keeping the backend fallback", async () => {
    const user = userEvent.setup();
    updateReport.mockResolvedValue({ ...QUOTATION_REPORT, filename_template: null });
    render(<ReportDefinitionForm report={{ ...QUOTATION_REPORT, filename_template: "{{report.code}}" }} />);
    await screen.findByRole("option", { name: "Renglones de cotización" });

    await user.clear(screen.getByLabelText("Patrón del nombre"));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(updateReport).toHaveBeenCalledTimes(1));
    expect(updateReport.mock.calls[0]?.[1].filename_template).toBeNull();
  });

  it("refuses locally a placeholder the backend does not support", async () => {
    const user = userEvent.setup();
    render(<ReportDefinitionForm report={{ ...QUOTATION_REPORT, filename_template: "{{execution.id}}" }} />);
    await screen.findByRole("option", { name: "Renglones de cotización" });

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findAllByText("Placeholder no permitido en el nombre de archivo: {{execution.id}}."))
      .toHaveLength(2);
    expect(updateReport).not.toHaveBeenCalled();
  });

  it("keeps the edited pattern when the backend rejects it", async () => {
    const user = userEvent.setup();
    updateReport.mockRejectedValue(
      new ApiError(400, "El parámetro 'folio' usado por filename_template no está definido."),
    );
    render(<ReportDefinitionForm report={{ ...QUOTATION_REPORT, filename_template: "{{report.code}}" }} />);
    await screen.findByRole("option", { name: "Renglones de cotización" });

    const field = screen.getByLabelText("Patrón del nombre");
    await user.clear(field);
    await user.click(field);
    await user.paste("{{report.name}} final");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText(/no está definido/)).toBeTruthy();
    expect((screen.getByLabelText("Patrón del nombre") as HTMLInputElement).value)
      .toBe("{{report.name}} final");
  });

  it("shows a migrated report whose source is now disabled", async () => {
    listReportDataSources.mockResolvedValue([HISTORY_SOURCE]);
    render(<ReportDefinitionForm report={{ ...REPORT, data_source: { ...PRODUCT_SOURCE, enabled: false } }} />);

    expect(await screen.findByText("Fuente deshabilitada")).toBeTruthy();
    expect(screen.getByRole("option", { name: /Catálogo de productos.*deshabilitada/ })).toBeTruthy();
  });

  it("keeps an internal migrated source visible only on its existing report", async () => {
    listReportDataSources.mockResolvedValue([HISTORY_SOURCE]);
    render(<ReportDefinitionForm report={REPORT} />);

    expect(await screen.findByText("Fuente no seleccionable")).toBeTruthy();
    expect(screen.getByRole("option", { name: /Catálogo de productos.*no seleccionable/ })).toBeTruthy();
    expect(screen.queryByText("SQL_QUERY")).toBeNull();
  });
});
