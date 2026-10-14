import { afterEach, describe, expect, it, vi } from "vitest";
import { backendApiPath, fetchProtectedImage, UnexpectedImageTypeError } from "./protected-image";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("protected images", () => {
  it("maps backend URLs to browser client paths and rejects anything else", () => {
    expect(backendApiPath("/api/reports/PRUEBA_COTIZACION/letterheads/2/thumbnail"))
      .toBe("/reports/PRUEBA_COTIZACION/letterheads/2/thumbnail");
    expect(backendApiPath("https://evil.example/api/x")).toBeNull();
    expect(backendApiPath("/other/x")).toBeNull();
    expect(backendApiPath(null)).toBeNull();
  });

  it("fetches through the authenticated client and accepts only raster images", async () => {
    const fetchMock = stubFetch(
      new Response(new Blob(["png"], { type: "image/png" }), { headers: { "Content-Type": "image/png" } }),
      new Response("<svg/>", { headers: { "Content-Type": "image/svg+xml" } }),
    );
    await expect(fetchProtectedImage("/admin/letterheads/1/versions/1/thumbnail")).resolves.toBeInstanceOf(Blob);
    expect(fetchMock.mock.calls[0][0]).toBe("/backend-api/admin/letterheads/1/versions/1/thumbnail");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "same-origin" });
    await expect(fetchProtectedImage("/x")).rejects.toBeInstanceOf(UnexpectedImageTypeError);
  });
});
