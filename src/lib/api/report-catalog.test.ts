import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getRuntimeReportDefinition,
  listRuntimeReportDefinitions,
} from "./report-catalog";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("runtime report catalog API", () => {
  it("loads the whole operational catalog with one request", async () => {
    vi.stubEnv("API_INTERNAL_URL", "/backend-api");
    const body = [
      { code: "READY", name: "Ready", description: null, category: null, enabled: true, ready: true },
      { code: "DEGRADED", name: "Degraded", description: null, category: null, enabled: true, ready: false },
    ];
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listRuntimeReportDefinitions()).resolves.toEqual(body);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/backend-api/reports/runtime",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("rechecks one direct runtime URL with one detail request", async () => {
    vi.stubEnv("API_INTERNAL_URL", "/backend-api");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: "A B", ready: false }));
    vi.stubGlobal("fetch", fetchMock);

    await getRuntimeReportDefinition("A B");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/backend-api/reports/runtime/A%20B",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });
});
