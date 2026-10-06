import { describe, expect, it } from "vitest";
import {
  allowedFormulaReferences,
  applyFieldSource,
  applyGroupParameterSource,
  applyParameterSource,
  builderFormFromDefinition,
  emptyExcelLayout,
  formatsForDataType,
  formulaReferences,
  groupFieldCatalog,
  groupParameterReferences,
  moveColumn,
  newFieldColumn,
  newFormulaColumn,
  newGroupParameterColumn,
  newParameterColumn,
  pruneTotals,
  removeColumn,
  suggestedKeyFromField,
  summableColumns,
  newFormulaSummary,
  newSumSummary,
  normalizeSummaries,
  toBuilderRequest,
  validateBuilderForm,
  withDisplayOrder,
  type ReportBuilderFormValue,
} from "./report-builder";
import type {
  ReportBuilderDefinition,
  ReportColumn,
  ReportFieldDescriptor,
  ReportParameter,
  ReportParameterGroup,
  ReportSummaryConfiguration,
} from "@/types/api";

const FIELDS: ReportFieldDescriptor[] = [
  { key: "product.part_number", label: "Número de parte", data_type: "string", group: "Producto", required_context: "product" },
  { key: "product.description", label: "Descripción", data_type: "string", group: "Producto", required_context: "product" },
  { key: "price_list.currency", label: "Moneda", data_type: "string", group: "Lista de precios", required_context: "price_list" },
  { key: "price_list_item.unit_price", label: "Precio unitario", data_type: "decimal", group: "Item de lista", required_context: "price_list_item" },
];

const QUANTITY: ReportParameter = {
  name: "quantity", label: "Cantidad", data_type: "integer", input_type: "number",
  required: true, default_value: null, display_order: 0, configuration_json: null,
};

const DISCOUNT: ReportParameter = {
  name: "discount", label: "Descuento", data_type: "decimal", input_type: "number",
  required: false, default_value: null, display_order: 1, configuration_json: null,
};

const ITEMS_GROUP: ReportParameterGroup = {
  name: "items", label: "Productos", resolver_key: "products_by_price_list", context_parameter: "quantity",
  min_items: 1, max_items: 10, display_order: 0,
  fields: [
    { name: "product_id", label: "Producto", data_type: "integer", input_type: "select", required: true, default_value: null, display_order: 0, configuration_json: { options_source: "products_by_price_list", context_parameter: "quantity" } },
    { name: "line_quantity", label: "Cantidad", data_type: "integer", input_type: "number", required: true, default_value: 1, display_order: 1, configuration_json: { minimum: "0", exclusive_minimum: true } },
  ],
};

function column(overrides: Partial<ReportColumn>): ReportColumn {
  return {
    key: "col", label: "Columna", column_type: "FIELD",
    source_field: "product.part_number", source_parameter: null, formula_definition: null,
    data_type: "string", format_type: "text", display_order: 0, visible: true, width: null,
    ...overrides,
  };
}

/** The Cotización shell from the acceptance case, as configured in the UI. */
function quotationForm(): ReportBuilderFormValue {
  const columns: ReportColumn[] = [
    column({ key: "part_number", label: "SKU", source_field: "product.part_number" }),
    column({ key: "description", label: "Descripción", source_field: "product.description" }),
    { ...column({}), key: "quantity", label: "Cantidad", column_type: "PARAMETER", source_field: null, source_parameter: "quantity", data_type: "integer", format_type: "number" },
    { ...column({}), key: "price", label: "Precio", source_field: "price_list_item.unit_price", data_type: "decimal", format_type: "currency" },
    { ...column({}), key: "subtotal", label: "Subtotal", column_type: "FORMULA", source_field: null, formula_definition: "price * quantity", data_type: "decimal", format_type: "currency" },
    { ...column({}), key: "tax", label: "IVA", column_type: "FORMULA", source_field: null, formula_definition: "subtotal * 0.16", data_type: "decimal", format_type: "currency" },
    { ...column({}), key: "total", label: "Total", column_type: "FORMULA", source_field: null, formula_definition: "subtotal + tax", data_type: "decimal", format_type: "currency" },
  ];
  return { columns: withDisplayOrder(columns), parameterGroups: [], layout: emptyExcelLayout() };
}

