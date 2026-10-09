import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "./proxy";

function matches(path: string): boolean {
  return new RegExp(`^${config.matcher[0]}$`).test(path);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

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

  it("runs on panel pages and /login but not health, the API proxy or static files", () => {
    for (const path of ["/", "/login", "/donaldson/reports", "/administracion/reportes/X/configurar"]) {
      expect(matches(path), path).toBe(true);
    }
    for (const path of ["/api/health", "/backend-api/auth/login", "/_next/static/a.js", "/favicon.ico"]) {
      expect(matches(path), path).toBe(false);
    }
  });

  it("lets /login through without a session", () => {
    const response = proxy(new NextRequest("http://arefil.test/login?next=%2F"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("sends a browser that reached Cloudflare over http:// to https://, before the session check", () => {
    for (const path of ["/login?next=%2F", "/donaldson/reports?tab=1"]) {
      const response = proxy(
        new NextRequest(`http://arefil.example.com${path}`, { headers: { "cf-visitor": '{"scheme":"http"}' } }),
      );
      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(`https://arefil.example.com${path}`);
    }
  });

  it("builds the https:// target from the Host header, not the server's bind address", () => {
    const response = proxy(
      new NextRequest("http://0.0.0.0:3000/login", {
        headers: { host: "arefil.example.com", "cf-visitor": '{"scheme":"http"}' },
      }),
    );
    expect(response.headers.get("location")).toBe("https://arefil.example.com/login");
  });

  it("redirects to the configured public origin whatever Host the client sent", () => {
    vi.stubEnv("PUBLIC_ORIGIN", "https://arefil.example.com/");
    const response = proxy(
      new NextRequest("http://0.0.0.0:3000/reportes?x=1", {
        headers: { host: "evil.example", "cf-visitor": '{"scheme":"http"}' },
      }),
    );
    expect(response.headers.get("location")).toBe("https://arefil.example.com/reportes?x=1");
  });

  it("adds HSTS only to pages Cloudflare served over HTTPS", () => {
    const viaCloudflare = proxy(
      new NextRequest("http://arefil.example.com/login", { headers: { "cf-visitor": '{"scheme":"https"}' } }),
    );
    expect(viaCloudflare.headers.get("location")).toBeNull();
    expect(viaCloudflare.headers.get("strict-transport-security")).toBe("max-age=31536000");

    const direct = proxy(new NextRequest("http://arefil.test/login"));
    expect(direct.headers.get("strict-transport-security")).toBeNull();
  });

  it("ignores a malformed CF-Visitor header", () => {
    const response = proxy(new NextRequest("http://arefil.test/login", { headers: { "cf-visitor": "{nope" } }));
    expect(response.headers.get("location")).toBeNull();
  });
});
