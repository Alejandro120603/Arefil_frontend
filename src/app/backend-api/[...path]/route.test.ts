import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH, POST, PUT } from "./route";

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

  it("forwards a report builder JSON request and its content type on PUT", async () => {
    vi.stubEnv("API_INTERNAL_URL", "http://backend:8000/api");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ columns: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const builder = '{"columns":[],"parameter_groups":[],"excel_layout":{"sheet_name":"Reporte"}}';
    const request = new NextRequest(
      "http://frontend:3000/backend-api/reports/PRICE_LIST_COMPARISON/builder",
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: builder },
    );

    const response = await PUT(request, {
      params: Promise.resolve({ path: ["reports", "PRICE_LIST_COMPARISON", "builder"] }),
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://backend:8000/api/reports/PRICE_LIST_COMPARISON/builder",
    );
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("PUT");
    expect((init?.headers as Headers).get("content-type")).toBe("application/json");
    expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe(builder);
    expect(response.status).toBe(200);
  });

  it("forwards the session cookie upstream and the backend's Set-Cookie back to the browser", async () => {
    vi.stubEnv("API_INTERNAL_URL", "http://backend:8000/api");
    const upstreamHeaders = new Headers({ "Content-Type": "application/json" });
    upstreamHeaders.append("Set-Cookie", "arefil_session=new-token; HttpOnly; Path=/; SameSite=lax");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ username: "user1" }), { headers: upstreamHeaders }));
    vi.stubGlobal("fetch", fetchMock);
    const request = new NextRequest("http://frontend:3000/backend-api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "user1", password: "x" }),
      headers: {
        "content-type": "application/json",
        cookie: "arefil_session=old-token",
        origin: "http://frontend:3000",
        "sec-fetch-site": "same-origin",
        "x-forwarded-for": "192.168.1.20, 10.0.0.1",
      },
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["auth", "login"] }) });

    const upstream = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(upstream.get("cookie")).toBe("arefil_session=old-token");
    // Without a trusted reverse proxy in front, a client-supplied address is not passed on.
    expect(upstream.has("x-forwarded-for")).toBe(false);
    expect(upstream.has("origin")).toBe(false);
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([
      "arefil_session=new-token; HttpOnly; Path=/; SameSite=lax",
    ]);
  });

  it.each([
    [{ origin: "https://evil.example" }],
    [{ origin: "http://frontend:3001" }],
    [{ origin: "null" }],
    [{ "sec-fetch-site": "cross-site" }],
    [{ "sec-fetch-site": "same-site", origin: "http://frontend:3000" }],
  ])("refuses cross-origin writes before they reach the backend (%o)", async (headers) => {
    vi.stubEnv("API_INTERNAL_URL", "http://backend:8000/api");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const request = new NextRequest("http://frontend:3000/backend-api/reports/X", {
      method: "PATCH",
      body: "{}",
      headers: { cookie: "arefil_session=token", ...headers },
    });

    const response = await PATCH(request, { params: Promise.resolve({ path: ["reports", "X"] }) });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ detail: "Origen no permitido." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not apply the write rule to reads", async () => {
    vi.stubEnv("API_INTERNAL_URL", "http://backend:8000/api");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]));
    vi.stubGlobal("fetch", fetchMock);
    const request = new NextRequest("http://frontend:3000/backend-api/reports/runtime", {
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    });
    const response = await GET(request, { params: Promise.resolve({ path: ["reports", "runtime"] }) });
    expect(response.status).toBe(200);
  });

  it("forwards the client address only behind the trusted reverse proxy", async () => {
    vi.stubEnv("API_INTERNAL_URL", "http://backend:8000/api");
    vi.stubEnv("TRUST_PROXY_FORWARDED_FOR", "true");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", fetchMock);
    const request = new NextRequest("https://arefil.test/backend-api/auth/me", {
      headers: { "x-forwarded-for": "192.168.1.20, 10.0.0.1" },
    });

    await GET(request, { params: Promise.resolve({ path: ["auth", "me"] }) });

    const upstream = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(upstream.get("x-forwarded-for")).toBe("192.168.1.20");
  });
});