describe("field catalog", () => {
  it("groups fields for display while preserving backend order", () => {
    expect(groupFieldCatalog(FIELDS).map((group) => group.group)).toEqual([
      "Producto", "Lista de precios", "Item de lista",
    ]);
    expect(groupFieldCatalog(FIELDS)[0].fields).toHaveLength(2);
  });

  it("suggests a readable internal key from a technical field key", () => {
    expect(suggestedKeyFromField("price_list_item.unit_price")).toBe("unit_price");
    expect(suggestedKeyFromField("part_number")).toBe("part_number");
  });
});

describe("column construction", () => {
  it("binds a FIELD column to a catalog descriptor and its data type", () => {
    const created = newFieldColumn(FIELDS[3], []);
    expect(created).toMatchObject({
      column_type: "FIELD", source_field: "price_list_item.unit_price",
      source_parameter: null, formula_definition: null, data_type: "decimal", visible: true,
    });
  });

  it("de-duplicates internal keys when the same field is added twice", () => {
    const first = newFieldColumn(FIELDS[0], []);
    const second = newFieldColumn(FIELDS[0], [first]);
    expect(second.key).toBe("part_number_2");
  });

  it("names a PARAMETER column after its parameter and copies its type", () => {
    expect(newParameterColumn(QUANTITY, [])).toMatchObject({
      key: "quantity", column_type: "PARAMETER", source_parameter: "quantity",
      source_field: null, data_type: "integer",
    });
  });

  it("binds repeatable fields through dotted backend paths while keeping a valid column key", () => {
    const reference = groupParameterReferences([ITEMS_GROUP]).find((item) => item.source === "items.line_quantity")!;
    expect(newGroupParameterColumn(reference, [])).toMatchObject({
      key: "line_quantity", column_type: "PARAMETER", source_parameter: "items.line_quantity", data_type: "integer",
    });
  });

  it("always declares a FORMULA column as decimal", () => {
    expect(newFormulaColumn([])).toMatchObject({
      column_type: "FORMULA", data_type: "decimal", source_field: null, source_parameter: null,
    });
  });

  it("never generates a key that collides with a report parameter", () => {
    const field = { ...FIELDS[0], key: "line.quantity", data_type: "integer" as const };
    expect(newFieldColumn(field, [], ["quantity"]).key).toBe("quantity_2");
    expect(newFormulaColumn([], ["Calculo"]).key).toBe("calculo_2");
    const reference = groupParameterReferences([ITEMS_GROUP])[1];
    expect(newGroupParameterColumn(reference, [], ["line_quantity"]).key).toBe("line_quantity_2");
  });

  it("de-duplicates generated keys across every kind of column", () => {
    const first = newFormulaColumn([]);
    const second = newFormulaColumn([first]);
    const third = newFormulaColumn([first, second]);
    expect([first.key, second.key, third.key]).toEqual(["calculo", "calculo_2", "calculo_3"]);
  });
});

describe("column sources", () => {
  it("re-points a FIELD column and re-syncs its type while keeping its key", () => {
    const saved = column({ key: "sku", label: "SKU", source_field: "product.part_number", format_type: "text" });
    expect(applyFieldSource(saved, FIELDS[3])).toMatchObject({
      key: "sku", label: "SKU", column_type: "FIELD", source_field: "price_list_item.unit_price",
      source_parameter: null, formula_definition: null, data_type: "decimal", format_type: "text",
    });
  });

  it("keys a scalar PARAMETER column by the parameter's name, as the backend requires", () => {
    const saved = newParameterColumn(QUANTITY, []);
    expect(applyParameterSource(saved, DISCOUNT)).toMatchObject({
      key: "discount", source_parameter: "discount", data_type: "decimal",
    });
  });

  it("keeps the key of a repeatable column when it reads another subfield", () => {
    const [product, lineQuantity] = groupParameterReferences([ITEMS_GROUP]);
    const saved = { ...newGroupParameterColumn(lineQuantity, []), key: "qty" };
    expect(applyGroupParameterSource(saved, product, [saved], ["quantity"])).toMatchObject({
      key: "qty", source_parameter: "items.product_id",
    });
  });

  it("releases a scalar parameter's name when the column moves to a repeatable subfield", () => {
    const scalar = newParameterColumn(QUANTITY, []);
    const lineQuantity = groupParameterReferences([ITEMS_GROUP])[1];
    expect(applyGroupParameterSource(scalar, lineQuantity, [scalar], ["quantity"])).toMatchObject({
      key: "line_quantity", source_parameter: "items.line_quantity",
    });
  });

  it("names repeatable subfields with human labels only", () => {
    expect(groupParameterReferences([ITEMS_GROUP]).map((item) => item.label)).toEqual([
      "Productos → Producto", "Productos → Cantidad",
    ]);
  });
});

