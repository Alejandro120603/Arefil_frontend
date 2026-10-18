// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { DUPLICATE_IMPORT_FALLBACK_MESSAGE } from "@/lib/api/imports";
import type { ImportPreviewResponse } from "@/types/api";
import ImportPriceListPage from "./page";

const mocks = vi.hoisted(() => ({
  previewPriceListImport: vi.fn(),
  confirmImport: vi.fn(),
}));

vi.mock("@/lib/api/imports", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/imports")>()),
  previewPriceListImport: mocks.previewPriceListImport,
  confirmImport: mocks.confirmImport,
}));

afterEach(cleanup);

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function preview(overrides: Partial<ImportPreviewResponse> = {}): ImportPreviewResponse {
  return {
    import_id: 1,
    status: "PREVIEWED",
    supplier: "DONALDSON",
    filename: "lista.xlsx",
    effective_date: "2025-10-20",
    currency: "MXN",
    summary: { products: 2, cancelled: 0, non_catalog: 0, replacements: 0, warnings: 0, errors: 0 },
    products_sample: [
      { part_number: "SYN-1", item_number: "I-1", description: "STACK PIPE, STRAIGHT 5 IN (127 MM) OD X 48 IN (1219 MM) CHROME", unit_price: "10.50", is_new: false },
      { part_number: "SYN-2", item_number: "I-2", description: "FILTRO", unit_price: "1.00", is_new: true },
    ],
    warnings: [],
    errors: [],
    ...overrides,
  } as ImportPreviewResponse;
}

async function chooseFile(user: ReturnType<typeof userEvent.setup>, supplier?: "FLEETGUARD") {
  if (supplier) await user.selectOptions(screen.getByLabelText("Proveedor"), supplier);
  const input = document.querySelector("input[type=file]") as HTMLInputElement;
  await user.upload(input, new File(["x"], "lista.xlsx", { type: XLSX }));
  await user.click(screen.getByRole("button", { name: "Analizar archivo" }));
}

