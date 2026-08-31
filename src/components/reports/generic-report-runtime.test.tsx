// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenericReportRuntime } from "./generic-report-runtime";
import { ApiError } from "@/lib/api/errors";
import type { ReportDefinition } from "@/types/api";
const {
  executeReport, listAllReportParameterOptions, searchReportProductOptions, resolveReportProductOption,
  downloadReportData, downloadReportDocument, triggerBrowserDownload,
} = vi.hoisted(() => ({
  executeReport: vi.fn(), listAllReportParameterOptions: vi.fn(), searchReportProductOptions: vi.fn(),
  resolveReportProductOption: vi.fn(), downloadReportData: vi.fn(), downloadReportDocument: vi.fn(),
  triggerBrowserDownload: vi.fn(),
}));
vi.mock("@/lib/api/reports", () => ({
  listAllReportParameterOptions,
  searchReportProductOptions,
  resolveReportProductOption,
  downloadReportData,
  downloadReportDocument,
  executeReport,
}));
vi.mock("@/lib/download", () => ({ triggerBrowserDownload }));

const REPORT: ReportDefinition = {
  code: "NO_PARAMETERS",
  name: "Sin parámetros",
  description: null,
  category: null,
  enabled: true,
  data_source_id: 1,
  data_source: {
    id: 1,
    code: "PRODUCT_CATALOG",
    name: "Catálogo de productos",
    description: null,
    enabled: true,
    capabilities: [],
  },
  parameters: [],
  parameter_groups: [],
  created_at: "2026-08-26T12:00:00Z",
  updated_at: "2026-08-26T12:00:00Z",
};

