import { describe, expect, it } from "vitest";
import { NAV_SECTIONS, navSectionsFor } from "./nav-items";
import type { CurrentUser } from "@/lib/auth/session";

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

  it("filters links by the permissions /auth/me reports, not by role name", () => {
    const user: CurrentUser = { id: 2, username: "u", role: "USER", is_active: true, permissions: ["catalog:read", "reports:run"] };
    expect(navSectionsFor(user).map((section) => section.label)).toEqual([null, "Donaldson"]);
    expect(navSectionsFor(user).flatMap((section) => section.links.map((link) => link.href))).not.toContain("/donaldson/import");
    // A hypothetical role with only system:backup sees Respaldos and nothing else administrative.
    const backupOnly: CurrentUser = { ...user, permissions: ["catalog:read", "system:backup"] };
    const admin = navSectionsFor(backupOnly).find((section) => section.label === "Administración");
    expect(admin?.links.map((link) => link.href)).toEqual(["/administracion/respaldos"]);
  });
});
