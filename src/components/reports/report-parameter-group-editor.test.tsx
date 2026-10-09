// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportParameterGroupEditor } from "./report-parameter-group-editor";
import type { ReportParameter, ReportParameterGroup } from "@/types/api";

afterEach(cleanup);

const PRICE_LIST: ReportParameter = {
  name: "price_list_id",
  label: "Lista de precios",
  data_type: "integer",
  input_type: "select",
  required: true,
  default_value: null,
  display_order: 0,
  configuration_json: { options_source: "price_lists" },
};

const SECOND_PRICE_LIST: ReportParameter = {
  ...PRICE_LIST, name: "reference_price_list_id", label: "Lista de referencia", display_order: 1,
};

const group: ReportParameterGroup = {
  name: "items",
  label: "Productos",
  resolver_key: "products_by_price_list",
  context_parameter: "price_list_id",
  min_items: 1,
  max_items: null,
  display_order: 0,
  fields: [
    {
      name: "product_id",
      label: "Producto",
      data_type: "integer",
      input_type: "select",
      required: true,
      default_value: null,
      display_order: 0,
      configuration_json: { options_source: "products_by_price_list", context_parameter: "price_list_id" },
    },
    {
      name: "quantity",
      label: "Cantidad",
      data_type: "integer",
      input_type: "number",
      required: true,
      default_value: 1,
      display_order: 1,
      configuration_json: { minimum: 0, exclusive_minimum: true },
    },
  ],
};

/** Controlled like the workspace: every change is applied and recorded. */
function Harness({
  initial,
  parameters = [PRICE_LIST],
  savedGroups = [],
  referencedSources = [],
  onChange,
}: {
  initial: ReportParameterGroup[];
  parameters?: ReportParameter[];
  savedGroups?: ReportParameterGroup[];
  referencedSources?: string[];
  onChange: (groups: ReportParameterGroup[]) => void;
}) {
  const [groups, setGroups] = useState(initial);
  return (
    <ReportParameterGroupEditor
      groups={groups}
      parameters={parameters}
      savedGroups={savedGroups}
      referencedSources={referencedSources}
      onChange={(next) => { setGroups(next); onChange(next); }}
    />
  );
}

function latest(onChange: ReturnType<typeof vi.fn>): ReportParameterGroup[] {
  return onChange.mock.calls.at(-1)![0];
}