describe("column list mutation", () => {
  const columns = withDisplayOrder([
    column({ key: "a" }), column({ key: "b" }), column({ key: "c" }),
  ]);

  it("reorders and rewrites display_order", () => {
    const moved = moveColumn(columns, 2, -1);
    expect(moved.map((item) => item.key)).toEqual(["a", "c", "b"]);
    expect(moved.map((item) => item.display_order)).toEqual([0, 1, 2]);
  });

  it("refuses to move past either end", () => {
    expect(moveColumn(columns, 0, -1)).toBe(columns);
    expect(moveColumn(columns, 2, 1)).toBe(columns);
  });

  it("removes a column and closes the display_order gap", () => {
    const remaining = removeColumn(columns, 1);
    expect(remaining.map((item) => item.key)).toEqual(["a", "c"]);
    expect(remaining.map((item) => item.display_order)).toEqual([0, 1]);
  });

  it("drops a SUM summary whose column no longer qualifies", () => {
    const numeric = withDisplayOrder([column({ key: "total", data_type: "decimal", format_type: "currency" })]);
    const layout = { ...emptyExcelLayout(), totals: [newSumSummary(numeric[0], [])] };
    expect(layout.totals[0]).toMatchObject({ key: "total", column_key: "total", operation: "SUM" });
    expect(pruneTotals(layout, []).totals).toEqual([]);
    expect(pruneTotals(layout, numeric).totals).toHaveLength(1);
    const hidden = numeric.map((item) => ({ ...item, visible: false }));
    expect(pruneTotals(layout, hidden).totals).toEqual([]);
  });

  it("keeps a FORMULA summary when the columns change", () => {
    const layout = { ...emptyExcelLayout(), totals: [newFormulaSummary([])] };
    expect(pruneTotals(layout, []).totals).toHaveLength(1);
  });

  it("offers SUM only on visible numeric columns", () => {
    const candidates = summableColumns([
      column({ key: "sku" }),
      column({ key: "price", data_type: "decimal" }),
      column({ key: "hidden", data_type: "decimal", visible: false }),
    ]);
    expect(candidates.map((item) => item.key)).toEqual(["price"]);
  });
});

describe("formats", () => {
  it("mirrors the backend's data-type/format pairing rules", () => {
    expect(formatsForDataType("decimal")).toEqual(["text", "number", "currency", "percent"]);
    expect(formatsForDataType("date")).toEqual(["text", "date"]);
    expect(formatsForDataType("string")).toEqual(["text"]);
  });
});

describe("formula references", () => {
  it("extracts identifiers but not function calls", () => {
    expect(formulaReferences("ROUND(price * quantity, 2) + tax")).toEqual(["price", "quantity", "tax"]);
  });

  it("offers only numeric columns and parameters, never the column itself", () => {
    const references = allowedFormulaReferences(
      [column({ key: "sku" }), column({ key: "price", data_type: "decimal" }), column({ key: "subtotal", data_type: "decimal" })],
      [QUANTITY],
      "subtotal",
    );
    expect(references.map((item) => item.name)).toEqual(["price", "quantity"]);
    expect(references.find((item) => item.name === "quantity")?.origin).toBe("parameter");
  });
});

