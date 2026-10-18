// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Product } from "@/types/api";
import ProductsPage from "./page";

const api = vi.hoisted(() => ({ listProducts: vi.fn() }));
vi.mock("@/lib/api/products", () => api);

function product(overrides: Partial<Product>): Product {
  return {
    id: 1,
    supplier: "DONALDSON",
    part_number: "P-1",
    item_number: null,
    description: "Filtro",
    sat_code: null,
    created_at: "2026-10-17T00:00:00",
    updated_at: "2026-10-17T00:00:00",
    ...overrides,
  };
}

function renderPage(searchParams: Record<string, string> = {}) {
  return ProductsPage({ searchParams: Promise.resolve(searchParams) }).then((page) => render(page));
}

describe("Productos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listProducts.mockResolvedValue({
      items: [
        product({ id: 1, part_number: "P-1", has_price_list: true }),
        product({ id: 2, part_number: "P-2", has_price_list: false }),
        product({ id: 3, part_number: "P-3" }),
      ],
      meta: { page: 1, page_size: 25, total_items: 3, total_pages: 1 },
    });
  });
  afterEach(cleanup);

  it("marks only products that no live price list includes", async () => {
    await renderPage();
    const marks = screen.getAllByText("Sin lista vigente", { selector: "[data-slot=badge], span" });
    expect(marks).toHaveLength(1);
    expect(marks[0]?.closest("td")?.textContent).toContain("P-2");
    // An older backend sends no flag: nothing is claimed.
    expect(screen.getByText("P-3").closest("td")?.textContent).toBe("P-3");
  });

  it.each([
    [{}, undefined],
    [{ has_price_list: "" }, undefined],
    [{ has_price_list: "true" }, true],
    [{ has_price_list: "false" }, false],
    [{ has_price_list: "otro" }, undefined],
  ])("passes the price-list filter %j to the API", async (searchParams, expected) => {
    await renderPage(searchParams);
    expect(api.listProducts).toHaveBeenCalledWith(expect.objectContaining({ has_price_list: expected }));
  });

  it("keeps the chosen filter selected and offers Limpiar", async () => {
    await renderPage({ has_price_list: "false" });
    expect((screen.getByLabelText("Lista de precios") as HTMLSelectElement).value).toBe("false");
    expect(screen.getByText("Limpiar").closest("a")?.getAttribute("href")).toBe("/donaldson/products");
  });
});
