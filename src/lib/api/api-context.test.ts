import { afterEach, describe, expect, it, vi } from "vitest";
import { browserApiClient, getBrowserApiBaseUrl } from "./browser-client";
import { getServerApiBaseUrl, serverApiClient } from "./server-client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("API context", () => {
  it("uses safe documented defaults when configuration is absent", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("API_INTERNAL_URL", "");

    expect(getBrowserApiBaseUrl()).toBe("/backend-api");
    expect(getServerApiBaseUrl()).toBe("http://127.0.0.1:8000/api");
  });

  it("uses independent public and internal destinations", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://arefil.example/api");
    vi.stubEnv("API_INTERNAL_URL", "http://backend:8000/api");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ status: "browser" }))
      .mockResolvedValueOnce(Response.json({ status: "server" }));
    vi.stubGlobal("fetch", fetchMock);

    await browserApiClient.apiGet("/health");
    await serverApiClient.apiGet("/health");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://arefil.example/api/health");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://backend:8000/api/health");
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("backend:8000");
  });
});
