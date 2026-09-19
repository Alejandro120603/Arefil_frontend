import { describe, expect, it } from "vitest";
import { NAV_SECTIONS } from "./nav-items";

describe("NAV_SECTIONS", () => {
  it("exposes Reportes inside Donaldson without dropping the existing routes", () => {
    const donaldson = NAV_SECTIONS.find((section) => section.label === "Donaldson");
    expect(donaldson?.links.map((link) => link.href)).toEqual([
      "/donaldson/import",
      "/donaldson/price-lists",
      "/donaldson/products",
      "/donaldson/cancelados",
      "/donaldson/reports",
    ]);
    expect(donaldson?.links.at(-1)?.label).toBe("Reportes");
  });

  it("links the report catalogue from Administración", () => {
    const admin = NAV_SECTIONS.find((section) => section.label === "Administración");
    expect(admin?.links.map((link) => link.href)).toEqual([
      "/administracion/respaldos",
      "/administracion/reportes",
    ]);
  });
});
