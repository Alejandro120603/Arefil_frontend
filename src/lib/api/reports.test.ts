import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createReport,
  downloadReportData,
  executeReport,
  getReportParameterOptions,
  listAllReportParameterOptions,
  previewReport,
  resolveReportProductOption,
  searchReportProductOptions,
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

const PRODUCT = {
  value: 120, label: "P550202 · Filtro Donaldson", product_id: 120, part_number: "P550202",
  item_number: "1000", description: "Filtro Donaldson", unit_price: "574.13", currency: "MXN", classification: "A",
};

function optionsPage<T>(items: T[], meta: Partial<{ page: number; page_size: number; total_items: number; total_pages: number }> = {}) {
  return { items, meta: { page: 1, page_size: 20, total_items: items.length, total_pages: items.length > 0 ? 1 : 0, ...meta } };
}

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
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(optionsPage([{ value: 101, label: "P-001 · Filtro" }])));
    vi.stubGlobal("fetch", fetchMock);
    await getReportParameterOptions("COTIZACION", "items.product_id", { price_list_id: 7 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/backend-api/reports/COTIZACION/parameters/items.product_id/options?price_list_id=7",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("walks every page of a bounded option source", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(optionsPage([{ value: 1, label: "A" }], { page: 1, total_items: 2, total_pages: 2 })))
      .mockResolvedValueOnce(Response.json(optionsPage([{ value: 2, label: "B" }], { page: 2, total_items: 2, total_pages: 2 })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listAllReportParameterOptions("COTIZACION", "price_list_id")).resolves.toEqual([
      { value: 1, label: "A" }, { value: 2, label: "B" },
    ]);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/backend-api/reports/COTIZACION/parameters/price_list_id/options?page=1&page_size=100",
      "/backend-api/reports/COTIZACION/parameters/price_list_id/options?page=2&page_size=100",
    ]);
  });

  it("searches products server-side inside one price list and never asks for the whole catalog", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(optionsPage([PRODUCT])));
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchReportProductOptions("COTIZACION", "items.product_id", { price_list_id: 7 }, " P550202 ")).resolves.toEqual([PRODUCT]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/backend-api/reports/COTIZACION/parameters/items.product_id/options?search=P550202&page=1&page_size=20&price_list_id=7",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("resolves a selected product against a list and answers null when it does not belong to it", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json(optionsPage([PRODUCT]))));
    await expect(resolveReportProductOption("COTIZACION", "items.product_id", { price_list_id: 7 }, 120))
      .resolves.toEqual(PRODUCT);

    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json(optionsPage([]))));
    await expect(resolveReportProductOption("COTIZACION", "items.product_id", { price_list_id: 9 }, 120))
      .resolves.toBeNull();
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
    const dataSource = {
      id: 1,
      code: "PRODUCT_CATALOG",
      name: "Catálogo de productos",
      description: null,
      enabled: true,
      capabilities: [],
    };
    const definition = {
      code: "PRODUCT_CATALOG",
      name: "Catálogo",
      description: null,
      category: null,
      enabled: false,
      data_source_id: dataSource.id,
      data_source: dataSource,
      parameters: [],
      parameter_groups: [],
      created_at: "2026-08-25T12:00:00Z",
      updated_at: "2026-08-25T12:00:00Z",
    };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(definition, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ columns: ["id"], rows: [{ id: 1 }], row_count: 1, truncated: false }))
      .mockResolvedValueOnce(Response.json(optionsPage([{ value: 1, label: "Donaldson" }])))
      .mockResolvedValueOnce(Response.json({ ...definition, enabled: true }))
      .mockResolvedValueOnce(new Response("csv", { headers: { "Content-Disposition": 'attachment; filename="product-catalog.csv"' } }));
    vi.stubGlobal("fetch", fetchMock);

    const createRequest = {
      code: definition.code,
      name: definition.name,
      description: null,
      category: null,
      data_source_id: dataSource.id,
      enabled: false,
      parameters: [],
    };
    await expect(createReport(createRequest)).resolves.toEqual(definition);
    await expect(previewReport(definition.code, {})).resolves.toMatchObject({ row_count: 1 });
    await expect(getReportParameterOptions(definition.code, "supplier_id")).resolves.toMatchObject({ items: [{ value: 1, label: "Donaldson" }] });
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
      data_source_id: 1,
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

    await expect(getReportFieldCatalog("COTIZACION")).resolves.toEqual(catalog);
    expect(fetchMock).toHaveBeenCalledWith(
      "/backend-api/reports/COTIZACION/builder/fields",
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
