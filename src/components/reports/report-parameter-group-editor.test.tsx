// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportParameterGroupEditor } from "./report-parameter-group-editor";
import type { ReportParameter, ReportParameterGroup } from "@/types/api";

afterEach(cleanup);

const parameters: ReportParameter[] = [
  {
    name: "price_list_id",
    label: "Lista de precios",
    data_type: "integer",
    input_type: "select",
    required: true,
    default_value: null,
    display_order: 0,
    configuration_json: null,
  },
];

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
  ],
};

describe("ReportParameterGroupEditor", () => {
  it("adds a numeric subfield instead of discarding the patch", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ReportParameterGroupEditor groups={[group]} parameters={parameters} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Campo numérico/ }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const [[next]] = onChange.mock.calls;
    expect(next[0].fields.map((field: { name: string }) => field.name)).toEqual(["product_id", "number_1"]);
    expect(next[0].fields[1].input_type).toBe("number");
  });

  it("adds a text subfield", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ReportParameterGroupEditor groups={[group]} parameters={parameters} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Campo de texto/ }));

    const [[next]] = onChange.mock.calls;
    expect(next[0].fields.map((field: { name: string }) => field.name)).toEqual(["product_id", "text_1"]);
  });

  it("removes a subfield", async () => {
    const twoFields: ReportParameterGroup = {
      ...group,
      fields: [
        ...group.fields,
        {
          name: "quantity",
          label: "Cantidad",
          data_type: "decimal",
          input_type: "number",
          required: false,
          default_value: null,
          display_order: 1,
          configuration_json: {},
        },
      ],
    };
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ReportParameterGroupEditor groups={[twoFields]} parameters={parameters} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Eliminar quantity" }));

    const [[next]] = onChange.mock.calls;
    expect(next[0].fields.map((field: { name: string }) => field.name)).toEqual(["product_id"]);
  });

  it("renames a subfield", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ReportParameterGroupEditor groups={[group]} parameters={parameters} onChange={onChange} />);

    await user.type(screen.getByLabelText("Etiqueta", { selector: "#group-field-label-0" }), "!");

    const [[next]] = onChange.mock.calls;
    expect(next[0].fields[0].label).toBe("Producto!");
  });

  it("keeps the product selector pointing at the current context parameter", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ReportParameterGroupEditor groups={[group]} parameters={parameters} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Campo numérico/ }));

    const [[next]] = onChange.mock.calls;
    expect(next[0].fields[0].configuration_json).toEqual({
      options_source: "products_by_price_list",
      context_parameter: "price_list_id",
    });
  });
});
