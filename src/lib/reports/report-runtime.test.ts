import { describe, expect, it } from "vitest";
import {
  backendRowErrors,
  changedRuntimeCells,
  createRuntimeGroupRow,
  LIST_PRODUCT,
  MANUAL_PRODUCT,
  parameterCurrency,
  REQUIRED_FIELD_MESSAGE,
  runtimeCellKey,
  visibleRuntimeErrors,
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

  it("finds the field the product search resolves", () => {
    expect(productSearchField(group)?.name).toBe("product_id");
    expect(productSearchField({ ...group, fields: group.fields.slice(1) })).toBeNull();
  });

  it("maps structured backend validation errors to their row and field", () => {
    expect(backendRowErrors([{ loc: ["items", 1, "product_id"], msg: "no pertenece a la lista" }], [group])).toEqual({
      items: { 1: { product_id: "no pertenece a la lista" } },
    });
  });
});

describe("visible runtime errors (D9)", () => {
  const validation = {
    valid: false,
    formError: null,
    parameters: {},
    groupErrors: {},
    fieldErrors: { price_list_id: REQUIRED_FIELD_MESSAGE, quantity: "Captura un número entero válido." },
    rowErrors: { items: { 0: { product_id: REQUIRED_FIELD_MESSAGE, discount: "Debe ser menor o igual que 100." } } },
  };
  const groupValues = { items: [{ id: "row-1", values: { product_id: "", discount: "150" } }] };
  const untouched = { fields: new Set<string>(), cells: new Set<string>(), attempted: false };

  it("hides only empty required fields the user has not touched", () => {
    expect(visibleRuntimeErrors(validation, groupValues, untouched)).toEqual({
      fieldErrors: { quantity: "Captura un número entero válido." },
      rowErrors: { items: { 0: { discount: "Debe ser menor o igual que 100." } } },
    });
  });

  it("shows a required error once its field or cell was touched", () => {
    const touched = {
      fields: new Set(["price_list_id"]),
      cells: new Set([runtimeCellKey("items", "row-1", "product_id")]),
      attempted: false,
    };
    expect(visibleRuntimeErrors(validation, groupValues, touched)).toEqual({
      fieldErrors: validation.fieldErrors,
      rowErrors: validation.rowErrors,
    });
  });

  it("shows everything after an attempt to generate", () => {
    expect(visibleRuntimeErrors(validation, groupValues, { ...untouched, attempted: true })).toEqual({
      fieldErrors: validation.fieldErrors,
      rowErrors: validation.rowErrors,
    });
  });

  it("reports the cells that changed, but not a newly added row", () => {
    const before = { items: [{ id: "a", values: { product_id: "", quantity: "1" } }] };
    const after = {
      items: [
        { id: "a", values: { product_id: "101", quantity: "1" } },
        { id: "b", values: { product_id: "", quantity: "1" } },
      ],
    };
    expect(changedRuntimeCells(before, after)).toEqual([runtimeCellKey("items", "a", "product_id")]);
  });
});

