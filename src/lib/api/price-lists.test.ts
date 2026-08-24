import { afterEach, describe, expect, it, vi } from "vitest";
import { listAllPriceLists } from "./price-lists";
import type { Page, PriceList } from "@/types/api";

function makePriceList(id: number): PriceList {
  return {
    id,
    supplier: "DONALDSON",
    import_id: id,
    effective_date: "2026-01-15",
    currency: "MXN",
    source_filename: `lista_${id}.xlsx`,
    status: "ACTIVE",
    created_at: "2026-01-16T10:00:00Z",
  };
}

function makePage(ids: number[], page: number, totalItems: number, totalPages: number): Page<PriceList> {
  return {
    items: ids.map(makePriceList),
    meta: { page, page_size: 100, total_items: totalItems, total_pages: totalPages },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("listAllPriceLists", () => {
  it("requests the backend's maximum page size and stops after one page", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(makePage([1, 2], 1, 2, 1)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listAllPriceLists()).resolves.toHaveLength(2);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("page_size=100");
  });

  it("walks every page so the picker never shows a truncated catalogue", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(makePage([1, 2], 1, 5, 3)))
      .mockResolvedValueOnce(Response.json(makePage([3, 4], 2, 5, 3)))
      .mockResolvedValueOnce(Response.json(makePage([5], 3, 5, 3)));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listAllPriceLists();

    expect(result.map((priceList) => priceList.id)).toEqual([1, 2, 3, 4, 5]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("caps the walk so a bogus total_pages cannot spin forever", async () => {
    // A fresh Response per call - a body can only be read once.
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json(makePage([1], 1, 10_000, 10_000)));
    vi.stubGlobal("fetch", fetchMock);

    await listAllPriceLists();

    expect(fetchMock).toHaveBeenCalledTimes(20);
  });
});
