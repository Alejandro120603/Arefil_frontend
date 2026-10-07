import { describe, expect, it, vi } from "vitest";
import nextConfig from "../../../../../../next.config";
import LegacyReportPage from "./page";

const { permanentRedirect } = vi.hoisted(() => ({
  permanentRedirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("next/navigation", () => ({ permanentRedirect }));

describe("legacy /administracion/reportes/[code]", () => {
  it("permanently redirects to the configuration wizard", async () => {
    await expect(LegacyReportPage({ params: Promise.resolve({ code: "COTIZACION_PRODUCTOS" }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(permanentRedirect).toHaveBeenCalledWith("/administracion/reportes/COTIZACION_PRODUCTOS/configurar");
  });

  it("encodes the report code in the redirect target", async () => {
    await expect(LegacyReportPage({ params: Promise.resolve({ code: "A B" }) })).rejects.toThrow("NEXT_REDIRECT");
    expect(permanentRedirect).toHaveBeenLastCalledWith("/administracion/reportes/A%20B/configurar");
  });

  it("answers the old page with a real 308 before rendering, but never the creation wizard", async () => {
    const redirects = await nextConfig.redirects!();
    const legacy = redirects.find((redirect) => redirect.destination === "/administracion/reportes/:code/configurar" && !redirect.source.endsWith("/designer"));
    expect(legacy).toMatchObject({ permanent: true });
    const pattern = new RegExp(`^${legacy!.source.replace(":code", "")}$`.replace("/administracion/reportes/", "/administracion/reportes/"));
    expect(pattern.test("/administracion/reportes/COTIZACION_PRODUCTOS")).toBe(true);
    expect(pattern.test("/administracion/reportes/nuevo")).toBe(false);
    expect(pattern.test("/administracion/reportes/COTIZACION_PRODUCTOS/configurar")).toBe(false);
    expect(pattern.test("/administracion/reportes/nuevos")).toBe(true);
  });

  it("sends the retired designer URL straight to the wizard, without a second hop", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toContainEqual({
      source: "/administracion/reportes/:code/designer",
      destination: "/administracion/reportes/:code/configurar",
      permanent: true,
    });
  });
});
