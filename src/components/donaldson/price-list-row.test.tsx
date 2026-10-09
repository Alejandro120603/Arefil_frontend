// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { PriceList } from "@/types/api";
import { DeletePriceListButton } from "./delete-price-list-button";
import { PriceListRow } from "./price-list-row";

const mocks = vi.hoisted(() => ({
  deletePriceList: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}));
vi.mock("@/lib/api/price-list-actions", () => ({ deletePriceList: mocks.deletePriceList }));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

const PRICE_LIST: PriceList = {
  id: 42,
  supplier: "DONALDSON",
  import_id: 9,
  effective_date: "2026-08-15",
  currency: "MXN",
  source_filename: "donaldson-agosto.xlsx",
  status: "COMPLETED",
  created_at: "2026-08-16T10:00:00Z",
};

function renderRow(canDelete = true) {
  return render(
    <table>
      <tbody>
        <PriceListRow priceList={PRICE_LIST} canDelete={canDelete} />
      </tbody>
    </table>,
  );
}

async function openConfirmation() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: `Acciones de la lista #${PRICE_LIST.id}` }));
  await user.click(await screen.findByRole("menuitem", { name: /Eliminar/ }));
  return user;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PriceListRow", () => {
  it("offers Eliminar and opening confirmation does not call DELETE", async () => {
    renderRow();

    await openConfirmation();

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText(/donaldson-agosto\.xlsx/)).toBeTruthy();
    expect(within(dialog).getByText(/productos del catálogo NO serán eliminados/)).toBeTruthy();
    expect(mocks.deletePriceList).not.toHaveBeenCalled();
  });

  it("Cancelar does not delete the list", async () => {
    renderRow();
    const user = await openConfirmation();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(mocks.deletePriceList).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText(PRICE_LIST.source_filename)).toBeTruthy();
  });

  it("calls DELETE once, disables controls, removes the row and refreshes", async () => {
    let resolveDelete: (() => void) | undefined;
    mocks.deletePriceList.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveDelete = resolve;
      }),
    );
    renderRow();
    const user = await openConfirmation();

    await user.click(screen.getByRole("button", { name: "Eliminar lista" }));

    expect(mocks.deletePriceList).toHaveBeenCalledWith(PRICE_LIST.id);
    expect(mocks.deletePriceList).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Eliminando..." }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alertdialog")).toBeTruthy();

    resolveDelete?.();
    await waitFor(() => expect(screen.queryByText(PRICE_LIST.source_filename)).toBeNull());

    expect(mocks.toastSuccess).toHaveBeenCalledWith("Lista de precios eliminada correctamente");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps information and confirmation visible when DELETE fails", async () => {
    mocks.deletePriceList.mockRejectedValueOnce(new ApiError(409, "La lista está referenciada."));
    renderRow();
    const user = await openConfirmation();

    await user.click(screen.getByRole("button", { name: "Eliminar lista" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("La lista está referenciada."));
    expect(screen.getByText(PRICE_LIST.source_filename)).toBeTruthy();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Eliminar lista" }) as HTMLButtonElement).disabled).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("redirects to the list after deleting from the detail action", async () => {
    mocks.deletePriceList.mockResolvedValueOnce(undefined);
    render(<DeletePriceListButton priceList={PRICE_LIST} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Eliminar lista" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Eliminar lista" }));

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/donaldson/price-lists"),
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("never offers Eliminar to a user without catalog:write", async () => {
    renderRow(false);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: `Acciones de la lista #${PRICE_LIST.id}` }));
    expect(await screen.findByRole("menuitem", { name: /Ver detalle/ })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /Eliminar/ })).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
