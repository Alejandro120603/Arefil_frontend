import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PRICE_LIST_COMPARISON_PATH,
  SAME_PRICE_LIST_MESSAGE,
  getPriceListComparison,
  createReport,
  downloadReportData,
  getReportParameterOptions,
  previewReport,
  getReportTemplate,
  saveReportTemplate,
  updateReport,
} from "./reports";
import { ApiError, getUserErrorMessage } from "./errors";
import type { PriceListComparisonResponse } from "@/types/api";

const EMPTY_COMPARISON: PriceListComparisonResponse = {
  report: { code: "PRICE_LIST_COMPARISON", generated_at: "2026-08-24T12:00:00Z" },
  supplier: { id: 1, code: "DONALDSON", name: "Donaldson" },
  list_a: { id: 1, effective_date: "2025-10-20", currency: "MXN", source_filename: "a.xlsx" },
  list_b: { id: 2, effective_date: "2026-01-15", currency: "MXN", source_filename: "b.xlsx" },
  summary: {
    total_products: 0,
    increased: 0,
    decreased: 0,
    unchanged: 0,
    new: 0,
    removed: 0,
    average_percentage_change: null,
  },
  items: [],
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("report manager API", () => {
  it("creates, previews, updates, and exports through the browser proxy", async () => {
    const definition = {
      code: "PRODUCT_CATALOG",
      name: "Catálogo",
      description: null,
      category: null,
      enabled: false,
      data_source_type: "SQL_QUERY" as const,
      active_template_version: null,
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

describe("getPriceListComparison", () => {
  it("posts the A/B ids to the reports endpoint through the browser proxy", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(EMPTY_COMPARISON));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPriceListComparison({ price_list_a_id: 1, price_list_b_id: 2 })).resolves.toEqual(
      EMPTY_COMPARISON,
    );

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`/backend-api${PRICE_LIST_COMPARISON_PATH}`);
    // The internal Docker hostname must never be reachable from the browser.
    expect(String(url)).not.toContain("backend:8000");
    expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" } });
    expect(JSON.parse(String(init?.body))).toEqual({ price_list_a_id: 1, price_list_b_id: 2 });
  });

  it("refuses to compare a list against itself without touching the network", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPriceListComparison({ price_list_a_id: 5, price_list_b_id: 5 })).rejects.toThrow(
      SAME_PRICE_LIST_MESSAGE,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an empty dataset as a normal response, not an error", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json(EMPTY_COMPARISON)));

    const result = await getPriceListComparison({ price_list_a_id: 1, price_list_b_id: 2 });

    expect(result.items).toEqual([]);
    expect(result.summary.total_products).toBe(0);
    expect(result.summary.average_percentage_change).toBeNull();
  });

  it("surfaces the backend's own message when the lists are incompatible", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ detail: "Las listas de precios A y B deben usar la misma moneda." }, { status: 422 }),
        ),
    );

    await expect(getPriceListComparison({ price_list_a_id: 1, price_list_b_id: 2 })).rejects.toMatchObject({
      status: 422,
      message: "Las listas de precios A y B deben usar la misma moneda.",
    });
  });

  it("reports a missing price list without leaking a stack trace", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ detail: "La lista de precios A #99 no existe." }, { status: 404 })),
    );

    await expect(getPriceListComparison({ price_list_a_id: 99, price_list_b_id: 2 })).rejects.toMatchObject({
      status: 404,
      message: "La lista de precios A #99 no existe.",
    });
  });

  it("turns an unreachable backend into a readable message", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed")));

    await expect(getPriceListComparison({ price_list_a_id: 1, price_list_b_id: 2 })).rejects.toThrow("fetch failed");
  });
});

describe("report templates", () => {
  it("loads the active template and saves the Designer output through the browser proxy", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    const template = '{"ReportVersion":"2026.3.2","ReportName":"Edited","Pages":{"0":{}}}';
    const saved = {
      report_code: "PRICE_LIST_COMPARISON",
      version: 2,
      checksum: "abc",
      created_at: "2026-08-24T12:00:00Z",
      updated_at: "2026-08-24T12:00:00Z",
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(template))
      .mockResolvedValueOnce(Response.json(saved, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getReportTemplate("PRICE_LIST_COMPARISON")).resolves.toBe(template);
    await expect(saveReportTemplate("PRICE_LIST_COMPARISON", template)).resolves.toEqual(saved);

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/backend-api/reports/PRICE_LIST_COMPARISON/template");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/backend-api/reports/PRICE_LIST_COMPARISON/template");
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "PUT", body: template });
  });

  it("does not turn backend validation failure into a successful save", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({ detail: "La plantilla excede el tamaño máximo permitido." }, { status: 413 }),
      ),
    );

    await expect(saveReportTemplate("PRICE_LIST_COMPARISON", "too-large")).rejects.toMatchObject({
      status: 413,
      message: "La plantilla excede el tamaño máximo permitido.",
    });
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
