import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PRICE_LIST_COMPARISON_PATH,
  SAME_PRICE_LIST_MESSAGE,
  getPriceListComparison,
  getReportTemplate,
  saveReportTemplate,
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
