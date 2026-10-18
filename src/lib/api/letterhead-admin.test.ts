import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLetterhead,
  downloadLetterheadSource,
  getLetterhead,
  getReportLetterheadAssignments,
  letterheadVersionThumbnailPath,
  listLetterheads,
  listLetterheadVersions,
  replaceReportLetterheadAssignments,
  updateLetterhead,
  uploadLetterheadVersion,
} from "./letterhead-admin";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const XLSX = new File(["PK"], "membrete.xlsx", {
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});

describe("letterhead administration API", () => {
  it("reads the catalog, one letterhead and its history from the admin endpoints", async () => {
    const fetchMock = stubFetch(Response.json([]), Response.json({ id: 3 }), Response.json([]));
    await listLetterheads();
    await getLetterhead(3);
    await listLetterheadVersions(3);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/backend-api/admin/letterheads",
      "/backend-api/admin/letterheads/3",
      "/backend-api/admin/letterheads/3/versions",
    ]);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET", credentials: "same-origin" });
  });

  it("creates a letterhead as multipart without inventing a Content-Type boundary", async () => {
    const fetchMock = stubFetch(Response.json({ id: 1, slug: "asistente-ventas" }, { status: 201 }));
    await createLetterhead({ slug: "asistente-ventas", display_name: "Asistente de ventas", file: XLSX });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/backend-api/admin/letterheads");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(Object.keys(headers).map((name) => name.toLowerCase())).not.toContain("content-type");
    const body = init?.body as FormData;
    expect(body.get("slug")).toBe("asistente-ventas");
    expect(body.get("display_name")).toBe("Asistente de ventas");
    expect((body.get("file") as File).name).toBe("membrete.xlsx");
  });

  it("uploads a new version guarded by the version the screen showed", async () => {
    const fetchMock = stubFetch(Response.json({ id: 9, version: 3, created: true }, { status: 201 }));
    await expect(uploadLetterheadVersion(4, XLSX, 2)).resolves.toMatchObject({ version: 3, created: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/backend-api/admin/letterheads/4/versions");
    const body = init?.body as FormData;
    expect(body.get("expected_latest_version")).toBe("2");
    expect(body.get("file")).toBeInstanceOf(File);
  });

  it("surfaces the stable error detail of a conflicting upload", async () => {
    stubFetch(Response.json(
      { detail: { code: "letterhead_conflict", message: "La versión vigente cambió." } },
      { status: 409 },
    ));
    await expect(uploadLetterheadVersion(4, XLSX, 1)).rejects.toMatchObject({
      status: 409,
      message: "La versión vigente cambió.",
      detail: { code: "letterhead_conflict" },
    });
  });

  it("patches only metadata", async () => {
    const fetchMock = stubFetch(Response.json({ id: 4, is_active: false }));
    await updateLetterhead(4, { is_active: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/backend-api/admin/letterheads/4");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ is_active: false });
  });

  it("downloads a version's original source and builds its thumbnail path", async () => {
    const fetchMock = stubFetch(new Response(new Blob(["PK"]), {
      headers: { "Content-Disposition": 'attachment; filename="asistente.xlsx"' },
    }));
    await expect(downloadLetterheadSource(4, 2)).resolves.toMatchObject({ filename: "asistente.xlsx" });
    expect(fetchMock.mock.calls[0][0]).toBe("/backend-api/admin/letterheads/4/versions/2/source");
    expect(letterheadVersionThumbnailPath(4, 2)).toBe("/admin/letterheads/4/versions/2/thumbnail");
  });

  it("reads and replaces a report's assignments with one PUT carrying the revision", async () => {
    const state = { report_code: "PRUEBA_COTIZACION", revision: "r1", default_letterhead_id: null, assignments: [] };
    const fetchMock = stubFetch(Response.json(state), Response.json({ ...state, revision: "r2" }));
    await getReportLetterheadAssignments("PRUEBA_COTIZACION");
    const body = {
      assignments: [{ letterhead_id: 1, is_active: true }],
      default_letterhead_id: 1,
      expected_revision: "r1",
    };
    await replaceReportLetterheadAssignments("PRUEBA_COTIZACION", body);
    expect(fetchMock.mock.calls[0][0]).toBe("/backend-api/admin/reports/PRUEBA_COTIZACION/letterheads");
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/backend-api/admin/reports/PRUEBA_COTIZACION/letterheads");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual(body);
  });
});
