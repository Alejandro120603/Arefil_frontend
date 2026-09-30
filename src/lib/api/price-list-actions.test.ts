import { afterEach, describe, expect, it, vi } from "vitest";
import { deletePriceList } from "./price-list-actions";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("price-list mutations", () => {
  it("deletes exactly one list by internal numeric id", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deletePriceList(42)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      "/backend-api/price-lists/42",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
