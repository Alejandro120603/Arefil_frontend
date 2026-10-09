import { afterEach, describe, expect, it, vi } from "vitest";
import { previewPriceListImport } from "./imports";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("price-list import API", () => {
  it.each([
    ["DONALDSON", "/backend-api/imports/donaldson/preview"],
    ["FLEETGUARD", "/backend-api/imports/fleetguard/preview"],
  ] as const)("uploads %s to its dedicated parser", async (supplier, endpoint) => {
    const response = {
      import_id: 1,
      supplier,
      effective_date: "2026-07-01",
      currency: "MXN",
      summary: { products: 1, status_changes: 0, errors: 0, warnings: 0 },
      products_sample: [],
      status_changes_sample: [],
      errors: [],
      warnings: [],
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["workbook"], `${supplier}.xlsx`, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    await expect(previewPriceListImport(supplier, file)).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get("file")).toBe(file);
  });
});
