import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("backend API proxy", () => {
  it("forwards path, query and download headers to the internal backend", async () => {
    vi.stubEnv("API_INTERNAL_URL", "http://backend:8000/api");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("csv-data", {
        headers: {
          "Content-Disposition": 'attachment; filename="lista.csv"',
          "Content-Type": "text/csv",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = new NextRequest("http://frontend:3000/backend-api/price-lists/7/export/csv?download=true");

    const response = await GET(request, {
      params: Promise.resolve({ path: ["price-lists", "7", "export", "csv"] }),
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://backend:8000/api/price-lists/7/export/csv?download=true",
    );
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="lista.csv"');
    await expect(response.text()).resolves.toBe("csv-data");
  });

  it("forwards multipart bodies and upstream error responses", async () => {
    vi.stubEnv("API_INTERNAL_URL", "http://backend:8000/api");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ detail: "Archivo inválido" }, { status: 422 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const formData = new FormData();
    formData.append("file", new Blob(["invalid"]), "sample.xlsx");
    const request = new NextRequest("http://frontend:3000/backend-api/imports/donaldson/preview", {
      method: "POST",
      body: formData,
      headers: { Origin: "http://frontend:3000", "X-Forwarded-Host": "frontend:3000" },
    });

    const response = await POST(request, {
      params: Promise.resolve({ path: ["imports", "donaldson", "preview"] }),
    });

    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.headers).toBeInstanceOf(Headers);
    expect((requestInit?.headers as Headers).get("content-type")).toContain("multipart/form-data; boundary=");
    expect((requestInit?.headers as Headers).has("origin")).toBe(false);
    expect((requestInit?.headers as Headers).has("x-forwarded-host")).toBe(false);
    expect(requestInit?.body).toBeInstanceOf(ArrayBuffer);
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ detail: "Archivo inválido" });
  });

  it("returns a stable 502 without leaking the internal URL", async () => {
    vi.stubEnv("API_INTERNAL_URL", "http://backend:8000/api");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("connect ECONNREFUSED backend")));
    const request = new NextRequest("http://frontend:3000/backend-api/health");

    const response = await GET(request, { params: Promise.resolve({ path: ["health"] }) });
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(body).toContain("No se pudo comunicar con el backend.");
    expect(body).not.toContain("backend:8000");
  });
});
