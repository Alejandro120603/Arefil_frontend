// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportRepeatableParameters } from "./report-repeatable-parameters";
import { initialRuntimeGroupValues, type RuntimeGroupValues } from "@/lib/reports/report-runtime";
import type { ReportParameterGroup } from "@/types/api";

const { getReportParameterOptions } = vi.hoisted(() => ({ getReportParameterOptions: vi.fn() }));
vi.mock("@/lib/api/reports", () => ({ getReportParameterOptions }));

const GROUP: ReportParameterGroup = {
  name: "items", label: "Productos", resolver_key: "products_by_price_list", context_parameter: "price_list_id",
  min_items: 1, max_items: 2, display_order: 0,
  fields: [
    { name: "product_id", label: "Producto", data_type: "integer", input_type: "select", required: true, default_value: null, display_order: 0, configuration_json: { options_source: "products_by_price_list", context_parameter: "price_list_id" } },
    { name: "quantity", label: "Cantidad", data_type: "integer", input_type: "number", required: true, default_value: 1, display_order: 1, configuration_json: { minimum: "0", exclusive_minimum: true } },
    { name: "discount", label: "Descuento", data_type: "decimal", input_type: "number", required: false, default_value: "0", display_order: 2, configuration_json: { minimum: "0", maximum: "100" } },
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
  getReportParameterOptions.mockImplementation((_code, _field, context) => Promise.resolve(
    context.price_list_id === "7"
      ? [{ value: 101, label: "P-001 · Filtro" }, { value: 202, label: "P-002 · Aceite" }]
      : [{ value: 202, label: "P-002 · Aceite" }],
  ));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReportRepeatableParameters", () => {
  it("adds/removes rows, applies defaults, and respects max_items", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect((screen.getByLabelText("Cantidad *") as HTMLInputElement).value).toBe("1");
    expect((screen.getByLabelText("Descuento (%)") as HTMLInputElement).value).toBe("0");
    await user.click(screen.getByRole("button", { name: "Agregar renglón" }));
    expect(screen.getAllByText(/Renglón \d/)).toHaveLength(2);
    expect((screen.getByRole("button", { name: "Agregar renglón" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Eliminar renglón 1" }));
    expect(screen.getAllByText(/Renglón \d/)).toHaveLength(1);
  });

  it("queries products with scalar context and clears a selection incompatible with the new list", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const select = await screen.findByLabelText("Producto *");
    await user.selectOptions(select, "101");
    expect((select as HTMLSelectElement).value).toBe("101");
    await user.click(screen.getByRole("button", { name: "Cambiar lista" }));
    await waitFor(() => expect(getReportParameterOptions).toHaveBeenLastCalledWith(
      "COTIZACION", "items.product_id", { price_list_id: "8" }, expect.anything(),
    ));
    await waitFor(() => expect((screen.getByLabelText("Producto *") as HTMLSelectElement).value).toBe(""));
    expect(screen.getByRole("option", { name: "P-002 · Aceite" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "P-001 · Filtro" })).toBeNull();
  });

  it("shows option loading, empty, and backend errors without exposing stale products", async () => {
    let resolveOptions: ((value: []) => void) | undefined;
    getReportParameterOptions.mockImplementationOnce(() => new Promise((resolve) => { resolveOptions = resolve; }));
    const { unmount } = render(<Harness />);
    expect((await screen.findByLabelText("Producto *") as HTMLSelectElement).disabled).toBe(true);
    resolveOptions?.([]);
    expect(await screen.findByText("No hay opciones disponibles.")).toBeTruthy();
    unmount();

    getReportParameterOptions.mockRejectedValueOnce(new Error("network"));
    render(<Harness />);
    expect(await screen.findByText("No se pudieron cargar las opciones de los renglones.")).toBeTruthy();
  });
});
