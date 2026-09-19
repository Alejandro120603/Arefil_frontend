// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportRepeatableParameters } from "./report-repeatable-parameters";
import { initialRuntimeGroupValues, type RuntimeGroupValues } from "@/lib/reports/report-runtime";
import type { ReportParameterGroup, ReportProductOption } from "@/types/api";

const { resolveReportProductOption, searchReportProductOptions } = vi.hoisted(() => ({
  resolveReportProductOption: vi.fn(), searchReportProductOptions: vi.fn(),
}));
vi.mock("@/lib/api/reports", () => ({ resolveReportProductOption, searchReportProductOptions }));

function product(overrides: Partial<ReportProductOption> & { product_id: number }): ReportProductOption {
  return {
    value: overrides.product_id,
    label: `${overrides.part_number ?? "P-000"} · ${overrides.description ?? ""}`,
    part_number: "P-000", item_number: null, description: null,
    unit_price: "100.00", currency: "MXN", classification: null,
    ...overrides,
  };
}

const FILTER = product({ product_id: 101, part_number: "P550202", description: "Filtro Donaldson", unit_price: "574.13" });
const OIL = product({ product_id: 202, part_number: "P-002", description: "Aceite", unit_price: "80.00" });

const GROUP: ReportParameterGroup = {
  name: "items", label: "Productos", resolver_key: "products_by_price_list", context_parameter: "price_list_id",
  min_items: 1, max_items: 2, display_order: 0,
  fields: [
    { name: "product_id", label: "Producto", data_type: "integer", input_type: "select", required: true, default_value: null, display_order: 0, configuration_json: { options_source: "products_by_price_list", context_parameter: "price_list_id" } },
    { name: "quantity", label: "Cantidad", data_type: "integer", input_type: "number", required: true, default_value: 1, display_order: 1, configuration_json: { minimum: "0", exclusive_minimum: true } },
    { name: "discount", label: "Descuento", data_type: "decimal", input_type: "number", required: false, default_value: "0", display_order: 2, configuration_json: { minimum: "0", maximum: "100" } },
    { name: "delivery_time", label: "T/E", data_type: "string", input_type: "text", required: false, default_value: "INMEDIATA", display_order: 3, configuration_json: null },
  ],
};

function Harness() {
  const [context, setContext] = useState("7");
  const [values, setValues] = useState<RuntimeGroupValues>(() => initialRuntimeGroupValues([GROUP]));
  return <>
    <button onClick={() => setContext("8")}>Cambiar lista</button>
    <ReportRepeatableParameters code="COTIZACION" groups={[GROUP]} scalarValues={{ price_list_id: context }} values={values} onChange={setValues} />
  </>;
}

beforeEach(() => {
  searchReportProductOptions.mockResolvedValue([FILTER, OIL]);
  resolveReportProductOption.mockImplementation((_code, _path, context, productId) => Promise.resolve(
    context.price_list_id === "8" && productId === FILTER.product_id
      ? null
      : [FILTER, OIL].find((candidate) => candidate.product_id === productId) ?? null,
  ));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReportRepeatableParameters", () => {
  it("renders line items as table rows with defaults, item numbers and max_items", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect((screen.getByLabelText("Cantidad * 1") as HTMLInputElement).value).toBe("1");
    expect((screen.getByLabelText("Descuento (%) 1") as HTMLInputElement).value).toBe("0");
    expect((screen.getByLabelText("T/E 1") as HTMLInputElement).value).toBe("INMEDIATA");
    await user.click(screen.getByRole("button", { name: "Agregar producto" }));
    expect(screen.getByLabelText("Cantidad * 2")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Agregar producto" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Eliminar renglón 1" }));
    expect(screen.queryByLabelText("Cantidad * 2")).toBeNull();
  });

  it("searches products server-side and prices the line from the selected product", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("combobox", { name: "Producto 1" }));
    await user.type(screen.getByRole("combobox", { name: "Producto 1" }), "P5502");
    await waitFor(() => expect(searchReportProductOptions).toHaveBeenLastCalledWith(
      "COTIZACION", "items.product_id", { price_list_id: "7" }, "P5502", expect.anything(),
    ));
    await user.click(await screen.findByRole("option", { name: /P550202/ }));

    expect(await screen.findByText("Filtro Donaldson")).toBeTruthy();
    // Unit price cell plus the 1-unit line total.
    expect(screen.getAllByText("$574.13")).toHaveLength(2);
    // 4 × 574.13 − 5% = 2181.69
    await user.clear(screen.getByLabelText("Cantidad * 1"));
    await user.type(screen.getByLabelText("Cantidad * 1"), "4");
    await user.clear(screen.getByLabelText("Descuento (%) 1"));
    await user.type(screen.getByLabelText("Descuento (%) 1"), "5");
    expect(screen.getByText("$2,181.69")).toBeTruthy();
  });

  it("drops a product missing from the new price list and keeps one that still belongs to it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("combobox", { name: "Producto 1" }));
    await user.click(await screen.findByRole("option", { name: /P550202/ }));
    expect(await screen.findByText("Filtro Donaldson")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Cambiar lista" }));
    await waitFor(() => expect(resolveReportProductOption).toHaveBeenCalledWith(
      "COTIZACION", "items.product_id", { price_list_id: "8" }, 101, expect.anything(),
    ));
    expect(await screen.findByRole("combobox", { name: "Producto 1" })).toBeTruthy();
    expect(screen.queryByText("Filtro Donaldson")).toBeNull();
  });

  it("surfaces a failed product search without silently emptying the row", async () => {
    searchReportProductOptions.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("combobox", { name: "Producto 1" }));
    expect(await screen.findByText("No se pudieron buscar productos.")).toBeTruthy();
  });
});
