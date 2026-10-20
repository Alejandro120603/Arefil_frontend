// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportRepeatableParameters } from "./report-repeatable-parameters";
import { createRuntimeGroupRow, initialRuntimeGroupValues, type RuntimeGroupValues } from "@/lib/reports/report-runtime";
import type { ReportColumn, ReportParameterGroup, ReportProductOption, ReportSummaryConfiguration } from "@/types/api";

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

function column(key: string, overrides: Partial<ReportColumn>): ReportColumn {
  return {
    key, label: key, column_type: "FIELD", source_field: null, source_parameter: null, formula_definition: null,
    data_type: "decimal", format_type: "currency", display_order: 0, visible: true, width: null, ...overrides,
  };
}

/** A builder whose line amount applies the captured discount as a percentage. */
const DISCOUNTED_LINE = {
  columns: [
    column("price", { source_field: "price_list_item.unit_price" }),
    column("qty", { column_type: "PARAMETER", source_parameter: "items.quantity", data_type: "integer" }),
    column("disc", { column_type: "PARAMETER", source_parameter: "items.discount" }),
    column("line_total", { column_type: "FORMULA", formula_definition: "ROUND(price * qty * (1 - disc / 100), 2)" }),
  ],
  summaries: [{ key: "subtotal", label: "Subtotal", column_key: "line_total", operation: "SUM", formula_definition: null, format_type: "currency" }] as ReportSummaryConfiguration[],
};

/** The seed's formula: the discount field exists but the amount ignores it. */
const PLAIN_LINE = {
  ...DISCOUNTED_LINE,
  columns: DISCOUNTED_LINE.columns.map((item) => item.key === "line_total"
    ? { ...item, formula_definition: "ROUND(qty * price, 2)" }
    : item),
};

function Harness({ lineAmount = DISCOUNTED_LINE }: { lineAmount?: typeof DISCOUNTED_LINE }) {
  const [context, setContext] = useState("7");
  const [values, setValues] = useState<RuntimeGroupValues>(() => initialRuntimeGroupValues([GROUP]));
  return <>
    <button onClick={() => setContext("8")}>Cambiar lista</button>
    <ReportRepeatableParameters code="COTIZACION" groups={[GROUP]} scalarValues={{ price_list_id: context }} values={values} onChange={setValues} lineAmount={lineAmount} />
  </>;
}

async function pickFilter(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("combobox", { name: "Producto 1" }));
  await user.type(screen.getByRole("combobox", { name: "Producto 1" }), "P5502");
  await user.click(await screen.findByRole("option", { name: /P550202/ }));
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
    // Original price, discounted price (0% by default), and one-unit total.
    expect(screen.getAllByText("$574.13")).toHaveLength(3);
    // The report's own formula: ROUND(574.13 × 4 × (1 − 5/100), 2) = 2181.69
    await user.clear(screen.getByLabelText("Cantidad * 1"));
    await user.type(screen.getByLabelText("Cantidad * 1"), "4");
    await user.clear(screen.getByLabelText("Descuento (%) 1"));
    await user.type(screen.getByLabelText("Descuento (%) 1"), "5");
    expect(screen.getByText("$545.42")).toBeTruthy();
    expect(screen.getByText("$2,181.69")).toBeTruthy();
  });

  it("K: a discount the report's formula ignores never changes the line total", async () => {
    const user = userEvent.setup();
    render(<Harness lineAmount={PLAIN_LINE} />);
    await pickFilter(user);
    await user.clear(screen.getByLabelText("Cantidad * 1"));
    await user.type(screen.getByLabelText("Cantidad * 1"), "2");
    expect(screen.getByText("$1,148.26")).toBeTruthy();
    await user.clear(screen.getByLabelText("Descuento (%) 1"));
    await user.type(screen.getByLabelText("Descuento (%) 1"), "50");
    expect(screen.getByText("$1,148.26")).toBeTruthy();
  });

  it("L: without a product, a quantity, or the report's columns the total stays —", async () => {
    const user = userEvent.setup();
    const view = render(<Harness />);
    // The description lives under the SKU (D8): the total is the 8th cell.
    const totalCell = () => screen.getAllByRole("row")[1].querySelectorAll("td")[7];
    expect(totalCell().textContent).toBe("—");
    await pickFilter(user);
    await user.clear(screen.getByLabelText("Cantidad * 1"));
    expect(totalCell().textContent).toBe("—");
    view.unmount();
    render(<Harness lineAmount={{ columns: [], summaries: [] }} />);
    await pickFilter(user);
    // Original and 0%-discounted unit price remain available without a total formula.
    expect(screen.getAllByText("$574.13")).toHaveLength(2);
  });

  it("A: the suggestions render in a portal outside the scrolling table", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await user.click(screen.getByRole("combobox", { name: "Producto 1" }));
    const listbox = await screen.findByRole("listbox");
    // Not inside the table's overflow container: rendered at document level.
    expect(container.contains(listbox)).toBe(false);
    expect(listbox.closest("[data-slot='product-suggestions']")).toBeTruthy();
    expect(await screen.findByRole("option", { name: /P550202/ })).toBeTruthy();
  });

  it("D: shows loading and empty states inside the floating list", async () => {
    let resolve: (value: ReportProductOption[]) => void = () => undefined;
    searchReportProductOptions.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("combobox", { name: "Producto 1" }));
    expect(await screen.findByText("Buscando...")).toBeTruthy();
    resolve([]);
    expect(await screen.findByText("Sin coincidencias.")).toBeTruthy();
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

const MANUAL_GROUP: ReportParameterGroup = {
  ...GROUP,
  max_items: null,
  allow_manual_items: true,
  fields: GROUP.fields.filter((field) => field.name !== "delivery_time"),
};

/** The definitive quotation formula: `line.unit_price` prices list and manual lines. */
const QUOTATION_LINE = {
  columns: [
    column("unit_price", { source_field: "line.unit_price" }),
    column("quantity", { column_type: "PARAMETER", source_parameter: "items.quantity", data_type: "integer" }),
    column("discount", { column_type: "PARAMETER", source_parameter: "items.discount" }),
    column("discounted_unit_price", { column_type: "FORMULA", formula_definition: "ROUND(unit_price * (1 - discount / 100), 2)" }),
    column("line_total", { column_type: "FORMULA", formula_definition: "ROUND(quantity * discounted_unit_price, 2)" }),
  ],
  summaries: DISCOUNTED_LINE.summaries,
};

function ManualHarness({ context = "7", onValues }: { context?: string; onValues?: (values: RuntimeGroupValues) => void }) {
  const [values, setValues] = useState<RuntimeGroupValues>(() => initialRuntimeGroupValues([MANUAL_GROUP]));
  return (
    <ReportRepeatableParameters
      code="PRODUCTOS_DESCUENTO"
      groups={[MANUAL_GROUP]}
      scalarValues={{ price_list_id: context }}
      values={values}
      onChange={(next) => { setValues(next); onValues?.(next); }}
      lineAmount={QUOTATION_LINE}
    />
  );
}

async function typeInto(user: ReturnType<typeof userEvent.setup>, label: string, text: string) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  await user.type(input, text);
}

