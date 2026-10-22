// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenericReportRuntime } from "./generic-report-runtime";
import { ApiError } from "@/lib/api/errors";
import { XLSX_MEDIA_TYPE } from "@/lib/reports/report-excel-template";
import type { ReportDefinition } from "@/types/api";
const {
  executeReport, listAllReportParameterOptions, searchReportProductOptions, resolveReportProductOption,
  downloadReportData, downloadReportDocumentXlsx, triggerBrowserDownload,
} = vi.hoisted(() => ({
  executeReport: vi.fn(), listAllReportParameterOptions: vi.fn(), searchReportProductOptions: vi.fn(),
  resolveReportProductOption: vi.fn(), downloadReportData: vi.fn(), downloadReportDocumentXlsx: vi.fn(),
  triggerBrowserDownload: vi.fn(),
}));
vi.mock("@/lib/api/reports", () => ({
  listAllReportParameterOptions,
  searchReportProductOptions,
  resolveReportProductOption,
  downloadReportData,
  downloadReportDocumentXlsx,
  executeReport,
}));
vi.mock("@/lib/download", () => ({ triggerBrowserDownload }));
// Reports here predate letterheads: the options endpoint answers "not supported".
vi.mock("@/lib/api/letterhead-runtime", () => ({
  getReportLetterheadOptions: vi.fn((code: string) => Promise.resolve({
    report_code: code, supported: false, default_letterhead_version_id: null,
    options: [{ letterhead_version_id: null, letterhead_id: null, label: "Sin membrete", is_default: true }],
  })),
}));