describe("ReportParameterGroupEditor", () => {
  it("creates a group named after its visible name, with the only price list inferred", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={[]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Agregar productos por renglón/ }));

    const [created] = latest(onChange);
    expect(created).toMatchObject({
      name: "productos", label: "Productos", resolver_key: "products_by_price_list",
      context_parameter: "price_list_id", min_items: 1, max_items: null,
    });
    expect(created.fields).toEqual([expect.objectContaining({
      name: "product_id", input_type: "select", data_type: "integer", required: true,
      configuration_json: { options_source: "products_by_price_list", context_parameter: "price_list_id" },
    })]);
    // Inferred, so there is nothing technical to choose.
    expect(screen.getByText("Los productos se toman de")).toBeTruthy();
    expect(screen.getByText("Lista de precios")).toBeTruthy();
    expect(screen.queryByLabelText("Lista usada para productos")).toBeNull();
    expect(screen.queryByText(/price_list_id|products_by_price_list/)).toBeNull();

    // While unsaved and unreferenced, the internal name follows the visible one.
    await user.clear(screen.getByLabelText("Nombre visible del grupo"));
    await user.type(screen.getByLabelText("Nombre visible del grupo"), "Artículos");
    expect(latest(onChange)[0]).toMatchObject({ name: "articulos", label: "Artículos" });
  });

  it("never names a new group after a scalar parameter", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const productos: ReportParameter = { ...PRICE_LIST, name: "productos", label: "Productos", input_type: "number", configuration_json: null };
    render(<Harness initial={[]} parameters={[PRICE_LIST, productos]} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /Agregar productos por renglón/ }));
    expect(latest(onChange)[0].name).toBe("productos_2");
  });

  it("keeps a saved group's internal name when its visible name changes", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={[group]} savedGroups={[group]} onChange={onChange} />);

    await user.clear(screen.getByLabelText("Nombre visible del grupo"));
    await user.type(screen.getByLabelText("Nombre visible del grupo"), "Artículos");

    expect(latest(onChange)[0]).toMatchObject({ name: "items", label: "Artículos", context_parameter: "price_list_id" });
  });

  it("keeps a referenced group's name even before it is saved", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const fresh = { ...group, name: "productos" };
    render(<Harness initial={[fresh]} referencedSources={["productos.quantity"]} onChange={onChange} />);
    await user.type(screen.getByLabelText("Nombre visible del grupo"), "!");
    expect(latest(onChange)[0].name).toBe("productos");
  });

  it("shows no internal names, for the group or its fields", () => {
    render(<Harness initial={[group]} savedGroups={[group]} onChange={vi.fn()} />);
    expect(screen.queryByLabelText("Nombre interno")).toBeNull();
    expect(screen.queryByText("Nombre interno")).toBeNull();
    expect(screen.queryByDisplayValue("items")).toBeNull();
    expect(screen.queryByDisplayValue("product_id")).toBeNull();
    expect(screen.queryByDisplayValue("quantity")).toBeNull();
    expect(screen.queryByText(/products_by_price_list|price_list_id|exclusiv/i)).toBeNull();
  });

  it("presents the product as a fixed, non-removable part of every row", () => {
    render(<Harness initial={[group]} onChange={vi.fn()} />);
    const product = screen.getByRole("group", { name: "Producto" });
    expect(within(product).getByText("Obligatorio")).toBeTruthy();
    expect((within(product).getByLabelText("Tipo") as HTMLSelectElement).disabled).toBe(true);
    expect(within(product).getByText("Producto de la lista")).toBeTruthy();
    expect(within(product).getByText(/productos de la lista seleccionada/)).toBeTruthy();
    expect(within(product).queryByRole("button", { name: /Quitar/ })).toBeNull();
    expect(within(product).queryByLabelText("Valor predeterminado")).toBeNull();
    // The product already exists, so it is not offered a second time.
    expect(screen.queryByRole("button", { name: "Producto" })).toBeNull();
  });

  it("asks for a price list in business terms when the source has none", () => {
    render(<Harness initial={[]} parameters={[]} onChange={vi.fn()} />);
    expect(screen.getByText("Para usar productos por renglón, la fuente necesita una lista de precios.")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Agregar productos por renglón/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("flags a saved group whose price list no longer exists", () => {
    render(<Harness initial={[group]} parameters={[]} onChange={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toBe("Para usar productos por renglón, la fuente necesita una lista de precios.");
  });

  it("offers a human selector when several price lists qualify, and saves the real name", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={[group]} parameters={[PRICE_LIST, SECOND_PRICE_LIST]} onChange={onChange} />);

    const selector = screen.getByLabelText("Lista usada para productos") as HTMLSelectElement;
    expect([...selector.options].map((option) => option.textContent)).toEqual(["Lista de precios", "Lista de referencia"]);
    await user.selectOptions(selector, "reference_price_list_id");

    const [next] = latest(onChange);
    expect(next.context_parameter).toBe("reference_price_list_id");
    expect(next.fields[0].configuration_json).toEqual({
      options_source: "products_by_price_list", context_parameter: "reference_price_list_id",
    });
  });

  it("keeps a legacy context that is not a price list, shown by its label", () => {
    const quantity: ReportParameter = { ...PRICE_LIST, name: "store_id", label: "Sucursal", input_type: "number", configuration_json: null };
    render(<Harness initial={[{ ...group, context_parameter: "store_id" }]} parameters={[quantity, PRICE_LIST]} onChange={vi.fn()} />);
    const selector = screen.getByLabelText("Lista usada para productos") as HTMLSelectElement;
    expect(selector.value).toBe("store_id");
    expect(selector.selectedOptions[0].textContent).toBe("Sucursal");
  });

  it("adds Cantidad and Descuento presets with unique generated names", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={[group]} savedGroups={[group]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Cantidad" }));
    await user.click(screen.getByRole("button", { name: "Descuento" }));
    await user.click(screen.getByRole("button", { name: "Descuento" }));

    const fields = latest(onChange)[0].fields;
    expect(fields.map((field) => field.name)).toEqual(["product_id", "quantity", "cantidad", "descuento", "descuento_2"]);
    expect(fields[2]).toEqual({
      name: "cantidad", label: "Cantidad", data_type: "integer", input_type: "number", required: true,
      default_value: 1, display_order: 2, configuration_json: { minimum: 0, exclusive_minimum: true },
    });
    expect(fields[3]).toEqual({
      name: "descuento", label: "Descuento", data_type: "decimal", input_type: "number", required: false,
      default_value: null, display_order: 3, configuration_json: { minimum: 0 },
    });
  });

  it("names a new subfield after its visible name until it is saved", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={[group]} savedGroups={[group]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Número" }));
    const label = screen.getByLabelText("Nombre visible", { selector: "#group-field-label-2" });
    await user.clear(label);
    await user.type(label, "Peso (kg)");

    expect(latest(onChange)[0].fields[2]).toMatchObject({ name: "peso_kg", label: "Peso (kg)" });
  });

  it("keeps a saved subfield's internal name when its visible name changes", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={[group]} savedGroups={[group]} onChange={onChange} />);

    const label = screen.getByLabelText("Nombre visible", { selector: "#group-field-label-1" });
    await user.clear(label);
    await user.type(label, "Piezas");

    expect(latest(onChange)[0].fields[1]).toMatchObject({ name: "quantity", label: "Piezas" });
  });

  it("produces the integer, decimal and text contracts", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={[group]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Número" }));
    expect(latest(onChange)[0].fields[2]).toMatchObject({ data_type: "integer", input_type: "number", configuration_json: {} });

    const card = screen.getByRole("group", { name: "Número" });
    await user.click(within(card).getByLabelText("Permitir decimales"));
    expect(latest(onChange)[0].fields[2]).toMatchObject({ data_type: "decimal", input_type: "number", configuration_json: {} });

    await user.selectOptions(within(card).getByLabelText("Tipo"), "text");
    expect(latest(onChange)[0].fields[2]).toMatchObject({ data_type: "string", input_type: "text", configuration_json: null });
    expect(within(card).queryByLabelText("Permitir decimales")).toBeNull();
    expect(within(card).queryByText("Límites")).toBeNull();
  });

  it("keeps limits collapsed by default and still saves them in the current contract", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={[group]} onChange={onChange} />);

    const card = screen.getByRole("group", { name: "Cantidad" });
    const details = card.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(within(card).getByText(/mayor que 0/)).toBeTruthy();

    await user.click(within(card).getByText("Límites"));
    expect(details.open).toBe(true);
    await user.type(within(card).getByLabelText("Valor máximo"), "50");
    await user.click(within(card).getByLabelText("El valor debe ser menor que el máximo"));

    expect(latest(onChange)[0].fields[1].configuration_json).toEqual({
      minimum: 0, exclusive_minimum: true, maximum: "50", exclusive_maximum: true,
    });
  });

  it("removes a simple subfield", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={[group]} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Quitar Cantidad" }));
    expect(latest(onChange)[0].fields.map((field) => field.name)).toEqual(["product_id"]);
  });

  it("keeps a legacy subfield read-only and resends its configuration untouched", async () => {
    const legacy: ReportParameterGroup = {
      ...group,
      fields: [...group.fields, {
        name: "delivery", label: "Entrega", data_type: "date", input_type: "date",
        required: false, default_value: "2026-01-01", display_order: 2, configuration_json: null,
      }],
    };
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={[legacy]} savedGroups={[legacy]} onChange={onChange} />);

    const card = screen.getByRole("group", { name: "Entrega" });
    expect(within(card).getByText("Personalizado (anterior)")).toBeTruthy();
    expect(within(card).queryByLabelText("Valor predeterminado")).toBeNull();
    await user.type(within(card).getByLabelText("Nombre visible"), " estimada");

    const [next] = latest(onChange);
    expect(next.name).toBe("items");
    expect(next.context_parameter).toBe("price_list_id");
    expect(next.fields[1]).toEqual(group.fields[1]);
    expect(next.fields[2]).toEqual({ ...legacy.fields[2], label: "Entrega estimada" });
  });

  it("keeps the product selector pointing at the current context parameter", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={[group]} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Texto" }));
    expect(latest(onChange)[0].fields[0].configuration_json).toEqual({
      options_source: "products_by_price_list",
      context_parameter: "price_list_id",
    });
  });
});