describe("builder validation", () => {
  it("accepts the Cotización shell", () => {
    expect(validateBuilderForm(quotationForm(), [QUANTITY, DISCOUNT], FIELDS)).toEqual([]);
  });

  it("accepts a valid repeatable group and its dotted parameter column", () => {
    const reference = groupParameterReferences([ITEMS_GROUP])[1];
    const value: ReportBuilderFormValue = {
      columns: [newGroupParameterColumn(reference, [])], parameterGroups: [ITEMS_GROUP], layout: emptyExcelLayout(),
    };
    expect(validateBuilderForm(value, [QUANTITY], FIELDS)).toEqual([]);
    expect(toBuilderRequest(value).parameter_groups[0].fields[1].name).toBe("line_quantity");
  });

  it("explains repeatable-row problems by visible name, never by internal identifier", () => {
    const broken: ReportParameterGroup = {
      ...ITEMS_GROUP,
      context_parameter: "missing",
      fields: [
        { ...ITEMS_GROUP.fields[0], configuration_json: { options_source: "products_by_price_list", context_parameter: "missing" } },
        { ...ITEMS_GROUP.fields[1], label: "", configuration_json: { minimum: "0.5" } },
      ],
    };
    const errors = validateBuilderForm(
      { columns: [column({})], parameterGroups: [broken], layout: emptyExcelLayout() }, [QUANTITY], FIELDS,
    );
    expect(errors).toEqual(expect.arrayContaining([
      "Para usar productos por renglón, la fuente necesita una lista de precios.",
      "El dato 2 de cada renglón requiere un nombre visible.",
      "Los límites de 'dato 2' deben ser enteros, o permite decimales.",
    ]));
    expect(errors.join(" ")).not.toMatch(/line_quantity|items|nombre interno|subcampo|select/);
  });

  it("requires at least one column", () => {
    const errors = validateBuilderForm({ columns: [], parameterGroups: [], layout: emptyExcelLayout() }, [], FIELDS);
    expect(errors).toContain("Agrega al menos una columna al reporte.");
  });

  it("rejects an invalid internal key and a duplicate", () => {
    const value: ReportBuilderFormValue = {
      columns: withDisplayOrder([column({ key: "1bad" }), column({ key: "dup" }), column({ key: "DUP" })]),
      parameterGroups: [], layout: emptyExcelLayout(),
    };
    const errors = validateBuilderForm(value, [], FIELDS);
    expect(errors.some((error) => error.includes("nombre interno"))).toBe(true);
    expect(errors).toContain("La columna 'DUP' está duplicada.");
  });

  it("rejects a source field outside the catalog", () => {
    const value: ReportBuilderFormValue = {
      columns: [column({ key: "made_up", source_field: "products.part_number" })],
      parameterGroups: [], layout: emptyExcelLayout(),
    };
    expect(validateBuilderForm(value, [], FIELDS)).toContain(
      "El campo 'products.part_number' no pertenece al catálogo permitido.",
    );
  });

  it("rejects a parameter column pointing at a parameter the report does not declare", () => {
    const value: ReportBuilderFormValue = {
      columns: [column({ key: "ghost", column_type: "PARAMETER", source_field: null, source_parameter: "ghost" })],
      parameterGroups: [], layout: emptyExcelLayout(),
    };
    expect(validateBuilderForm(value, [QUANTITY], FIELDS)).toContain(
      "El parámetro 'ghost' no existe en el reporte.",
    );
  });

  it("rejects a formula referencing something that does not exist", () => {
    const value: ReportBuilderFormValue = {
      columns: withDisplayOrder([
        { ...column({}), key: "subtotal", column_type: "FORMULA", source_field: null, formula_definition: "price * quantity", data_type: "decimal", format_type: "number" },
      ]),
      parameterGroups: [], layout: emptyExcelLayout(),
    };
    const errors = validateBuilderForm(value, [], FIELDS);
    expect(errors).toContain("La fórmula de 'subtotal' referencia 'price', que no existe.");
    expect(errors).toContain("La fórmula de 'subtotal' referencia 'quantity', que no existe.");
  });

  it("rejects a formula referencing a non-numeric column", () => {
    const value: ReportBuilderFormValue = {
      columns: withDisplayOrder([
        column({ key: "sku" }),
        { ...column({}), key: "calc", column_type: "FORMULA", source_field: null, formula_definition: "sku * 2", data_type: "decimal", format_type: "number" },
      ]),
      parameterGroups: [], layout: emptyExcelLayout(),
    };
    expect(validateBuilderForm(value, [], FIELDS)).toContain(
      "La fórmula de 'calc' referencia 'sku', que no es numérico.",
    );
  });

  it("rejects a self-referencing formula", () => {
    const value: ReportBuilderFormValue = {
      columns: withDisplayOrder([
        { ...column({}), key: "loop", column_type: "FORMULA", source_field: null, formula_definition: "loop + 1", data_type: "decimal", format_type: "number" },
      ]),
      parameterGroups: [], layout: emptyExcelLayout(),
    };
    expect(validateBuilderForm(value, [], FIELDS)).toContain(
      "La fórmula de 'loop' no puede referenciarse a sí misma.",
    );
  });

  it("rejects an incompatible format and an out-of-range width", () => {
    const value: ReportBuilderFormValue = {
      columns: [column({ key: "sku", format_type: "currency", width: 900 })],
      parameterGroups: [], layout: emptyExcelLayout(),
    };
    const errors = validateBuilderForm(value, [], FIELDS);
    expect(errors.some((error) => error.includes("no es compatible con el tipo"))).toBe(true);
    expect(errors.some((error) => error.includes("ancho"))).toBe(true);
  });

  it("rejects a column key that collides with a parameter", () => {
    const value: ReportBuilderFormValue = {
      columns: [column({ key: "quantity" })],
      parameterGroups: [], layout: emptyExcelLayout(),
    };
    expect(validateBuilderForm(value, [QUANTITY], FIELDS)).toContain(
      "La columna 'quantity' entra en conflicto con un parámetro del reporte.",
    );
  });

  it("rejects an illegal sheet name and header row", () => {
    const value: ReportBuilderFormValue = {
      columns: [column({ key: "sku" })],
      parameterGroups: [], layout: { ...emptyExcelLayout(), sheet_name: "Datos/2026", header_row: 0 },
    };
    const errors = validateBuilderForm(value, [], FIELDS);
    expect(errors.some((error) => error.includes("caracteres no permitidos"))).toBe(true);
    expect(errors.some((error) => error.includes("fila de encabezado"))).toBe(true);
  });

  it("rejects a total on a hidden column", () => {
    const value: ReportBuilderFormValue = {
      columns: [column({ key: "total", data_type: "decimal", format_type: "number", visible: false })],
      parameterGroups: [],
      layout: {
        ...emptyExcelLayout(),
        totals: [{ key: "subtotal", label: "Subtotal", column_key: "total", operation: "SUM", formula_definition: null, format_type: "currency" }],
      },
    };
    expect(validateBuilderForm(value, [], FIELDS)).toContain(
      "SUM solo puede aplicarse a una columna visible ('total').",
    );
  });
});