const REPORT: ReportDefinition = {
  code: "NO_PARAMETERS",
  name: "Sin parámetros",
  description: null,
  category: null,
  filename_template: null,
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

const EXECUTION_ID = "10d693fd-ecc3-4759-aec7-d3d7cb086eb7";

const PRODUCTS = [
  { value: 101, label: "P-001 · Filtro", product_id: 101, part_number: "P-001", item_number: null, description: "Filtro", unit_price: "115.99", currency: "MXN", classification: null },
  { value: 202, label: "P-002 · Aceite", product_id: 202, part_number: "P-002", item_number: null, description: "Aceite", unit_price: "116.00", currency: "MXN", classification: null },
];

/** Generation waits for the letterhead options (the backend decides support); then click. */
async function clickGenerate(user: ReturnType<typeof userEvent.setup>) {
  // Re-queried: the button moves once the backend answers "not supported".
  await waitFor(() => expect((screen.getByRole("button", { name: "Generar reporte" }) as HTMLButtonElement).disabled).toBe(false));
  await user.click(screen.getByRole("button", { name: "Generar reporte" }));
}

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
    await clickGenerate(user);
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

  it("keeps the dedicated comparison UX while downloads follow its latest execution id", async () => {
    const report: ReportDefinition = {
      ...REPORT,
      code: "PRICE_LIST_COMPARISON",
      name: "Comparación de listas de precios",
      data_source_id: 4,
      data_source: { ...REPORT.data_source, id: 4, code: "PRICE_LIST_COMPARISON", name: "Comparación" },
      parameters: [
        { name: "price_list_a_id", label: "Lista A", input_type: "select", data_type: "integer", required: true, default_value: 1, display_order: 0, configuration_json: { options_source: "price_lists" } },
        { name: "price_list_b_id", label: "Lista B", input_type: "select", data_type: "integer", required: true, default_value: 2, display_order: 1, configuration_json: { options_source: "price_lists" } },
      ],
    };
    listAllReportParameterOptions.mockResolvedValue([
      { value: 1, label: "Donaldson · 2025-01-01" },
      { value: 2, label: "Donaldson · 2026-01-01" },
      { value: 3, label: "Donaldson · 2027-01-01" },
    ]);
    const comparison = (executionId: string, listA: number) => ({
      execution_id: executionId,
      report: { code: "PRICE_LIST_COMPARISON", generated_at: "2026-10-08T12:00:00Z" },
      supplier: { id: 1, code: "DONALDSON", name: "Donaldson" },
      list_a: { id: listA, effective_date: "2025-01-01", currency: "MXN", source_filename: "a.xlsx" },
      list_b: { id: 2, effective_date: "2026-01-01", currency: "MXN", source_filename: "b.xlsx" },
      summary: { total_products: 0, increased: 0, decreased: 0, unchanged: 0, new: 0, removed: 0, average_percentage_change: null },
      items: [],
    });
    executeReport
      .mockResolvedValueOnce(comparison("comparison-e1", 1))
      .mockResolvedValueOnce(comparison("comparison-e2", 3));
    downloadReportData.mockResolvedValue({ blob: new Blob(["xlsx"]), filename: "PRICE_LIST_COMPARISON-datos.xlsx" });
    const user = userEvent.setup();
    render(<GenericReportRuntime report={report} />);

    await waitFor(() => expect((screen.getByRole("button", { name: "Generar reporte" }) as HTMLButtonElement).disabled).toBe(false));
    await clickGenerate(user);
    expect(await screen.findByRole("heading", { name: "Comparación de listas · Donaldson" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Descargar Excel de datos" }));
    await waitFor(() => expect(downloadReportData).toHaveBeenLastCalledWith(
      "PRICE_LIST_COMPARISON", "xlsx", { executionId: "comparison-e1" }, expect.anything(),
    ));
    expect(executeReport).toHaveBeenCalledTimes(1);

    await user.selectOptions(screen.getByLabelText("Lista A *"), "3");
    expect(screen.queryByRole("heading", { name: "Comparación de listas · Donaldson" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Descargar Excel de datos" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Regenerar reporte" }));
    await user.click(await screen.findByRole("button", { name: "Descargar CSV de datos" }));
    await waitFor(() => expect(downloadReportData).toHaveBeenLastCalledWith(
      "PRICE_LIST_COMPARISON", "csv", { executionId: "comparison-e2" }, expect.anything(),
    ));
    expect(executeReport).toHaveBeenCalledTimes(2);
  });

  it("sends list and manual lines with their origin and shows the backend amounts", async () => {
    const report: ReportDefinition = {
      ...REPORT,
      code: "COTIZACION_PRODUCTOS",
      data_source_id: 5,
      data_source: { ...REPORT.data_source, id: 5, code: "QUOTATION_ROWS", name: "Renglones de cotización", capabilities: ["REPEATABLE_ROWS"] },
      parameters: [{ name: "price_list_id", label: "Lista de precios", input_type: "select", data_type: "integer", required: true, default_value: 7, display_order: 0, configuration_json: { options_source: "price_lists" } }],
      parameter_groups: [{
        name: "items", label: "Productos", resolver_key: "products_by_price_list", context_parameter: "price_list_id", min_items: 1, max_items: null, display_order: 0,
        allow_manual_items: true,
        fields: [
          { name: "product_id", label: "Producto", data_type: "integer", input_type: "select", required: true, default_value: null, display_order: 0, configuration_json: { options_source: "products_by_price_list", context_parameter: "price_list_id" } },
          { name: "quantity", label: "Cantidad", data_type: "integer", input_type: "number", required: true, default_value: 1, display_order: 1, configuration_json: { minimum: "0", exclusive_minimum: true } },
        ],
      }],
    };
    listAllReportParameterOptions.mockResolvedValue([{ value: 7, label: "Donaldson · 2025-10-20" }]);
    searchReportProductOptions.mockResolvedValue(PRODUCTS);
    resolveReportProductOption.mockImplementation((_code, _path, _context, productId) =>
      Promise.resolve(PRODUCTS.find((candidate) => candidate.product_id === productId) ?? null));
    executeReport.mockResolvedValue({
      execution_id: EXECUTION_ID,
      document_available: true,
      columns: [
        { key: "description", label: "Descripción", data_type: "string", format_type: "text" },
        { key: "line_total", label: "Importe", data_type: "decimal", format_type: "currency" },
      ],
      rows: [{ description: "Filtro", line_total: "231.98" }, { description: "Servicio especial", line_total: "800.00" }],
      totals: { line_total: "1031.98" }, row_count: 2, truncated: false,
    });
    const user = userEvent.setup();
    render(<GenericReportRuntime report={report} />);
    await user.click(await screen.findByRole("combobox", { name: "Producto 1" }));
    await user.click(await screen.findByRole("option", { name: /P-001/ }));
    await user.clear(screen.getByLabelText("Cantidad * 1"));
    await user.type(screen.getByLabelText("Cantidad * 1"), "2");
    await user.click(screen.getByRole("button", { name: "Producto fuera de lista" }));
    await clickGenerate(user);
    // An incomplete manual line is never sent.
    expect(executeReport).not.toHaveBeenCalled();
    expect(await screen.findAllByText("Este campo es requerido.")).toHaveLength(2);

    await user.type(screen.getByLabelText("Descripción * 2"), "Servicio especial");
    await user.type(screen.getByLabelText("Precio unitario * 2"), "800");
    await clickGenerate(user);
    await waitFor(() => expect(executeReport).toHaveBeenCalledWith("COTIZACION_PRODUCTOS", {
      price_list_id: 7,
      items: [
        { origin: "LIST_PRODUCT", product_id: 101, quantity: 2 },
        { origin: "MANUAL_PRODUCT", quantity: 1, description: "Servicio especial", unit_price: "800" },
      ],
    }, expect.anything()));
    expect(await screen.findByText("Servicio especial")).toBeTruthy();
  });

  it("shows a USD list's manual-only quotation and its backend totals in USD", async () => {
    const report: ReportDefinition = {
      ...REPORT,
      code: "COTIZACION_PRODUCTOS",
      data_source_id: 5,
      data_source: { ...REPORT.data_source, id: 5, code: "QUOTATION_ROWS", name: "Renglones de cotización", capabilities: ["REPEATABLE_ROWS"] },
      parameters: [{ name: "price_list_id", label: "Lista de precios", input_type: "select", data_type: "integer", required: true, default_value: 9, display_order: 0, configuration_json: { options_source: "price_lists" } }],
      parameter_groups: [{
        name: "items", label: "Productos", resolver_key: "products_by_price_list", context_parameter: "price_list_id", min_items: 0, max_items: null, display_order: 0,
        allow_manual_items: true,
        fields: [
          { name: "product_id", label: "Producto", data_type: "integer", input_type: "select", required: true, default_value: null, display_order: 0, configuration_json: { options_source: "products_by_price_list", context_parameter: "price_list_id" } },
          { name: "quantity", label: "Cantidad", data_type: "integer", input_type: "number", required: true, default_value: 1, display_order: 1, configuration_json: { minimum: "0", exclusive_minimum: true } },
        ],
      }],
    };
    listAllReportParameterOptions.mockResolvedValue([{ value: 9, label: "FLEETGUARD · 2026-01-01 · USD", currency: "USD" }]);
    executeReport.mockResolvedValue({
      execution_id: EXECUTION_ID,
      document_available: true,
      columns: [
        { key: "description", label: "Descripción", data_type: "string", format_type: "text" },
        { key: "line_total", label: "Importe", data_type: "decimal", format_type: "currency" },
      ],
      rows: [{ description: "Servicio especial", line_total: "1600.00" }],
      summary: { subtotal: "1600.00" },
      totals: { subtotal: "1600.00" }, row_count: 1, truncated: false,
    });
    const user = userEvent.setup();
    render(
      <GenericReportRuntime
        report={report}
        summaries={[{ key: "subtotal", label: "SUBTOTAL", column_key: "line_total", operation: "SUM", formula_definition: null, format_type: "currency" }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Producto fuera de lista" }));
    expect(await screen.findByText("USD")).toBeTruthy();
    await user.type(screen.getByLabelText("Descripción * 1"), "Servicio especial");
    await user.type(screen.getByLabelText("Precio unitario * 1"), "800");
    await user.clear(screen.getByLabelText("Cantidad * 1"));
    await user.type(screen.getByLabelText("Cantidad * 1"), "2");
    await clickGenerate(user);
    await waitFor(() => expect(executeReport).toHaveBeenCalled());
    // Intl separates «USD» with a no-break space; queries normalize it.
    const usd = new Intl.NumberFormat("es-MX", { style: "currency", currency: "USD" }).format(1600).replace(/\s+/g, " ");
    expect((await screen.findAllByText(usd)).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("$1,600.00")).toBeNull();
  });

  it("serializes repeatable rows, renders the backend builder dataset, and invalidates the snapshot after edits", async () => {
    const report: ReportDefinition = {
      ...REPORT,
      code: "COTIZACION",
      filename_template: "legacy_{{parameters.cliente}}",
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
      execution_id: EXECUTION_ID,
      document_available: true,
      columns: [
        { key: "sku", label: "SKU", data_type: "string", format_type: "text" },
        { key: "total", label: "Total", data_type: "decimal", format_type: "currency" },
      ],
      rows: [{ sku: "P-001", total: "208.79" }, { sku: "P-002", total: "580.00" }],
      totals: { total: "788.79" }, row_count: 2, truncated: false,
    });
    downloadReportData.mockResolvedValue({ blob: new Blob(["xlsx"]), filename: "COTIZACION-datos.xlsx" });
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
    await clickGenerate(user);

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
    // The data export renders the snapshot on screen: its id alone, no re-run.
    await waitFor(() => expect(downloadReportData).toHaveBeenCalledWith(
      "COTIZACION", "xlsx", { executionId: EXECUTION_ID }, expect.anything(),
    ));
    await user.click(screen.getByRole("button", { name: "Descargar CSV de datos" }));
    await waitFor(() => expect(downloadReportData).toHaveBeenLastCalledWith(
      "COTIZACION", "csv", { executionId: EXECUTION_ID }, expect.anything(),
    ));
    expect(executeReport).toHaveBeenCalledTimes(1);
    expect(triggerBrowserDownload).toHaveBeenCalledWith(expect.anything(), "COTIZACION-datos.xlsx");

    // The document layer renders from the frozen execution snapshot, never
    // from the parameters the form still holds.
    downloadReportDocumentXlsx.mockResolvedValue({
      blob: new Blob(["xlsx"], { type: XLSX_MEDIA_TYPE }),
      filename: "COTIZACION-documento.xlsx",
    });
    await user.click(screen.getByRole("button", { name: "Descargar documento Excel" }));
    await waitFor(() => expect(downloadReportDocumentXlsx).toHaveBeenCalledWith(
      "COTIZACION", EXECUTION_ID, expect.anything(),
    ));
    expect(triggerBrowserDownload).toHaveBeenLastCalledWith(
      expect.objectContaining({ filename: "COTIZACION-documento.xlsx" }),
      "COTIZACION-documento.xlsx",
    );

    await user.clear(screen.getByLabelText("Cantidad * 1"));
    await user.type(screen.getByLabelText("Cantidad * 1"), "3");
    expect(screen.queryByRole("columnheader", { name: "SKU" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Descargar Excel de datos" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Descargar documento Excel" })).toBeNull();
    expect(screen.getByRole("button", { name: "Regenerar reporte" })).toBeTruthy();

    // Regenerating replaces the id: the obsolete one is never sent again.
    executeReport.mockResolvedValue({
      execution_id: "b9f0a1c2-0000-4000-8000-000000000002",
      document_available: true,
      columns: [{ key: "sku", label: "SKU", data_type: "string", format_type: "text" }],
      rows: [{ sku: "P-001" }], totals: {}, row_count: 1, truncated: false,
    });
    await user.click(screen.getByRole("button", { name: "Regenerar reporte" }));
    await user.click(await screen.findByRole("button", { name: "Descargar documento Excel" }));
    await waitFor(() => expect(downloadReportDocumentXlsx).toHaveBeenLastCalledWith(
      "COTIZACION", "b9f0a1c2-0000-4000-8000-000000000002", expect.anything(),
    ));
  });

  it("offers no document download for a report the backend did not snapshot", async () => {
    const user = userEvent.setup();
    executeReport.mockResolvedValue({ columns: [], rows: [], row_count: 0 });
    render(<GenericReportRuntime report={REPORT} />);
    await clickGenerate(user);
    expect(await screen.findByText("Vista previa del reporte")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Descargar Excel de datos" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Descargar documento Excel" })).toBeNull();
  });

  it("uses document availability from each execution without another request", async () => {
    const user = userEvent.setup();
    executeReport
      .mockResolvedValueOnce({
        execution_id: "execution-without-template",
        document_available: false,
        columns: [], rows: [], summary: {}, totals: {}, row_count: 0, truncated: false,
      })
      .mockResolvedValueOnce({
        execution_id: "execution-with-template",
        document_available: true,
        columns: [], rows: [], summary: {}, totals: {}, row_count: 0, truncated: false,
      });
    render(<GenericReportRuntime report={REPORT} />);

    await clickGenerate(user);
    await screen.findByText("Vista previa del reporte");
    expect(screen.queryByRole("button", { name: "Descargar documento Excel" })).toBeNull();
    expect(screen.getByRole("button", { name: "Descargar Excel de datos" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Descargar CSV de datos" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Regenerar reporte" }));
    expect(await screen.findByRole("button", { name: "Descargar documento Excel" })).toBeTruthy();
    expect(executeReport).toHaveBeenCalledTimes(2);
    expect(downloadReportDocumentXlsx).not.toHaveBeenCalled();
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
    await clickGenerate(user);
    expect(await screen.findByText("valor rechazado")).toBeTruthy();
    expect(screen.getByText("items.0.notes: valor rechazado")).toBeTruthy();
  });

  it("#45: shows the list's name, the line total from the report's formula, and keeps the payload raw", async () => {
    const report: ReportDefinition = {
      ...REPORT,
      code: "SMOKE_COT",
      data_source_id: 5,
      data_source: { ...REPORT.data_source, id: 5, code: "QUOTATION_ROWS", name: "Renglones de cotización", capabilities: ["REPEATABLE_ROWS"] },
      parameters: [
        { name: "price_list_id", label: "Lista de precios", input_type: "select", data_type: "integer", required: true, default_value: null, display_order: 0, configuration_json: { options_source: "price_lists" } },
        { name: "customer_name", label: "Cliente", input_type: "text", data_type: "string", required: false, default_value: null, display_order: 1, configuration_json: null },
      ],
      parameter_groups: [{
        name: "productos", label: "Productos", resolver_key: "products_by_price_list", context_parameter: "price_list_id", min_items: 1, max_items: null, display_order: 0,
        fields: [
          { name: "product_id", label: "Producto", data_type: "integer", input_type: "select", required: true, default_value: null, display_order: 0, configuration_json: { options_source: "products_by_price_list", context_parameter: "price_list_id" } },
          { name: "cantidad", label: "Cantidad", data_type: "integer", input_type: "number", required: true, default_value: 1, display_order: 1, configuration_json: { minimum: "0", exclusive_minimum: true } },
          { name: "descuento", label: "Descuento", data_type: "decimal", input_type: "number", required: false, default_value: null, display_order: 2, configuration_json: { minimum: "0" } },
        ],
      }],
    };
    const columns = [
      { key: "part_number", label: "Número de parte", column_type: "FIELD", source_field: "product.part_number", source_parameter: null, formula_definition: null, data_type: "string", format_type: "text", display_order: 0, visible: true, width: null },
      { key: "unit_price", label: "Precio unitario", column_type: "FIELD", source_field: "price_list_item.unit_price", source_parameter: null, formula_definition: null, data_type: "decimal", format_type: "number", display_order: 1, visible: true, width: null },
      { key: "cantidad", label: "Cantidad", column_type: "PARAMETER", source_field: null, source_parameter: "productos.cantidad", formula_definition: null, data_type: "integer", format_type: "number", display_order: 2, visible: true, width: null },
      { key: "calculo", label: "Importe", column_type: "FORMULA", source_field: null, source_parameter: null, formula_definition: "unit_price * cantidad", data_type: "decimal", format_type: "number", display_order: 3, visible: true, width: null },
    ] as const;
    const summaries = [{ key: "calculo", label: "Subtotal", column_key: "calculo", operation: "SUM", formula_definition: null, format_type: "number" }] as const;
    const smk = { value: 1, label: "SMK-001 · Filtro sintético A", product_id: 1, part_number: "SMK-001", item_number: "I-1", description: "Filtro sintético A", unit_price: "125.00", currency: "USD", classification: null };
    listAllReportParameterOptions.mockResolvedValue([
      { value: 1, label: "DONALDSON · 2026-10-01 · USD" },
      { value: 2, label: "DONALDSON · 2026-11-01 · USD" },
    ]);
    searchReportProductOptions.mockResolvedValue([smk]);
    resolveReportProductOption.mockResolvedValue(smk);
    executeReport.mockImplementation(async (_code, parameters: { price_list_id: number; customer_name?: string }) => ({
      execution_id: EXECUTION_ID,
      columns: [{ key: "calculo", label: "Importe", data_type: "decimal", format_type: "number" }],
      parameters: { price_list_id: parameters.price_list_id, customer_name: parameters.customer_name },
      rows: [{ calculo: "250.00" }], summary: { calculo: "250.00" }, totals: {}, row_count: 1, truncated: false,
    }));
    const user = userEvent.setup();
    render(<GenericReportRuntime report={report} summaries={[...summaries]} columns={[...columns]} />);

    await user.selectOptions(await screen.findByLabelText("Lista de precios *"), "1");
    await user.type(screen.getByLabelText("Cliente"), "ACME");
    await user.click(screen.getByRole("combobox", { name: "Producto 1" }));
    await user.click(await screen.findByRole("option", { name: /SMK-001/ }));
    await user.clear(screen.getByLabelText("Cantidad * 1"));
    await user.type(screen.getByLabelText("Cantidad * 1"), "2");
    // Line total: the report's own `unit_price * cantidad`, in the list's currency.
    expect(screen.getByText("USD 250.00")).toBeTruthy();

    await clickGenerate(user);
    await waitFor(() => expect(executeReport).toHaveBeenCalledWith("SMOKE_COT", {
      price_list_id: 1,
      customer_name: "ACME",
      productos: [{ product_id: 1, cantidad: 2 }],
    }, expect.anything()));
    expect(await screen.findByText("DONALDSON · 2026-10-01 · USD", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText("ACME", { selector: "dd" })).toBeTruthy();
    expect(screen.queryByText("1", { selector: "dd" })).toBeNull();

    // Another list: the label follows the value actually sent.
    await user.selectOptions(screen.getByLabelText("Lista de precios *"), "2");
    await user.click(await screen.findByRole("button", { name: /Generar reporte|Regenerar reporte/ }));
    await waitFor(() => expect(executeReport).toHaveBeenLastCalledWith("SMOKE_COT", expect.objectContaining({ price_list_id: 2 }), expect.anything()));
    expect(await screen.findByText("DONALDSON · 2026-11-01 · USD", { selector: "dd" })).toBeTruthy();
    expect(screen.queryByText("DONALDSON · 2026-10-01 · USD", { selector: "dd" })).toBeNull();
    expect(listAllReportParameterOptions).toHaveBeenCalledTimes(1);
  });

  it("sends Cliente, Atención and a typed Folio, omits a blank Folio, and shows the generated one", async () => {
    const contact = (name: string, label: string, display_order: number) => ({
      name, label, input_type: "text" as const, data_type: "string" as const, required: false, default_value: null, display_order, configuration_json: null,
    });
    const report: ReportDefinition = {
      ...REPORT,
      code: "PRODUCTOS_DESCUENTO",
      name: "Productos con descuento",
      data_source_id: 5,
      data_source: { ...REPORT.data_source, id: 5, code: "QUOTATION_ROWS", name: "Renglones de cotización", capabilities: ["REPEATABLE_ROWS"] },
      parameters: [
        { name: "price_list_id", label: "Lista de precios", input_type: "select", data_type: "integer", required: true, default_value: null, display_order: 0, configuration_json: { options_source: "price_lists" } },
        contact("cliente", "Cliente", 1),
        contact("atencion", "Atención", 2),
        contact("folio", "Folio", 3),
      ],
      parameter_groups: [{
        name: "items", label: "Productos", resolver_key: "products_by_price_list", context_parameter: "price_list_id", min_items: 1, max_items: null, display_order: 0,
        fields: [
          { name: "product_id", label: "Producto", data_type: "integer", input_type: "select", required: true, default_value: null, display_order: 0, configuration_json: { options_source: "products_by_price_list", context_parameter: "price_list_id" } },
          { name: "quantity", label: "Cantidad", data_type: "integer", input_type: "number", required: true, default_value: 1, display_order: 1, configuration_json: { minimum: "0", exclusive_minimum: true } },
          { name: "discount", label: "Descuento", data_type: "decimal", input_type: "number", required: true, default_value: "0", display_order: 2, configuration_json: { minimum: "0", maximum: "100" } },
        ],
      }],
    };
    listAllReportParameterOptions.mockResolvedValue([{ value: 7, label: "FLEETGUARD · 2026-07-01 · MXN", currency: "MXN" }]);
    searchReportProductOptions.mockResolvedValue(PRODUCTS);
    resolveReportProductOption.mockResolvedValue(PRODUCTS[0]);
    const GENERATED = "COT-20261022-7K3M9Q";
    executeReport.mockImplementation(async (_code, parameters: Record<string, unknown>) => ({
      execution_id: EXECUTION_ID,
      document_available: true,
      columns: [{ key: "line_total", label: "Importe", data_type: "decimal", format_type: "currency" }],
      // What the backend froze: blank texts become null and a blank folio is generated.
      parameters: {
        price_list_id: parameters.price_list_id,
        cliente: parameters.cliente ?? null,
        atencion: parameters.atencion ?? null,
        folio: parameters.folio ?? GENERATED,
      },
      rows: [{ line_total: "208.78" }], summary: { subtotal: "208.78", tax: "33.40", grand_total: "242.18" }, totals: {}, row_count: 1, truncated: false,
    }));
    const user = userEvent.setup();
    render(<GenericReportRuntime report={report} />);

    // The three fields are offered; none is required.
    for (const label of ["Cliente", "Atención", "Folio"]) {
      expect((screen.getByLabelText(label) as HTMLInputElement).required).toBe(false);
    }
    expect(screen.getByText("Si lo dejas vacío, el sistema genera un folio automáticamente.")).toBeTruthy();
    await user.selectOptions(await screen.findByLabelText("Lista de precios *"), "7");
    await user.type(screen.getByLabelText("Cliente"), "ACME, S.A. de C.V.");
    await user.type(screen.getByLabelText("Atención"), "Ing. Pérez");
    await user.click(screen.getByRole("combobox", { name: "Producto 1" }));
    await user.click(await screen.findByRole("option", { name: /P-001/ }));
    await user.clear(screen.getByLabelText("Descuento (%) * 1"));
    await user.type(screen.getByLabelText("Descuento (%) * 1"), "10");
    await clickGenerate(user);

    // A blank Folio is simply not sent: the backend generates it.
    await waitFor(() => expect(executeReport).toHaveBeenCalledWith("PRODUCTOS_DESCUENTO", {
      price_list_id: 7,
      cliente: "ACME, S.A. de C.V.",
      atencion: "Ing. Pérez",
      items: [{ product_id: 101, quantity: 1, discount: "10" }],
    }, expect.anything()));
    expect(await screen.findByText(GENERATED, { selector: "dd" })).toBeTruthy();
    expect(screen.getByText("Folio:", { selector: "dt" })).toBeTruthy();
    expect(screen.getByText("ACME, S.A. de C.V.", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText("Ing. Pérez", { selector: "dd" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Descargar documento Excel" })).toBeTruthy();

    // A typed Folio travels as is and the preview shows that one.
    await user.type(screen.getByLabelText("Folio"), "Q-2026-0042");
    expect(screen.queryByText(GENERATED, { selector: "dd" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Regenerar reporte" }));
    await waitFor(() => expect(executeReport).toHaveBeenLastCalledWith("PRODUCTOS_DESCUENTO", expect.objectContaining({
      folio: "Q-2026-0042", cliente: "ACME, S.A. de C.V.", atencion: "Ing. Pérez",
    }), expect.anything()));
    expect(await screen.findByText("Q-2026-0042", { selector: "dd" })).toBeTruthy();
  });

  it("#45 G: a preselected default list is labelled without being picked by hand", async () => {
    const report: ReportDefinition = {
      ...REPORT,
      code: "LISTA",
      parameters: [{ name: "price_list_id", label: "Lista de precios", input_type: "select", data_type: "integer", required: true, default_value: 7, display_order: 0, configuration_json: { options_source: "price_lists" } }],
    };
    listAllReportParameterOptions.mockResolvedValue([{ value: 7, label: "Donaldson · 2025-10-20" }]);
    executeReport.mockResolvedValue({
      execution_id: EXECUTION_ID, columns: [], parameters: { price_list_id: 7 }, rows: [], summary: {}, totals: {}, row_count: 0, truncated: false,
    });
    const user = userEvent.setup();
    render(<GenericReportRuntime report={report} />);
    await waitFor(() => expect((screen.getByRole("button", { name: "Generar reporte" }) as HTMLButtonElement).disabled).toBe(false));
    await clickGenerate(user);
    expect(await screen.findByText("Donaldson · 2025-10-20", { selector: "dd" })).toBeTruthy();
    await waitFor(() => expect(executeReport).toHaveBeenCalledWith("LISTA", { price_list_id: 7 }, expect.anything()));
  });
});