const PRODUCTS = [
  { value: 101, label: "P-001 · Filtro", product_id: 101, part_number: "P-001", item_number: null, description: "Filtro", unit_price: "115.99", currency: "MXN", classification: null },
  { value: 202, label: "P-002 · Aceite", product_id: 202, part_number: "P-002", item_number: null, description: "Aceite", unit_price: "116.00", currency: "MXN", classification: null },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GenericReportRuntime", () => {
  it("executes a parameterless report and exposes direct backend downloads", async () => {
    const user = userEvent.setup();
    executeReport.mockResolvedValue({ columns: [], rows: [], row_count: 0 });
    render(<GenericReportRuntime report={REPORT} />);
    expect(screen.getByText("Este reporte no requiere parámetros.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Descargar Excel de datos" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Generar reporte" }));
    await waitFor(() => expect(executeReport).toHaveBeenCalledWith("NO_PARAMETERS", {}, expect.anything()));
    expect(await screen.findByText("Vista previa del reporte")).toBeTruthy();
    expect(screen.getByText("La consulta no devolvió filas de muestra.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Descargar Excel de datos" })).toBeTruthy();
  });

  it("blocks invalid required values and A/B with the same list", () => {
    listAllReportParameterOptions.mockResolvedValue([{ value: 7, label: "Lista 7" }]);
    const report: ReportDefinition = {
      ...REPORT,
      code: "PRICE_LIST_COMPARISON",
      data_source_id: 4,
      data_source: { ...REPORT.data_source, id: 4, code: "PRICE_LIST_COMPARISON", name: "Comparación" },
      parameters: [
        { name: "price_list_a_id", label: "Lista A", input_type: "select", data_type: "integer", required: true, default_value: 7, display_order: 0, configuration_json: { options_source: "price_lists" } },
        { name: "price_list_b_id", label: "Lista B", input_type: "select", data_type: "integer", required: true, default_value: 7, display_order: 1, configuration_json: { options_source: "price_lists" } },
      ],
    };
    render(<GenericReportRuntime report={report} />);
    expect(screen.getByText("Selecciona dos listas distintas.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Generar reporte" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("serializes repeatable rows, renders the backend builder dataset, and invalidates the snapshot after edits", async () => {
    const report: ReportDefinition = {
      ...REPORT,
      code: "COTIZACION",
      data_source_id: 5,
      data_source: { ...REPORT.data_source, id: 5, code: "QUOTATION_ROWS", name: "Renglones de cotización", capabilities: ["REPEATABLE_ROWS"] },
      parameters: [{ name: "price_list_id", label: "Lista de precios", input_type: "select", data_type: "integer", required: true, default_value: 7, display_order: 0, configuration_json: { options_source: "price_lists" } }],
      parameter_groups: [{
        name: "items", label: "Productos", resolver_key: "products_by_price_list", context_parameter: "price_list_id", min_items: 1, max_items: 10, display_order: 0,
        fields: [
          { name: "product_id", label: "Producto", data_type: "integer", input_type: "select", required: true, default_value: null, display_order: 0, configuration_json: { options_source: "products_by_price_list", context_parameter: "price_list_id" } },
          { name: "quantity", label: "Cantidad", data_type: "integer", input_type: "number", required: true, default_value: 1, display_order: 1, configuration_json: { minimum: "0", exclusive_minimum: true } },
          { name: "discount", label: "Descuento", data_type: "decimal", input_type: "number", required: false, default_value: "0", display_order: 2, configuration_json: { minimum: "0", maximum: "100" } },
        ],
      }],
    };
    listAllReportParameterOptions.mockResolvedValue([{ value: 7, label: "Donaldson · 2025-10-20" }]);
    searchReportProductOptions.mockResolvedValue(PRODUCTS);
    resolveReportProductOption.mockImplementation((_code, _path, _context, productId) =>
      Promise.resolve(PRODUCTS.find((candidate) => candidate.product_id === productId) ?? null));
    executeReport.mockResolvedValue({
      columns: [
        { key: "sku", label: "SKU", data_type: "string", format_type: "text" },
        { key: "total", label: "Total", data_type: "decimal", format_type: "currency" },
      ],
      rows: [{ sku: "P-001", total: "208.79" }, { sku: "P-002", total: "580.00" }],
      totals: { total: "788.79" }, row_count: 2, truncated: false,
    });
    downloadReportData.mockResolvedValue({ blob: new Blob(["xlsx"]), filename: "cotizacion.xlsx" });
    const user = userEvent.setup();
    render(<GenericReportRuntime report={report} />);
    await user.click(await screen.findByRole("combobox", { name: "Producto 1" }));
    await user.click(await screen.findByRole("option", { name: /P-001/ }));
    await user.clear(screen.getByLabelText("Cantidad * 1"));
    await user.type(screen.getByLabelText("Cantidad * 1"), "2");
    await user.clear(screen.getByLabelText("Descuento (%) 1"));
    await user.type(screen.getByLabelText("Descuento (%) 1"), "10");
    await user.click(screen.getByRole("button", { name: "Agregar producto" }));
    await user.click(screen.getByRole("combobox", { name: "Producto 2" }));
    await user.click(await screen.findByRole("option", { name: /P-002/ }));
    await user.clear(screen.getByLabelText("Cantidad * 2"));
    await user.type(screen.getByLabelText("Cantidad * 2"), "5");
    await user.click(screen.getByRole("button", { name: "Generar reporte" }));

    await waitFor(() => expect(executeReport).toHaveBeenCalledWith("COTIZACION", {
      price_list_id: 7,
      items: [
        { product_id: 101, quantity: 2, discount: "10" },
        { product_id: 202, quantity: 5, discount: "0" },
      ],
    }, expect.anything()));
    expect(await screen.findByRole("columnheader", { name: "SKU" })).toBeTruthy();
    expect(screen.getAllByText("$788.79")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Descargar Excel de datos" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Descargar Excel de datos" }));
    await waitFor(() => expect(downloadReportData).toHaveBeenCalledWith("COTIZACION", "xlsx", {
      price_list_id: 7,
      items: [
        { product_id: 101, quantity: 2, discount: "10" },
        { product_id: 202, quantity: 5, discount: "0" },
      ],
    }, expect.anything()));
    expect(triggerBrowserDownload).toHaveBeenCalledWith(expect.anything(), "cotizacion.xlsx");

    // The document layer renders from the very same validated snapshot.
    downloadReportDocument.mockResolvedValue({ blob: new Blob(["%PDF"]), filename: "cotizacion.pdf" });
    await user.click(screen.getByRole("button", { name: "Descargar PDF" }));
    await waitFor(() => expect(downloadReportDocument).toHaveBeenCalledWith("COTIZACION", "pdf", {
      price_list_id: 7,
      items: [
        { product_id: 101, quantity: 2, discount: "10" },
        { product_id: 202, quantity: 5, discount: "0" },
      ],
    }, expect.anything()));

    await user.clear(screen.getByLabelText("Cantidad * 1"));
    await user.type(screen.getByLabelText("Cantidad * 1"), "3");
    expect(screen.queryByRole("columnheader", { name: "SKU" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Descargar Excel de datos" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Descargar PDF" })).toBeNull();
    expect(screen.getByRole("button", { name: "Regenerar reporte" })).toBeTruthy();
  });

  it("places structured backend errors on the affected repeatable field", async () => {
    const report: ReportDefinition = {
      ...REPORT,
      code: "ROWS",
      parameters: [],
      parameter_groups: [{
        name: "items", label: "Items", resolver_key: "products_by_price_list", context_parameter: "unused",
        min_items: 1, max_items: null, display_order: 0,
        fields: [{ name: "product_id", label: "Producto", data_type: "integer", input_type: "select", required: true, default_value: 101, display_order: 0, configuration_json: { options_source: "products_by_price_list", context_parameter: "unused" } }],
      }],
    };
    // The missing scalar context means no options request; inject a text field instead
    // to exercise the backend's row-location mapping without coupling this assertion to catalogs.
    report.parameter_groups[0].fields[0] = { name: "notes", label: "Notas", data_type: "string", input_type: "text", required: true, default_value: "x", display_order: 0, configuration_json: null };
    executeReport.mockRejectedValue(new ApiError(422, [{ loc: ["items", 0, "notes"], msg: "valor rechazado" }]));
    const user = userEvent.setup();
    render(<GenericReportRuntime report={report} />);
    await user.click(screen.getByRole("button", { name: "Generar reporte" }));
    expect(await screen.findByText("valor rechazado")).toBeTruthy();
    expect(screen.getByText("items.0.notes: valor rechazado")).toBeTruthy();
  });
});
