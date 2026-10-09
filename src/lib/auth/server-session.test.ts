import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cookieStore, headerStore, redirect } = vi.hoisted(() => ({
  cookieStore: new Map<string, string>(),
  headerStore: new Map<string, string>(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined) }),
  headers: async () => ({ get: (name: string) => headerStore.get(name) ?? null }),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

import { getCurrentUser, requireUser } from "./server-session";

const USER = { id: 2, username: "user1", role: "USER", is_active: true, permissions: ["catalog:read", "reports:run"] };

beforeEach(() => {
  vi.stubEnv("API_INTERNAL_URL", "http://backend:8000/api");
});

afterEach(() => {
  cookieStore.clear();
  headerStore.clear();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("server session", () => {
  it("asks the backend with the browser's session cookie", async () => {
    cookieStore.set("arefil_session", "opaque-token");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(USER));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getCurrentUser()).resolves.toEqual(USER);

    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://backend:8000/api/auth/me");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Cookie).toBe("arefil_session=opaque-token");
  });

  it("treats 401 from /auth/me as signed out", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ detail: "x" }, { status: 401 })));
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("does not hide a broken backend behind a login redirect", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ detail: "x" }, { status: 500 })));
    await expect(getCurrentUser()).rejects.toMatchObject({ status: 500 });
  });

  it("redirects an expired session to /login and back to the same page", async () => {
    headerStore.set("x-arefil-path", "/donaldson/reports/COTIZACION");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { status: 401 })));
    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login?next=%2Fdonaldson%2Freports%2FCOTIZACION");
  });
});