describe("summaries", () => {
  const lineTotal = column({
    key: "line_total", column_type: "FORMULA", source_field: null,
    formula_definition: "tax_rate * 2", data_type: "decimal", format_type: "currency",
  });
  const TAX_RATE: ReportParameter = {
    name: "tax_rate", label: "IVA %", data_type: "decimal", input_type: "number",
    required: true, default_value: null, display_order: 1, configuration_json: null,
  };

  function quotationSummaries(): ReportSummaryConfiguration[] {
    return [
      { key: "subtotal", label: "Subtotal", column_key: "line_total", operation: "SUM" as const, formula_definition: null, format_type: "currency" as const },
      { key: "tax", label: "IVA", column_key: null, operation: "FORMULA" as const, formula_definition: "subtotal * tax_rate / 100", format_type: "currency" as const },
      { key: "grand_total", label: "Total", column_key: null, operation: "FORMULA" as const, formula_definition: "subtotal + tax", format_type: "currency" as const },
    ];
  }

  it("accepts subtotal, IVA and total for a quotation", () => {
    const value: ReportBuilderFormValue = {
      columns: [lineTotal], parameterGroups: [],
      layout: { ...emptyExcelLayout(), totals: quotationSummaries() },
    };
    expect(validateBuilderForm(value, [TAX_RATE], FIELDS)).toEqual([]);
  });

  it("rejects an unknown or non-numeric reference in a summary formula", () => {
    const totals = quotationSummaries();
    totals[1] = { ...totals[1], formula_definition: "subtotal * missing" };
    const value: ReportBuilderFormValue = {
      columns: [lineTotal], parameterGroups: [],
      layout: { ...emptyExcelLayout(), totals },
    };
    expect(validateBuilderForm(value, [TAX_RATE], FIELDS)).toContain(
      "El resumen 'tax' referencia 'missing', que no existe.",
    );
  });

  it("rejects duplicated keys, missing labels and parameter collisions", () => {
    const value: ReportBuilderFormValue = {
      columns: [lineTotal], parameterGroups: [],
      layout: {
        ...emptyExcelLayout(),
        totals: [
          { key: "tax_rate", label: "", column_key: "line_total", operation: "SUM", formula_definition: null, format_type: null },
          { key: "tax_rate", label: "IVA", column_key: "line_total", operation: "SUM", formula_definition: null, format_type: null },
        ],
      },
    };
    const errors = validateBuilderForm(value, [TAX_RATE], FIELDS);
    expect(errors).toContain("El resumen 'tax_rate' está duplicado.");
    expect(errors).toContain("El resumen 'tax_rate' requiere una etiqueta.");
    expect(errors).toContain("El resumen 'tax_rate' entra en conflicto con un parámetro del reporte.");
  });

  it("detects a cycle between two summary formulas", () => {
    const value: ReportBuilderFormValue = {
      columns: [lineTotal], parameterGroups: [],
      layout: {
        ...emptyExcelLayout(),
        totals: [
          { key: "a", label: "A", column_key: null, operation: "FORMULA", formula_definition: "b + 1", format_type: null },
          { key: "b", label: "B", column_key: null, operation: "FORMULA", formula_definition: "a + 1", format_type: null },
        ],
      },
    };
    expect(validateBuilderForm(value, [], FIELDS)).toContain(
      "Los resúmenes contienen una dependencia cíclica.",
    );
  });

  it("upgrades a legacy totals row into a labelled summary", () => {
    expect(normalizeSummaries([{ column_key: "line_total", operation: "SUM" }], [lineTotal])).toEqual([{
      key: "line_total", label: lineTotal.label, column_key: "line_total",
      operation: "SUM", formula_definition: null, format_type: "currency",
    }]);
  });

  it("generates unique summary keys that never collide with a parameter", () => {
    const sum = newSumSummary({ ...lineTotal, key: "quantity" }, [], ["quantity"]);
    expect(sum).toMatchObject({ key: "quantity_2", column_key: "quantity", operation: "SUM", formula_definition: null });
    const first = newFormulaSummary([sum]);
    const second = newFormulaSummary([sum, first]);
    expect([first.key, second.key]).toEqual(["resumen", "resumen_2"]);
    expect(first).toMatchObject({ operation: "FORMULA", column_key: null });
  });
});

