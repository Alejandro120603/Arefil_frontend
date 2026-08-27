import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createReport,
  downloadReportData,
  executeReport,
  getReportParameterOptions,
  previewReport,
  updateReport,
  getReportBuilder,
  getReportFieldCatalog,
  previewReportBuilder,
  saveReportBuilder,
} from "./reports";
import { ApiError, getUserErrorMessage } from "./errors";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("report manager API", () => {
  it("executes any report through the generic data endpoint", async () => {
    const payload = { columns: ["id"], rows: [{ id: 1 }], row_count: 1 };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));
    vi.stubGlobal("fetch", fetchMock);

    await expect(executeReport("PRODUCT CATALOG", { supplier_id: 8 })).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/backend-api/reports/PRODUCT%20CATALOG/data",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ supplier_id: 8 }) }),
    );
  });

  it("passes scalar context when loading options for a repeatable field", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json([{ value: 101, label: "P-001 · Filtro" }]));
    vi.stubGlobal("fetch", fetchMock);
    await getReportParameterOptions("COTIZACION", "items.product_id", { price_list_id: 7 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/backend-api/reports/COTIZACION/parameters/items.product_id/options?price_list_id=7",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("prefers an RFC 5987 backend filename and removes path separators", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("csv", {
      headers: { "Content-Disposition": "attachment; filename=fallback.csv; filename*=UTF-8''reporte%20agosto%2Ffinal.csv" },
    })));
    await expect(downloadReportData("REPORT", "csv", {})).resolves.toMatchObject({
      filename: "reporte agosto_final.csv",
    });
  });

  it("creates, previews, updates, and exports through the browser proxy", async () => {
    const definition = {
      code: "PRODUCT_CATALOG",
      name: "Catálogo",
      description: null,
      category: null,
      enabled: false,
      data_source_type: "SQL_QUERY" as const,
      parameters: [],
      created_at: "2026-08-25T12:00:00Z",
      updated_at: "2026-08-25T12:00:00Z",
    };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(definition, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ columns: ["id"], rows: [{ id: 1 }], row_count: 1, truncated: false }))
      .mockResolvedValueOnce(Response.json([{ value: 1, label: "Donaldson" }]))
      .mockResolvedValueOnce(Response.json({ ...definition, enabled: true }))
      .mockResolvedValueOnce(new Response("csv", { headers: { "Content-Disposition": 'attachment; filename="product-catalog.csv"' } }));
    vi.stubGlobal("fetch", fetchMock);

    const createRequest = {
      code: definition.code,
      name: definition.name,
      description: null,
      category: null,
      data_source_type: "SQL_QUERY" as const,
      data_source_key: null,
      query_text: "SELECT id FROM products",
      enabled: false,
      parameters: [],
    };
    await expect(createReport(createRequest)).resolves.toEqual(definition);
    await expect(previewReport(definition.code, {})).resolves.toMatchObject({ row_count: 1 });
    await expect(getReportParameterOptions(definition.code, "supplier_id")).resolves.toEqual([{ value: 1, label: "Donaldson" }]);
    await expect(updateReport(definition.code, { ...createRequest, enabled: true })).resolves.toMatchObject({ enabled: true });
    await expect(downloadReportData(definition.code, "csv", {})).resolves.toMatchObject({ filename: "product-catalog.csv" });

    expect(fetchMock.mock.calls.map((call) => [call[0], call[1]?.method])).toEqual([
      ["/backend-api/reports", "POST"],
      ["/backend-api/reports/PRODUCT_CATALOG/preview", "POST"],
      ["/backend-api/reports/PRODUCT_CATALOG/parameters/supplier_id/options", "GET"],
      ["/backend-api/reports/PRODUCT_CATALOG", "PATCH"],
      ["/backend-api/reports/PRODUCT_CATALOG/export/csv", "POST"],
    ]);
  });

  it("does not turn create or preview backend errors into success", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ detail: "El reporte DUPLICATE ya existe." }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ detail: "near FROM: syntax error" }, { status: 422 })));
    const request = {
      code: "DUPLICATE", name: "Duplicate", description: null, category: null,
      data_source_type: "SQL_QUERY" as const, data_source_key: null, query_text: "SELECT 1",
      enabled: false, parameters: [],
    };
    await expect(createReport(request)).rejects.toMatchObject({ status: 409 });
    await expect(previewReport("DUPLICATE", {})).rejects.toMatchObject({ status: 422 });
  });
});

describe("getUserErrorMessage", () => {
  it("keeps the backend's wording but hides transport failures", () => {
    expect(getUserErrorMessage(new ApiError(404, "La lista de precios B #99 no existe."), "generico")).toBe(
      "La lista de precios B #99 no existe.",
    );
    expect(getUserErrorMessage(new TypeError("fetch failed"), "No fue posible generar la comparación.")).toBe(
      "No fue posible generar la comparación.",
    );
    expect(getUserErrorMessage({ stack: "Traceback..." }, "generico")).toBe("generico");
  });
});

describe("report builder API", () => {
  it("reads the field catalog from the backend, never from a local constant", async () => {
    const catalog = [
      { key: "product.part_number", label: "Número de parte", data_type: "string", group: "Producto", required_context: "product" },
    ];
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(catalog));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getReportFieldCatalog()).resolves.toEqual(catalog);
    expect(fetchMock).toHaveBeenCalledWith(
      "/backend-api/report-builder/fields",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("loads a builder through the same-origin proxy", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ report: {}, columns: [], excel_layout: null }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getReportBuilder("COTIZACION");
    expect(fetchMock).toHaveBeenCalledWith(
      "/backend-api/reports/COTIZACION/builder",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("saves columns and layout in a single transactional PUT", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ report: {}, columns: [], excel_layout: null }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = {
      columns: [{
        key: "sku", label: "SKU", column_type: "FIELD" as const,
        source_field: "product.part_number", source_parameter: null, formula_definition: null,
        data_type: "string" as const, format_type: "text" as const, display_order: 0, visible: true, width: 18,
      }],
      parameter_groups: [],
      excel_layout: {
        sheet_name: "Data", title: null, show_report_name: true, show_generated_at: true,
        show_parameters: true, freeze_header: true, header_row: 1, totals: [],
      },
    };
    await saveReportBuilder("COTIZACION", request);
    expect(fetchMock).toHaveBeenCalledWith(
      "/backend-api/reports/COTIZACION/builder",
      expect.objectContaining({ method: "PUT", body: JSON.stringify(request) }),
    );
  });

  it("posts the bare parameter map to the builder preview", async () => {
    const payload = { columns: [], rows: [], totals: {}, row_count: 0, truncated: false };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload));
    vi.stubGlobal("fetch", fetchMock);

    await expect(previewReportBuilder("COTIZACION", { quantity: 3 })).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/backend-api/reports/COTIZACION/builder/preview",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ quantity: 3 }) }),
    );
  });

  it("surfaces the backend's own formula message instead of a generic one", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ detail: "Las fórmulas contienen una dependencia cíclica." }, { status: 422 }),
    ));

    const error = await saveReportBuilder("COTIZACION", {
      columns: [],
      parameter_groups: [],
      excel_layout: {
        sheet_name: "Data", title: null, show_report_name: true, show_generated_at: true,
        show_parameters: true, freeze_header: true, header_row: 1, totals: [],
      },
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(getUserErrorMessage(error, "fallback")).toBe("Las fórmulas contienen una dependencia cíclica.");
  });
});
