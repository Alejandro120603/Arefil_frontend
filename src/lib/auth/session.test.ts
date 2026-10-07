import { describe, expect, it } from "vitest";
import { type CurrentUser, hasPermission, homePathFor, loginPathFor, safeNextPath } from "./session";

const admin: CurrentUser = {
  id: 1,
  username: "admin1",
  role: "ADMIN",
  is_active: true,
  permissions: ["catalog:read", "catalog:write", "reports:run", "reports:admin", "system:backup", "users:admin"],
};
const user: CurrentUser = { id: 2, username: "user1", role: "USER", is_active: true, permissions: ["catalog:read", "reports:run"] };

describe("session contract", () => {
  it("reads permissions from /auth/me, never from the role name", () => {
    expect(hasPermission(admin, "reports:admin")).toBe(true);
    expect(hasPermission(user, "reports:admin")).toBe(false);
    expect(hasPermission(user, "reports:run")).toBe(true);
    expect(hasPermission(null, "reports:run")).toBe(false);
  });

  it("sends ADMIN to administration and USER to the report catalog", () => {
    expect(homePathFor(admin)).toBe("/administracion/reportes");
    expect(homePathFor(user)).toBe("/donaldson/reports");
  });

  it.each([
    ["/donaldson/reports/COTIZACION?x=1", "/donaldson/reports/COTIZACION?x=1"],
    ["/", "/"],
    ["//evil.example", null],
    ["https://evil.example", null],
    ["/\\evil.example", null],
    ["javascript:alert(1)", null],
    ["/login", null],
    ["/login?next=/x", null],
    ["/a\nb", null],
    ["", null],
    [undefined, null],
  ])("accepts only internal post-login destinations: %s", (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });

  it("builds the login URL with an encoded, validated destination", () => {
    expect(loginPathFor("/donaldson/reports?x=1")).toBe("/login?next=%2Fdonaldson%2Freports%3Fx%3D1");
    expect(loginPathFor("//evil")).toBe("/login");
    expect(loginPathFor(null)).toBe("/login");
  });
});