describe("serialization", () => {
  it("loads an existing builder in display order", () => {
    const builder: ReportBuilderDefinition = {
      report: {
        code: "COTIZACION", name: "Cotización", description: null, category: null, filename_template: null, enabled: true,
        data_source_id: 5,
        data_source: { id: 5, code: "QUOTATION_ROWS", name: "Renglones de cotización", description: null, enabled: true, capabilities: ["REPEATABLE_ROWS"] },
        parameters: [QUANTITY],
        created_at: "2026-08-26T00:00:00Z", updated_at: "2026-08-26T00:00:00Z",
        parameter_groups: [],
      },
      columns: [column({ key: "b", display_order: 5 }), column({ key: "a", display_order: 1 })],
      parameter_groups: [],
      excel_layout: { ...emptyExcelLayout(), sheet_name: "Cotización", totals: [] },
    };
    const value = builderFormFromDefinition(builder);
    expect(value.columns.map((item) => item.key)).toEqual(["a", "b"]);
    expect(value.layout.sheet_name).toBe("Cotización");
  });

  it("falls back to a default layout when the report has no builder yet", () => {
    const value = builderFormFromDefinition({
      report: {
        code: "NEW", name: "Nuevo", description: null, category: null, filename_template: null, enabled: false,
        data_source_id: 1,
        data_source: { id: 1, code: "PRODUCT_CATALOG", name: "Catálogo de productos", description: null, enabled: true, capabilities: [] },
        parameters: [],
        created_at: "2026-08-26T00:00:00Z", updated_at: "2026-08-26T00:00:00Z",
        parameter_groups: [],
      },
      columns: [],
      parameter_groups: [],
      excel_layout: null,
    });
    expect(value.layout).toEqual(emptyExcelLayout());
  });

  it("normalizes the request the backend receives", () => {
    const value: ReportBuilderFormValue = {
      columns: [
        { ...column({}), key: " subtotal ", label: "  Subtotal  ", column_type: "FORMULA", source_field: "product.part_number", formula_definition: " price * 2 ", data_type: "decimal", format_type: "number", display_order: 9 },
      ],
      parameterGroups: [], layout: { ...emptyExcelLayout(), sheet_name: " Cotización ", title: "  " },
    };
    const request = toBuilderRequest(value);
    expect(request.columns[0]).toMatchObject({
      key: "subtotal", label: "Subtotal", formula_definition: "price * 2",
      source_field: null, source_parameter: null, display_order: 0,
    });
    expect(request.excel_layout).toMatchObject({ sheet_name: "Cotización", title: null });
  });

  it("sends only the half of each summary its operation allows", () => {
    const value: ReportBuilderFormValue = {
      columns: [column({ key: "line_total", data_type: "decimal", format_type: "currency" })],
      parameterGroups: [],
      layout: {
        ...emptyExcelLayout(),
        totals: [
          { key: " subtotal ", label: "  Subtotal ", column_key: "line_total", operation: "SUM", formula_definition: "ignored", format_type: "currency" },
          { key: "tax", label: "IVA", column_key: "line_total", operation: "FORMULA", formula_definition: " subtotal * 0.16 ", format_type: "currency" },
        ],
      },
    };
    const [subtotal, tax] = toBuilderRequest(value).excel_layout.totals;
    expect(subtotal).toEqual({
      key: "subtotal", label: "Subtotal", column_key: "line_total",
      operation: "SUM", formula_definition: null, format_type: "currency",
    });
    expect(tax).toEqual({
      key: "tax", label: "IVA", column_key: null,
      operation: "FORMULA", formula_definition: "subtotal * 0.16", format_type: "currency",
    });
  });

  it("round-trips a saved builder with every operational identifier intact", () => {
    const columns: ReportColumn[] = [
      column({ key: "price", label: "Precio", source_field: "price_list_item.unit_price", data_type: "decimal", format_type: "currency", display_order: 0 }),
      { ...column({}), key: "customer", label: "Cliente", column_type: "PARAMETER", source_field: null, source_parameter: "customer_name", data_type: "string", format_type: "text", display_order: 1 },
      { ...column({}), key: "subtotal", label: "Subtotal", column_type: "FORMULA", source_field: null, formula_definition: "price * 2", data_type: "decimal", format_type: "currency", display_order: 2 },
    ];
    const totals: ReportSummaryConfiguration[] = [
      { key: "sum_price", label: "Suma", column_key: "price", operation: "SUM", formula_definition: null, format_type: "currency" },
      { key: "tax", label: "IVA", column_key: null, operation: "FORMULA", formula_definition: "sum_price * 0.16", format_type: "currency" },
    ];
    const value = builderFormFromDefinition({
      report: {
        code: "LEGACY", name: "Legacy", description: null, category: null, filename_template: null, enabled: true,
        data_source_id: 1,
        data_source: { id: 1, code: "PRODUCT_CATALOG", name: "Catálogo", description: null, enabled: true, capabilities: [] },
        parameters: [], parameter_groups: [],
        created_at: "2026-08-26T00:00:00Z", updated_at: "2026-08-26T00:00:00Z",
      },
      columns, parameter_groups: [], excel_layout: { ...emptyExcelLayout(), totals },
    });

    // Only labels change — what the admin can now edit — and nothing else moves.
    const edited: ReportBuilderFormValue = {
      ...value,
      columns: value.columns.map((item) => ({ ...item, label: `${item.label} editado` })),
      layout: { ...value.layout, totals: value.layout.totals.map((total) => ({ ...total, label: `${total.label} editado` })) },
    };
    const request = toBuilderRequest(edited);
    expect(request.columns).toEqual(columns.map((item) => ({ ...item, label: `${item.label} editado` })));
    expect(request.excel_layout.totals).toEqual(totals.map((total) => ({ ...total, label: `${total.label} editado` })));
  });

  it("upgrades a saved legacy layout when the builder loads", () => {
    const value = builderFormFromDefinition({
      report: {
        code: "LEGACY", name: "Legacy", description: null, category: null, filename_template: null, enabled: true,
        data_source_id: 1,
        data_source: { id: 1, code: "PRODUCT_CATALOG", name: "Catálogo", description: null, enabled: true, capabilities: [] },
        parameters: [], parameter_groups: [],
        created_at: "2026-08-26T00:00:00Z", updated_at: "2026-08-26T00:00:00Z",
      },
      columns: [column({ key: "total", label: "Precio total", data_type: "decimal", format_type: "currency" })],
      parameter_groups: [],
      excel_layout: { ...emptyExcelLayout(), totals: [{ column_key: "total", operation: "SUM" }] },
    });
    expect(value.layout.totals).toEqual([{
      key: "total", label: "Precio total", column_key: "total",
      operation: "SUM", formula_definition: null, format_type: "currency",
    }]);
  });
});
