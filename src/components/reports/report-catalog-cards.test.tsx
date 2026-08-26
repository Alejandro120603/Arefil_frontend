// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReportCatalogCards } from "./report-catalog-cards";
import type { ReportDefinition } from "@/types/api";

const BASE: Omit<ReportDefinition, "code" | "name" | "data_source_type"> = {
  description: null,
  category: null,
  enabled: true,
  active_template_version: null,
  parameters: [],
  created_at: "2026-08-25T12:00:00Z",
  updated_at: "2026-08-25T12:00:00Z",
};

afterEach(cleanup);

describe("ReportCatalogCards", () => {
  it("keeps A/B operational and exposes capability-aware actions for generic reports", () => {
    render(<ReportCatalogCards reports={[
      { ...BASE, code: "PRICE_LIST_COMPARISON", name: "Comparación", data_source_type: "HANDLER" },
      { ...BASE, code: "PRODUCT_CATALOG", name: "Productos", data_source_type: "SQL_QUERY" },
    ]} />);

    expect(screen.getAllByRole("button", { name: /Diseñar/ })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /Configurar/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Ver" }).getAttribute("href")).toBe("/donaldson/reports/PRICE_LIST_COMPARISON");
    expect(screen.getByRole("button", { name: /Descargar datos/ })).toBeTruthy();
    expect(screen.getByText(/Runner de Frontend #12/)).toBeTruthy();
  });
});
