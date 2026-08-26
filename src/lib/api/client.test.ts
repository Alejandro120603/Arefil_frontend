import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApiUrl, createApiClient } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildApiUrl", () => {
  it("builds relative browser URLs with encoded query parameters", () => {
    expect(buildApiUrl("/backend-api/", "/products", { search: "filtro aire", page: 2 })).toBe(
      "/backend-api/products?search=filtro+aire&page=2",
    );
  });

  it("builds absolute server URLs and omits undefined query values", () => {
    expect(
      buildApiUrl("http://backend:8000/api", "health", { page: undefined, active: true }),
    ).toBe("http://backend:8000/api/health?active=true");
  });
});

describe("createApiClient", () => {
  it("keeps JSON requests and FastAPI validation errors normalized", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ status: "ok" }))
      .mockResolvedValueOnce(
        Response.json(
          { detail: [{ loc: ["body", "file"], msg: "Campo requerido", type: "missing" }] },
          { status: 422 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const api = createApiClient(() => "/backend-api");

    await expect(api.apiGet<{ status: string }>("/health")).resolves.toEqual({ status: "ok" });
    await expect(api.apiPostJson("/imports/1/confirm")).rejects.toMatchObject({
      status: 422,
      message: "file: Campo requerido",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/backend-api/health");
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
    });
  });

  it("loads raw templates and saves their exact JSON text with PUT", async () => {
    const template = '{"ReportVersion":"2026.3.2","Pages":{"0":{}}}';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(template, { headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(Response.json({ report_code: "PRICE_LIST_COMPARISON", version: 2 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = createApiClient(() => "/backend-api");

    await expect(api.apiGetText("/reports/PRICE_LIST_COMPARISON/template")).resolves.toBe(template);
    await expect(
      api.apiPutText<{ version: number }>("/reports/PRICE_LIST_COMPARISON/template", template),
    ).resolves.toMatchObject({ version: 2 });

    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: template,
    });
  });

  it("preserves FormData uploads without overriding the multipart boundary", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ import_id: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = createApiClient(() => "/backend-api");
    const formData = new FormData();
    formData.append("file", new Blob(["xlsx"]), "sample.xlsx");

    await api.apiUpload("/imports/donaldson/preview", formData);

    expect(fetchMock).toHaveBeenCalledWith(
      "/backend-api/imports/donaldson/preview",
      expect.objectContaining({ method: "POST", headers: { Accept: "application/json" }, body: formData }),
    );
  });

  it("returns blob downloads with the backend filename", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("backup", {
        headers: { "Content-Disposition": 'attachment; filename="arefil.db"' },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = createApiClient(() => "/backend-api");

    const result = await api.apiDownloadBlob("/admin/database/backup");

    expect(result.filename).toBe("arefil.db");
    await expect(result.blob.text()).resolves.toBe("backup");
  });

  it("supports JSON PATCH and JSON POST downloads through the shared client", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ enabled: false }))
      .mockResolvedValueOnce(new Response("csv", { headers: { "Content-Disposition": 'attachment; filename="report.csv"' } }));
    vi.stubGlobal("fetch", fetchMock);
    const api = createApiClient(() => "/backend-api");

    await expect(api.apiPatchJson("/reports/TEST", { enabled: false })).resolves.toEqual({ enabled: false });
    await expect(api.apiPostBlob("/reports/TEST/export/csv", { supplier_id: 1 })).resolves.toMatchObject({ filename: "report.csv" });

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH", body: JSON.stringify({ enabled: false }) });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST", body: JSON.stringify({ supplier_id: 1 }) });
  });
});