describe("quotation lines outside the price list (MANUAL_PRODUCT)", () => {
  const GROUP: ReportParameterGroup = {
    name: "items",
    label: "Productos",
    resolver_key: "products_by_price_list",
    context_parameter: "price_list_id",
    min_items: 1,
    max_items: null,
    display_order: 0,
    allow_manual_items: true,
    fields: [
      { name: "product_id", label: "Producto", data_type: "integer", input_type: "select", required: true, default_value: null, display_order: 0, configuration_json: { options_source: "products_by_price_list", context_parameter: "price_list_id" } },
      { name: "quantity", label: "Cantidad", data_type: "integer", input_type: "number", required: true, default_value: 1, display_order: 1, configuration_json: { minimum: 0, exclusive_minimum: true } },
      { name: "discount", label: "Descuento", data_type: "decimal", input_type: "number", required: true, default_value: "0", display_order: 2, configuration_json: { minimum: 0, maximum: 100 } },
    ],
  };
  const PARAMETERS: ReportParameter[] = [
    parameter({ name: "price_list_id", data_type: "integer", input_type: "select", required: true }),
  ];

  function validate(rows: ReturnType<typeof createRuntimeGroupRow>[], group = GROUP) {
    return validateRuntimeForm("COTIZACION_PRODUCTOS", PARAMETERS, [group], { price_list_id: "7" }, { items: rows });
  }

  function manualRow(values: Record<string, string>) {
    const row = createRuntimeGroupRow(GROUP, "m", MANUAL_PRODUCT);
    return { ...row, values: { ...row.values, ...values } };
  }

  it("creates list rows by default and manual rows with their own empty fields", () => {
    expect(createRuntimeGroupRow(GROUP, "a")).toEqual({
      id: "a", origin: LIST_PRODUCT, values: { product_id: "", quantity: "1", discount: "0" },
    });
    expect(createRuntimeGroupRow(GROUP, "b", MANUAL_PRODUCT)).toEqual({
      id: "b",
      origin: MANUAL_PRODUCT,
      values: { product_id: "", quantity: "1", discount: "0", part_number: "", description: "", unit_of_measure: "", unit_price: "" },
    });
    // A group without manual lines keeps the former row shape.
    expect(createRuntimeGroupRow({ ...GROUP, allow_manual_items: false }, "c", MANUAL_PRODUCT)).toEqual({
      id: "c", values: { product_id: "", quantity: "1", discount: "0" },
    });
  });

  it("serializes mixed rows in capture order with their origin, never a product for a manual line", () => {
    const list = { ...createRuntimeGroupRow(GROUP, "l"), values: { product_id: "101", quantity: "2", discount: "10" } };
    const manual = manualRow({ description: "  Servicio especial de fabricación ", unit_price: "800.00", quantity: "1", discount: "15", unit_of_measure: "SERV" });
    const result = validate([list, manual, { ...list, id: "l2", values: { product_id: "303", quantity: "3", discount: "5" } }]);
    expect(result.valid).toBe(true);
    expect(result.parameters.items).toEqual([
      { origin: LIST_PRODUCT, product_id: 101, quantity: 2, discount: "10" },
      { origin: MANUAL_PRODUCT, quantity: 1, discount: "15", description: "Servicio especial de fabricación", unit_of_measure: "SERV", unit_price: "800.00" },
      { origin: LIST_PRODUCT, product_id: 303, quantity: 3, discount: "5" },
    ]);
  });

  it("accepts a manual line without part number and requires its description and price", () => {
    expect(validate([manualRow({ description: "Tornillo", unit_price: "0" })]).valid).toBe(true);
    const missing = validate([manualRow({ description: "   ", unit_price: "" })]);
    expect(missing.valid).toBe(false);
    expect(missing.rowErrors.items[0]).toEqual({ description: REQUIRED_FIELD_MESSAGE, unit_price: REQUIRED_FIELD_MESSAGE });
  });

  it.each([["-1"], ["10.001"], ["abc"], ["1e3"], ["99999999999"]])("rejects the manual price %s", (price) => {
    const result = validate([manualRow({ description: "Tornillo", unit_price: price })]);
    expect(result.rowErrors.items[0].unit_price).toBeTruthy();
  });

  it("limits manual texts like the backend", () => {
    const result = validate([manualRow({ description: "a".repeat(501), part_number: "p".repeat(101), unit_of_measure: "u".repeat(31), unit_price: "1" })]);
    expect(result.rowErrors.items[0]).toEqual({
      description: "Máximo 500 caracteres.",
      part_number: "Máximo 100 caracteres.",
      unit_of_measure: "Máximo 30 caracteres.",
    });
    expect(validate([manualRow({ description: "uno\ndos", unit_price: "1" })]).rowErrors.items[0].description).toBe("No admite saltos de línea.");
  });

  it("validates quantity and discount of manual lines exactly like list lines", () => {
    const result = validate([manualRow({ description: "x", unit_price: "1", quantity: "0", discount: "100.5" })]);
    expect(Object.keys(result.rowErrors.items[0]).sort()).toEqual(["discount", "quantity"]);
    expect(validate([manualRow({ description: "x", unit_price: "1", discount: "100" })]).valid).toBe(true);
  });

  it("still requires the product of a list line", () => {
    const result = validate([createRuntimeGroupRow(GROUP, "l")]);
    expect(result.rowErrors.items[0]).toEqual({ product_id: REQUIRED_FIELD_MESSAGE });
  });

  it("sends no origin for groups without manual lines", () => {
    const group = { ...GROUP, allow_manual_items: undefined };
    const row = { ...createRuntimeGroupRow(group, "l"), values: { product_id: "5", quantity: "1", discount: "0" } };
    expect(validate([row], group).parameters.items).toEqual([{ product_id: 5, quantity: 1, discount: "0" }]);
  });
});

describe("parameterCurrency", () => {
  const PARAMETERS: ReportParameter[] = [
    parameter({ name: "price_list_id", data_type: "integer", input_type: "select", configuration_json: { options_source: "price_lists" } }),
  ];
  const OPTIONS = {
    price_list_id: [
      { value: 7, label: "MXN", currency: "MXN" },
      { value: 9, label: "USD", currency: "USD" },
      { value: 11, label: "sin moneda" },
    ],
  };

  it("is the currency of the exact list sent", () => {
    expect(parameterCurrency(PARAMETERS, { price_list_id: 7 }, OPTIONS)).toBe("MXN");
    expect(parameterCurrency(PARAMETERS, { price_list_id: 9 }, OPTIONS)).toBe("USD");
  });

  it("is unknown without a list, an option or its currency", () => {
    expect(parameterCurrency(PARAMETERS, {}, OPTIONS)).toBeNull();
    expect(parameterCurrency(PARAMETERS, { price_list_id: 11 }, OPTIONS)).toBeNull();
    expect(parameterCurrency(PARAMETERS, { price_list_id: 9 }, {})).toBeNull();
    expect(parameterCurrency([], { price_list_id: 9 }, OPTIONS)).toBeNull();
  });
});
