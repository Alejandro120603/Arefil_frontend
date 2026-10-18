// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/session";

const { requireUser } = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth/server-session", () => ({ requireUser }));
vi.mock("@/components/letterheads/admin/letterhead-admin-workspace", () => ({
  LetterheadAdminWorkspace: () => <p>workspace de membretes</p>,
}));
vi.mock("@/components/letterheads/admin/letterhead-detail", () => ({
  LetterheadDetail: ({ id }: { id: number }) => <p>detalle {id}</p>,
}));

import LetterheadAdministrationLayout from "./layout";
import LetterheadsAdminPage from "./page";
import LetterheadDetailPage from "./[id]/page";

const ADMIN: CurrentUser = {
  id: 1, username: "admin1", role: "ADMIN", is_active: true,
  permissions: ["catalog:read", "catalog:write", "reports:run", "reports:admin", "system:backup", "users:admin"],
};
const USER: CurrentUser = { id: 2, username: "user1", role: "USER", is_active: true, permissions: ["catalog:read", "reports:run"] };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function renderGuarded(children: React.ReactNode) {
  const element = LetterheadAdministrationLayout({ children });
  // The layout delegates to the server-side guard with reports:admin.
  const { RequirePermission } = await import("@/components/auth/require-permission");
  expect(element.type).toBe(RequirePermission);
  render(await RequirePermission(element.props));
}

describe("Administración → Membretes", () => {
  it("lets an ADMIN with reports:admin in", async () => {
    requireUser.mockResolvedValue(ADMIN);
    await renderGuarded(LetterheadsAdminPage());
    expect(screen.getByRole("heading", { name: "Membretes" })).toBeTruthy();
    expect(screen.getByText("workspace de membretes")).toBeTruthy();
  });

  it("keeps a USER with only reports:run out, without any admin control", async () => {
    requireUser.mockResolvedValue(USER);
    await renderGuarded(LetterheadsAdminPage());
    expect(screen.queryByText("workspace de membretes")).toBeNull();
    expect(screen.queryByRole("button", { name: "Nuevo membrete" })).toBeNull();
    expect(screen.getByText("No tienes permisos para realizar esta acción.")).toBeTruthy();
  });

  it("sends a visitor without a session to the login (the guard redirects)", async () => {
    requireUser.mockRejectedValue(new Error("NEXT_REDIRECT /login"));
    const { RequirePermission } = await import("@/components/auth/require-permission");
    const element = LetterheadAdministrationLayout({ children: <p>x</p> });
    await expect(RequirePermission(element.props)).rejects.toThrow("NEXT_REDIRECT");
  });

  it("opens the detail of a valid id and refuses a malformed one", async () => {
    render(await LetterheadDetailPage({ params: Promise.resolve({ id: "7" }) }));
    expect(screen.getByText("detalle 7")).toBeTruthy();
    cleanup();
    render(await LetterheadDetailPage({ params: Promise.resolve({ id: "7x" }) }));
    expect(screen.getByText("El identificador del membrete no es válido.")).toBeTruthy();
  });
});
