// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
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
});
