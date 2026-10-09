// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

const ADMIN = {
  id: 1, username: "admin1", role: "ADMIN", is_active: true,
  permissions: ["catalog:read", "catalog:write", "reports:run", "reports:admin", "system:backup", "users:admin"],
};
const USER = { id: 2, username: "user1", role: "USER", is_active: true, permissions: ["catalog:read", "reports:run"] };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function submit(username = "user1", password = "correct horse battery") {
  await userEvent.type(screen.getByLabelText("Usuario"), username);
  await userEvent.type(screen.getByLabelText("Contraseña"), password);
  await userEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
}

describe("LoginForm", () => {
  it("renders only username, password and sign-in", () => {
    render(<LoginForm next={null} navigate={vi.fn()} />);
    expect(screen.getByLabelText("Usuario")).toBeTruthy();
    expect((screen.getByLabelText("Contraseña") as HTMLInputElement).type).toBe("password");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText(/registr|olvid|recordar/i)).toBeNull();
  });

  it.each([
    [USER, null, "/donaldson/reports"],
    [ADMIN, null, "/administracion/reportes"],
    [USER, "/donaldson/reports/COTIZACION", "/donaldson/reports/COTIZACION"],
  ])("signs in through the same-origin proxy and navigates", async (user, next, target) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(user));
    vi.stubGlobal("fetch", fetchMock);
    const navigate = vi.fn();
    render(<LoginForm next={next} navigate={navigate} />);

    await submit();

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(target));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/backend-api/auth/login");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("same-origin");
    expect(JSON.parse(String(init?.body))).toEqual({ username: "user1", password: "correct horse battery" });
  });

  it.each([
    [401, "Usuario o contraseña incorrectos."],
    [429, "Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo."],
    [502, "No se pudo iniciar sesión por un problema temporal. Inténtalo de nuevo."],
  ])("shows a generic message for HTTP %i and stays on the page", async (status, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(Response.json({ detail: "internal detail" }, { status })),
    );
    const navigate = vi.fn();
    render(<LoginForm next={null} navigate={navigate} />);

    await submit("user1", "wrong password!");

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText("internal detail")).toBeNull();
    expect((screen.getByLabelText("Contraseña") as HTMLInputElement).value).toBe("");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("treats a network failure as a temporary problem", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed")));
    render(<LoginForm next={null} navigate={vi.fn()} />);
    await submit();
    expect(await screen.findByText(/problema temporal/)).toBeTruthy();
    expect(screen.queryByText("fetch failed")).toBeNull();
  });
});
