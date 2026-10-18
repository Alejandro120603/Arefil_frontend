import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
import { DUPLICATE_IMPORT_FALLBACK_MESSAGE, getDuplicateImportDetail, previewPriceListImport } from "./imports";

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

describe("getDuplicateImportDetail", () => {
  const detail = {
    message: "Este archivo ya está importado: es la lista de precios de FLEETGUARD vigente desde el 2026-07-01.",
    existing_import_id: 5,
    existing_price_list_id: 7,
    effective_date: "2026-07-01",
    supplier: "FLEETGUARD",
  };

  it("reads the current 409 contract", () => {
    expect(getDuplicateImportDetail(new ApiError(409, detail))).toEqual(detail);
  });

  it("accepts the older contract and drops its ImportJob wording", () => {
    expect(
      getDuplicateImportDetail(
        new ApiError(409, { message: "Este archivo ya fue importado exitosamente (ImportJob #1).", existing_import_id: 1 }),
      ),
    ).toEqual({ message: DUPLICATE_IMPORT_FALLBACK_MESSAGE, existing_import_id: 1 });
  });

  it.each([0, -1, 1.5, "7", null])("ignores an unusable price list id (%s)", (existing_price_list_id) => {
    expect(getDuplicateImportDetail(new ApiError(409, { ...detail, existing_price_list_id }))).not.toHaveProperty(
      "existing_price_list_id",
    );
  });

  it.each([
    ["a text 409", new ApiError(409, "ImportJob #1 está en estado 'FAILED'.")],
    ["another status", new ApiError(422, detail)],
    ["no message", new ApiError(409, { existing_import_id: 1 })],
    ["not an ApiError", new Error("x")],
  ])("is null for %s", (_label, error) => {
    expect(getDuplicateImportDetail(error)).toBeNull();
  });
});
