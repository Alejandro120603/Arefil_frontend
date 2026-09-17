import { describe, expect, it } from "vitest";
import {
  backendRowErrors,
  estimateLineTotal,
  productSearchField,
  initialRuntimeGroupValues,
  initialRuntimeValues,
  orderedReportParameters,
  validateRuntimeForm,
  validateRuntimeParameters,
} from "./report-runtime";
import type { ReportParameter, ReportParameterGroup } from "@/types/api";

function parameter(overrides: Partial<ReportParameter> & Pick<ReportParameter, "name" | "input_type" | "data_type">): ReportParameter {
  return {
    label: overrides.name,
    required: false,
    default_value: null,
    display_order: 0,
    configuration_json: null,
    ...overrides,
  };
}

describe("generic report runtime parameters", () => {
  const parameters: ReportParameter[] = [
    parameter({ name: "notes", data_type: "string", input_type: "text", display_order: 5 }),
    parameter({ name: "quantity", data_type: "integer", input_type: "number", required: true, default_value: 4, display_order: 1 }),
    parameter({ name: "amount", data_type: "decimal", input_type: "number", default_value: "12.3400", display_order: 2 }),
    parameter({ name: "day", data_type: "date", input_type: "date", default_value: "2026-08-26", display_order: 3 }),
    parameter({ name: "moment", data_type: "datetime", input_type: "datetime", default_value: "2026-08-26T10:30:45Z", display_order: 4 }),
    parameter({ name: "enabled", data_type: "boolean", input_type: "checkbox", required: true, default_value: false, display_order: 6 }),
  ];

  it("sorts metadata and normalizes every default into native-control values", () => {
    expect(orderedReportParameters(parameters).map((item) => item.name)).toEqual([
      "quantity", "amount", "day", "moment", "notes", "enabled",
    ]);
    expect(initialRuntimeValues(parameters)).toEqual({
      notes: "",
      quantity: "4",
      amount: "12.3400",
      day: "2026-08-26",
      moment: "2026-08-26T10:30",
      enabled: false,
    });
  });

  it("coerces integers and booleans while preserving decimals and ISO input strings", () => {
    const values = initialRuntimeValues(parameters);
    const result = validateRuntimeParameters("GENERIC", parameters, values);
    expect(result.valid).toBe(true);
    expect(result.parameters).toEqual({
      quantity: 4,
      amount: "12.3400",
      day: "2026-08-26",
      moment: "2026-08-26T10:30",
      enabled: false,
    });
  });

  it("rejects missing, fractional integer, and impossible date values", () => {
    const requiredDate = parameter({ name: "day", data_type: "date", input_type: "date", required: true });
    const integer = parameter({ name: "count", data_type: "integer", input_type: "number" });
    const result = validateRuntimeParameters("GENERIC", [requiredDate, integer], { day: "2026-02-30", count: "1.5" });
    expect(result.valid).toBe(false);
    expect(result.fieldErrors).toEqual({
      day: "Captura una fecha válida.",
      count: "Captura un número entero válido.",
    });
  });

  it("keeps the A/B distinct-list rule outside the generic form component", () => {
    const selects = [
      parameter({ name: "price_list_a_id", data_type: "integer", input_type: "select", required: true }),
      parameter({ name: "price_list_b_id", data_type: "integer", input_type: "select", required: true }),
    ];
    expect(validateRuntimeParameters("PRICE_LIST_COMPARISON", selects, {
      price_list_a_id: "7", price_list_b_id: "7",
    })).toMatchObject({ valid: false, formError: "Selecciona dos listas distintas." });
  });
});

describe("repeatable report runtime parameters", () => {
  const scalar = parameter({
    name: "price_list_id", label: "Lista de precios", data_type: "integer", input_type: "select", required: true,
    configuration_json: { options_source: "price_lists" },
  });
  const group: ReportParameterGroup = {
    name: "items", label: "Productos", resolver_key: "products_by_price_list", context_parameter: "price_list_id",
    min_items: 1, max_items: 2, display_order: 0,
    fields: [
      { name: "product_id", label: "Producto", data_type: "integer", input_type: "select", required: true, default_value: null, display_order: 0, configuration_json: { options_source: "products_by_price_list", context_parameter: "price_list_id" } },
      { name: "quantity", label: "Cantidad", data_type: "integer", input_type: "number", required: true, default_value: 1, display_order: 1, configuration_json: { minimum: "0", exclusive_minimum: true } },
      { name: "discount", label: "Descuento", data_type: "decimal", input_type: "number", required: false, default_value: "0", display_order: 2, configuration_json: { minimum: "0", maximum: "100" } },
    ],
  };

  it("initializes the required rows and serializes items in stable order", () => {
    const groups = initialRuntimeGroupValues([group]);
    expect(groups.items).toHaveLength(1);
    expect(groups.items[0].values).toEqual({ product_id: "", quantity: "1", discount: "0" });
    groups.items[0].values.product_id = "101";
    groups.items.push({ id: "second", values: { product_id: "202", quantity: "5", discount: "12.50" } });
    const result = validateRuntimeForm("COTIZACION", [scalar], [group], { price_list_id: "7" }, groups);
    expect(result.valid).toBe(true);
    expect(result.parameters).toEqual({
      price_list_id: 7,
      items: [
        { product_id: 101, quantity: 1, discount: "0" },
        { product_id: 202, quantity: 5, discount: "12.50" },
      ],
    });
  });

  it("reports empty groups and row-level numeric constraints", () => {
    const empty = validateRuntimeForm("COTIZACION", [scalar], [group], { price_list_id: "7" }, { items: [] });
    expect(empty.groupErrors.items).toContain("al menos 1");
    const invalid = validateRuntimeForm("COTIZACION", [scalar], [group], { price_list_id: "7" }, {
      items: [{ id: "bad", values: { product_id: "101", quantity: "0", discount: "101" } }],
    });
    expect(invalid.rowErrors.items[0]).toEqual({
      quantity: "Debe ser mayor que 0.",
      discount: "Debe ser menor o igual que 100.",
    });
  });

  it("finds the field the product search resolves and prices a line locally", () => {
    expect(productSearchField(group)?.name).toBe("product_id");
    expect(productSearchField({ ...group, fields: group.fields.slice(1) })).toBeNull();
    expect(estimateLineTotal("574.13", "4", "5")).toBe("2181.69");
    expect(estimateLineTotal("574.13", "1", "")).toBe("574.13");
    expect(estimateLineTotal("574.13", "", "5")).toBeNull();
    expect(estimateLineTotal(null, "4", "0")).toBeNull();
    expect(estimateLineTotal("574.13", "4", "150")).toBeNull();
  });

  it("maps structured backend validation errors to their row and field", () => {
    expect(backendRowErrors([{ loc: ["items", 1, "product_id"], msg: "no pertenece a la lista" }], [group])).toEqual({
      items: { 1: { product_id: "no pertenece a la lista" } },
    });
  });
});
