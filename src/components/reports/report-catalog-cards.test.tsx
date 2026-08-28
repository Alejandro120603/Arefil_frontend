// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReportCatalogCards } from "./report-catalog-cards";
import type { ReportDefinition } from "@/types/api";

const BASE: Omit<ReportDefinition, "code" | "name"> = {
  description: null,
  category: null,
  enabled: true,
  data_source_id: 1,
  data_source: {
    id: 1,
    code: "PRODUCT_CATALOG",
    name: "Catálogo de productos",
    description: null,
    enabled: true,
    capabilities: [],
  },
  parameters: [],
  parameter_groups: [],
  created_at: "2026-08-25T12:00:00Z",
  updated_at: "2026-08-25T12:00:00Z",
};

afterEach(cleanup);

describe("ReportCatalogCards", () => {
  it("keeps A/B operational and exposes capability-aware actions for generic reports", () => {
    render(<ReportCatalogCards reports={[
      { ...BASE, code: "PRICE_LIST_COMPARISON", name: "Comparación" },
      { ...BASE, code: "PRODUCT_CATALOG", name: "Productos" },
    ]} />);

    expect(screen.queryByRole("button", { name: /Diseñar/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: /Configurar/ })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Generar" }).map((button) => button.getAttribute("href"))).toEqual([
      "/donaldson/reports/PRICE_LIST_COMPARISON",
      "/donaldson/reports/PRODUCT_CATALOG",
    ]);
    expect(screen.queryByRole("button", { name: /Descargar datos/ })).toBeNull();
    expect(screen.queryByText(/Runner de Frontend #12/)).toBeNull();
  });

  it("blocks runtime actions for disabled definitions without blocking configuration", () => {
    render(<ReportCatalogCards reports={[
      { ...BASE, code: "DISABLED", name: "Deshabilitado", enabled: false },
    ]} />);
    expect((screen.getByRole("button", { name: "Generar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: /Configurar/ }).getAttribute("href")).toBe("/administracion/reportes/DISABLED");
    expect(screen.queryByRole("button", { name: /Diseñar/ })).toBeNull();
    expect(screen.getByText(/está deshabilitado/)).toBeTruthy();
  });
});
