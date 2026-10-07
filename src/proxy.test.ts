import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

function matches(path: string): boolean {
  return new RegExp(`^${config.matcher[0]}$`).test(path);
}

describe("navigation proxy", () => {
  it("sends a visitor without a session cookie to /login, keeping the destination", () => {
    const response = proxy(new NextRequest("http://arefil.test/donaldson/reports?tab=1"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://arefil.test/login?next=%2Fdonaldson%2Freports%3Ftab%3D1",
    );
  });

  it("lets a request with a cookie through without treating it as proof of a session", () => {
    const request = new NextRequest("http://arefil.test/administracion/reportes", {
      headers: { cookie: "arefil_session=whatever" },
    });
    const response = proxy(request);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-arefil-path")).toBe("/administracion/reportes");
  });

  it("guards the panel but not login, health, the API proxy or static files", () => {
    for (const path of ["/", "/donaldson/reports", "/administracion/reportes/X/configurar"]) {
      expect(matches(path), path).toBe(true);
    }
    for (const path of ["/login", "/api/health", "/backend-api/auth/login", "/_next/static/a.js", "/favicon.ico"]) {
      expect(matches(path), path).toBe(false);
    }
  });
});