describe("ReportRepeatableParameters — productos fuera de lista", () => {
  it("offers list and manual products; a manual one needs no price list", async () => {
    const user = userEvent.setup();
    render(<ManualHarness context="" />);
    expect((screen.getByRole("button", { name: "Producto de lista" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Agregar producto" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Producto fuera de lista" }));
    expect(screen.getByText("Fuera de lista")).toBeTruthy();
    for (const label of ["Descripción * 2", "No. de parte 2", "Unidad 2", "Precio unitario * 2"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    // The list row keeps its product search.
    expect(screen.getByRole("combobox", { name: "Producto 1" })).toBeTruthy();
    expect(screen.getByText("Lista")).toBeTruthy();
  });

  it("mixes list and manual lines in capture order and estimates each one immediately", async () => {
    const user = userEvent.setup();
    let latest: RuntimeGroupValues = {};
    render(<ManualHarness onValues={(values) => { latest = values; }} />);
    await pickFilter(user);
    await typeInto(user, "Cantidad * 1", "2");
    await typeInto(user, "Descuento (%) 1", "10");

    await user.click(screen.getByRole("button", { name: "Producto fuera de lista" }));
    await typeInto(user, "Descripción * 2", "Servicio especial de fabricación");
    await typeInto(user, "Precio unitario * 2", "800");
    await typeInto(user, "Descuento (%) 2", "15");
    await user.click(screen.getByRole("button", { name: "Producto de lista" }));

    // 574.13 × 0.90 = 516.72 (rounded) × 2 = 1,033.44; 800 × 0.85 = 680.00 × 1.
    expect(screen.getByText("$516.72")).toBeTruthy();
    expect(screen.getByText("$1,033.44")).toBeTruthy();
    expect(screen.getAllByText("$680.00")).toHaveLength(2);
    await typeInto(user, "Cantidad * 2", "3");
    expect(screen.getByText("$2,040.00")).toBeTruthy();

    expect(latest.items.map((row) => row.origin)).toEqual(["LIST_PRODUCT", "MANUAL_PRODUCT", "LIST_PRODUCT"]);
    expect(latest.items[1].values).toMatchObject({ description: "Servicio especial de fabricación", unit_price: "800", quantity: "3" });
    // Manual lines never touch the price of the list lines.
    expect(screen.getByText("$1,033.44")).toBeTruthy();
  });

  it("deletes a manual line without disturbing the list lines around it", async () => {
    const user = userEvent.setup();
    let latest: RuntimeGroupValues = {};
    render(<ManualHarness onValues={(values) => { latest = values; }} />);
    await pickFilter(user);
    await user.click(screen.getByRole("button", { name: "Producto fuera de lista" }));
    await typeInto(user, "Descripción * 2", "Temporal");
    await user.click(screen.getByRole("button", { name: "Producto de lista" }));
    await user.click(screen.getByRole("button", { name: "Eliminar renglón 2" }));

    expect(screen.queryByLabelText("Descripción * 2")).toBeNull();
    expect(latest.items.map((row) => row.origin)).toEqual(["LIST_PRODUCT", "LIST_PRODUCT"]);
    expect(screen.getByText("Filtro Donaldson")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Producto 2" })).toBeTruthy();
  });

  it("shows the errors of a manual line under its own fields", () => {
    const values = { items: [createRuntimeGroupRow(MANUAL_GROUP, "m", "MANUAL_PRODUCT")] };
    render(
      <ReportRepeatableParameters
        code="COTIZACION_PRODUCTOS"
        groups={[MANUAL_GROUP]}
        scalarValues={{ price_list_id: "7" }}
        values={values}
        onChange={() => undefined}
        errors={{ items: { 0: { description: "Este campo es requerido.", unit_price: "admite como máximo dos decimales." } } }}
      />,
    );
    expect(screen.getByText("Este campo es requerido.")).toBeTruthy();
    expect(screen.getByText("admite como máximo dos decimales.")).toBeTruthy();
    expect(screen.getByLabelText("Descripción * 1").getAttribute("aria-invalid")).toBe("true");
    // A manual line has no product search to revalidate.
    expect(resolveReportProductOption).not.toHaveBeenCalled();
  });
});
