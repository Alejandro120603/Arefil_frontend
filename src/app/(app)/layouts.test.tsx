// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/session";

const { requireUser } = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth/server-session", () => ({ requireUser }));
vi.mock("next/navigation", () => ({ usePathname: () => "/donaldson/reports" }));

import AdministrationLayout from "./administracion/layout";
import AuthenticatedLayout from "./layout";

const ADMIN: CurrentUser = {
  id: 1, username: "admin1", role: "ADMIN", is_active: true,
  permissions: ["catalog:read", "catalog:write", "reports:run", "reports:admin", "system:backup", "users:admin"],
};
const USER: CurrentUser = { id: 2, username: "user1", role: "USER", is_active: true, permissions: ["catalog:read", "reports:run"] };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("authenticated layouts", () => {
  it("lets a USER into the runtime panel with a way to sign out", async () => {
    requireUser.mockResolvedValue(USER);
    render(await AuthenticatedLayout({ children: <p>catálogo runtime</p> }));
    expect(screen.getByText("catálogo runtime")).toBeTruthy();
    expect(screen.getByText("user1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeTruthy();
  });

  it("does not render the panel when the session check redirects", async () => {
    requireUser.mockRejectedValue(new Error("NEXT_REDIRECT /login"));
    await expect(AuthenticatedLayout({ children: <p>x</p> })).rejects.toThrow("NEXT_REDIRECT");
  });

  it("keeps a USER out of administration", async () => {
    requireUser.mockResolvedValue(USER);
    render(await AdministrationLayout({ children: <p>panel admin</p> }));
    expect(screen.queryByText("panel admin")).toBeNull();
    expect(screen.getByText("No tienes permisos para realizar esta acción.")).toBeTruthy();
  });

  it("lets an ADMIN into administration", async () => {
    requireUser.mockResolvedValue(ADMIN);
    render(await AdministrationLayout({ children: <p>panel admin</p> }));
    expect(screen.getByText("panel admin")).toBeTruthy();
  });
});