describe("Importar lista de precios", () => {
  it("names the selected supplier in the drop zone (D6)", async () => {
    const user = userEvent.setup();
    render(<ImportPriceListPage />);
    expect(screen.getByText("Arrastra el archivo Donaldson aquí")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Proveedor"), "FLEETGUARD");
    expect(screen.getByText("Arrastra el archivo Fleetguard aquí")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Seleccionar archivo Fleetguard (.xlsx)" })).toBeTruthy();
    expect(screen.queryByText(/Donaldson aquí/)).toBeNull();
  });

  it("explains a file without the selected supplier's layout and keeps the backend detail (D7)", async () => {
    mocks.previewPriceListImport.mockRejectedValue(new ApiError(422, "No se encontró la hoja requerida 'Engine Final'."));
    const user = userEvent.setup();
    render(<ImportPriceListPage />);
    await chooseFile(user);
    expect(await screen.findByText(
      "El archivo no parece corresponder al formato Donaldson. Verifica el proveedor seleccionado o el archivo que intentas importar.",
    )).toBeTruthy();
    expect(screen.getByText("Detalle técnico: No se encontró la hoja requerida 'Engine Final'.")).toBeTruthy();
  });

  it("uses the Fleetguard wording for a Fleetguard header error", async () => {
    mocks.previewPriceListImport.mockRejectedValue(
      new ApiError(422, "No se reconocieron los encabezados de la hoja Fleetguard 'Lista de precios'."),
    );
    const user = userEvent.setup();
    render(<ImportPriceListPage />);
    await chooseFile(user, "FLEETGUARD");
    expect(await screen.findByText(/no parece corresponder al formato Fleetguard/)).toBeTruthy();
  });

  it("keeps every other error as the backend wrote it", async () => {
    mocks.previewPriceListImport.mockRejectedValue(new ApiError(422, "Archivo Excel inválido o corrupto."));
    const user = userEvent.setup();
    render(<ImportPriceListPage />);
    await chooseFile(user);
    expect(await screen.findByText("Archivo Excel inválido o corrupto.")).toBeTruthy();
    expect(screen.queryByText(/no parece corresponder/)).toBeNull();
    expect(screen.queryByText(/Detalle técnico/)).toBeNull();
  });

  it("shows the supplier's NEW mark, never a catalog status it cannot know (D10)", async () => {
    mocks.previewPriceListImport.mockResolvedValue(preview());
    const user = userEvent.setup();
    render(<ImportPriceListPage />);
    await chooseFile(user);
    expect(await screen.findByRole("columnheader", { name: "Marca del proveedor" })).toBeTruthy();
    expect(screen.queryByText("Existente")).toBeNull();
    expect(screen.getByText("Nuevo")).toBeTruthy();
    // The long description is shown whole, not truncated.
    expect(screen.getByText("STACK PIPE, STRAIGHT 5 IN (127 MM) OD X 48 IN (1219 MM) CHROME").className).not.toMatch(/truncate/);
  });

  it("does not repeat the backend's own count of hidden warnings", async () => {
    mocks.previewPriceListImport.mockResolvedValue(preview({
      summary: { products: 2, cancelled: 0, non_catalog: 0, replacements: 0, warnings: 30, errors: 0 },
      warnings: ["Fila 15: Peso no disponible ('*').", "Se muestran 1 de 30 advertencias. No se muestran 29: 29 «Peso no disponible ('*').»."],
    }));
    const user = userEvent.setup();
    render(<ImportPriceListPage />);
    await chooseFile(user);
    expect(await screen.findByText(/Se muestran 1 de 30 advertencias/)).toBeTruthy();
    expect(screen.queryByText(/Mostrando 2 de 30/)).toBeNull();
  });

  describe("a file that already is a live price list (#53)", () => {
    const duplicate = {
      message:
        "Este archivo ya está importado: es la lista de precios de DONALDSON vigente desde el 2025-10-20. Si quieres reemplazarla, elimínala primero.",
      existing_import_id: 34,
      existing_price_list_id: 12,
      effective_date: "2025-10-20",
      supplier: "DONALDSON",
    };

    function expectNoTechnicalReference() {
      expect(screen.queryByText(/ImportJob/)).toBeNull();
      expect(screen.queryByText(/backend no expone/)).toBeNull();
    }

    it("on preview: shows the backend message and links to that list", async () => {
      mocks.previewPriceListImport.mockRejectedValue(new ApiError(409, duplicate));
      const user = userEvent.setup();
      render(<ImportPriceListPage />);
      await chooseFile(user);
      expect(await screen.findByText(duplicate.message)).toBeTruthy();
      expect(screen.getByText("Este archivo ya está importado")).toBeTruthy();
      expect(screen.getByRole("link", { name: "Ver lista de precios" }).getAttribute("href")).toBe(
        "/donaldson/price-lists/12",
      );
      expectNoTechnicalReference();
    });

    it("from an older backend: a generic link and no ImportJob reference", async () => {
      mocks.previewPriceListImport.mockRejectedValue(
        new ApiError(409, { message: "Este archivo ya fue importado exitosamente (ImportJob #1).", existing_import_id: 1 }),
      );
      const user = userEvent.setup();
      render(<ImportPriceListPage />);
      await chooseFile(user);
      expect(await screen.findByText(DUPLICATE_IMPORT_FALLBACK_MESSAGE)).toBeTruthy();
      expect(screen.queryByRole("link", { name: "Ver lista de precios" })).toBeNull();
      expect(screen.getByRole("link", { name: "Ir a Listas de precios" }).getAttribute("href")).toBe(
        "/donaldson/price-lists",
      );
      expectNoTechnicalReference();
    });

    it("on confirm: the same alert, and the job can't be confirmed again", async () => {
      mocks.previewPriceListImport.mockResolvedValue(preview());
      mocks.confirmImport.mockRejectedValue(new ApiError(409, duplicate));
      const user = userEvent.setup();
      render(<ImportPriceListPage />);
      await chooseFile(user);
      await user.click(await screen.findByRole("button", { name: "Confirmar importación" }));
      expect(await screen.findByText(duplicate.message)).toBeTruthy();
      expect(screen.getByText("Este archivo ya está importado")).toBeTruthy();
      expect(screen.getByRole("link", { name: "Ver lista de precios" }).getAttribute("href")).toBe(
        "/donaldson/price-lists/12",
      );
      expect((screen.getByRole("button", { name: "Confirmar importación" }) as HTMLButtonElement).disabled).toBe(true);
      expectNoTechnicalReference();
    });

    it("on confirm, any other 409 keeps the current confirm error", async () => {
      mocks.previewPriceListImport.mockResolvedValue(preview());
      mocks.confirmImport.mockRejectedValue(
        new ApiError(409, "ImportJob #1 está en estado 'FAILED'; solo se puede confirmar un ImportJob en estado PREVIEWED."),
      );
      const user = userEvent.setup();
      render(<ImportPriceListPage />);
      await chooseFile(user);
      await user.click(await screen.findByRole("button", { name: "Confirmar importación" }));
      expect(await screen.findByText("No se pudo confirmar la importación")).toBeTruthy();
      expect(screen.getByText(/solo se puede confirmar un ImportJob en estado PREVIEWED/)).toBeTruthy();
      expect(screen.queryByRole("link", { name: /Ver lista de precios|Ir a Listas de precios/ })).toBeNull();
      expect((screen.getByRole("button", { name: "Confirmar importación" }) as HTMLButtonElement).disabled).toBe(false);
    });

    it("never links to an invalid list id", async () => {
      mocks.previewPriceListImport.mockRejectedValue(
        new ApiError(409, { ...duplicate, existing_price_list_id: "12; DROP" }),
      );
      const user = userEvent.setup();
      render(<ImportPriceListPage />);
      await chooseFile(user);
      expect(await screen.findByText(duplicate.message)).toBeTruthy();
      expect(screen.getByRole("link", { name: "Ir a Listas de precios" }).getAttribute("href")).toBe(
        "/donaldson/price-lists",
      );
    });

    it("importing after the list was deleted goes through the normal flow to the success screen", async () => {
      mocks.previewPriceListImport.mockResolvedValue(preview({ import_id: 2 }));
      mocks.confirmImport.mockResolvedValue({
        import_id: 2,
        price_list_id: 13,
        effective_date: "2025-10-20",
        created_products: 0,
        updated_products: 2,
        price_items: 2,
        cancelled: 0,
        non_catalog: 0,
        replacements: 0,
        warnings: 0,
      });
      const user = userEvent.setup();
      render(<ImportPriceListPage />);
      await chooseFile(user);
      await user.click(await screen.findByRole("button", { name: "Confirmar importación" }));
      expect(mocks.confirmImport).toHaveBeenCalledWith(2);
      expect(await screen.findByRole("button", { name: /Importar otr/ })).toBeTruthy();
      expect(screen.queryByText("Este archivo ya está importado")).toBeNull();
    });
  });
});
