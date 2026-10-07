// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { browserApiClient } from "./browser-client";
import { ApiError } from "./errors";

const assign = vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
  assign.mockReset();
});

function onPage(path: string) {
  const url = new URL(path, "http://arefil.test");
  vi.stubGlobal("location", { pathname: url.pathname, search: url.search, assign });
}

describe("browser API client and session errors", () => {
  it("sends a 401 back to /login with the current page as destination", async () => {
    onPage("/donaldson/reports/COTIZACION?x=1");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ detail: "Inicia sesión para continuar." }, { status: 401 })));

    await expect(browserApiClient.apiPostJson("/reports/COTIZACION/data", {})).rejects.toBeInstanceOf(ApiError);

    expect(assign).toHaveBeenCalledWith("/login?next=%2Fdonaldson%2Freports%2FCOTIZACION%3Fx%3D1");
  });

  it("never loops on the login page itself", async () => {
    onPage("/login");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { status: 401 })));
    await expect(browserApiClient.apiGet("/auth/me")).rejects.toMatchObject({ status: 401 });
    expect(assign).not.toHaveBeenCalled();
  });

  it("treats 403 as a missing permission, not as a logout", async () => {
    onPage("/donaldson/reports");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({ detail: "No tienes permisos para realizar esta acción." }, { status: 403 }),
      ),
    );

    const error = await browserApiClient.apiDelete("/price-lists/1").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(403);
    expect((error as ApiError).message).toBe("No tienes permisos para realizar esta acción.");
    expect(assign).not.toHaveBeenCalled();
  });

  it("sends requests with same-origin credentials", async () => {
    onPage("/");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", fetchMock);
    await browserApiClient.apiGet("/reports/runtime");
    expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe("same-origin");
  });
});
