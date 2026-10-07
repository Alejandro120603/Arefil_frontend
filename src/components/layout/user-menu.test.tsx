// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserMenu } from "./user-menu";

const USER = { id: 2, username: "user1", role: "USER" as const, is_active: true, permissions: ["reports:run" as const] };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UserMenu", () => {
  it("shows who is signed in", () => {
    render(<UserMenu user={USER} navigate={vi.fn()} />);
    expect(screen.getByText("user1")).toBeTruthy();
    expect(screen.getByText("Usuario")).toBeTruthy();
  });

  it("ends the server session before leaving for /login", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const navigate = vi.fn();
    render(<UserMenu user={USER} navigate={navigate} />);

    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/login"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/backend-api/auth/logout",
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    );
  });

  it("still leaves for /login when the backend cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed")));
    const navigate = vi.fn();
    render(<UserMenu user={USER} navigate={navigate} />);
    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/login"));
  });
});
