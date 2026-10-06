import { describe, expect, it } from "vitest";
import {
  contextOptions,
  groupFieldShapeOf,
  limitsSummary,
  newGroupField,
  newParameterGroup,
  priceListParameters,
  withGroupFieldShape,
} from "./report-group-fields";
import type { ReportParameter, ReportParameterGroupField } from "@/types/api";

const PRICE_LIST: ReportParameter = {
  name: "price_list_id", label: "Lista de precios", data_type: "integer", input_type: "select",
  required: true, default_value: null, display_order: 0, configuration_json: { options_source: "price_lists" },
};

const STORE: ReportParameter = {
  name: "store_id", label: "Sucursal", data_type: "integer", input_type: "number",
  required: false, default_value: null, display_order: 1, configuration_json: null,
};

function field(overrides: Partial<ReportParameterGroupField>): ReportParameterGroupField {
  return {
    name: "quantity", label: "Cantidad", data_type: "integer", input_type: "number",
    required: true, default_value: 1, display_order: 1, configuration_json: {},
    ...overrides,
  };
}

describe("group field shapes", () => {
  it("reads the product, text and number contracts back into business kinds", () => {
    expect(groupFieldShapeOf(field({
      name: "product_id", input_type: "select",
      configuration_json: { options_source: "products_by_price_list", context_parameter: "price_list_id" },
    }))).toEqual({ kind: "product", decimals: false });
    expect(groupFieldShapeOf(field({ data_type: "string", input_type: "text", configuration_json: null }))).toEqual({ kind: "text", decimals: false });
    expect(groupFieldShapeOf(field({ configuration_json: { minimum: 0, exclusive_minimum: true } }))).toEqual({ kind: "number", decimals: false });
    expect(groupFieldShapeOf(field({ data_type: "decimal" }))).toEqual({ kind: "number", decimals: true });
  });

  it("never reinterprets a combination the editor would not produce", () => {
    expect(groupFieldShapeOf(field({ data_type: "date", input_type: "date", configuration_json: null }))).toBeNull();
    expect(groupFieldShapeOf(field({ data_type: "string", input_type: "text", configuration_json: { minimum: 1 } }))).toBeNull();
  });

  it("rewrites the technical triple when the kind changes", () => {
    const text = withGroupFieldShape(field({ configuration_json: { minimum: 1 } }), "text");
    expect(text).toMatchObject({ data_type: "string", input_type: "text", configuration_json: null, default_value: null });
    expect(withGroupFieldShape(text, "number")).toMatchObject({ data_type: "integer", input_type: "number", configuration_json: {}, default_value: null });
  });

  it("keeps only integer defaults and limits when decimals are turned off", () => {
    const decimal = field({ data_type: "decimal", default_value: "2.5", configuration_json: { minimum: "0.5", maximum: 10, exclusive_minimum: true } });
    expect(withGroupFieldShape(decimal, "number", false)).toMatchObject({
      data_type: "integer", default_value: null, configuration_json: { maximum: 10, exclusive_minimum: true },
    });
    expect(withGroupFieldShape(field({ default_value: 3 }), "number", true)).toMatchObject({ data_type: "decimal", default_value: 3 });
  });

  it("generates valid, unique names for new subfields", () => {
    expect(newGroupField("quantity", 1, ["product_id"]).name).toBe("cantidad");
    expect(newGroupField("quantity", 2, ["product_id", "Cantidad"]).name).toBe("cantidad_2");
    expect(newGroupField("number", 1, []).name).toBe("numero");
    expect(newGroupField("text", 1, []).configuration_json).toBeNull();
  });
});

describe("group context", () => {
  it("only proposes integer price-list selects as the product filter", () => {
    expect(priceListParameters([PRICE_LIST, STORE]).map((parameter) => parameter.name)).toEqual(["price_list_id"]);
  });

  it("keeps a saved legacy context available next to the candidates", () => {
    expect(contextOptions([PRICE_LIST, STORE], "store_id").map((parameter) => parameter.name)).toEqual(["store_id", "price_list_id"]);
    expect(contextOptions([PRICE_LIST, STORE], "price_list_id").map((parameter) => parameter.name)).toEqual(["price_list_id"]);
  });

  it("starts a new group from the inferred price list", () => {
    expect(newParameterGroup([STORE, PRICE_LIST])).toMatchObject({ name: "productos", context_parameter: "price_list_id" });
    expect(newParameterGroup([])).toMatchObject({ context_parameter: "" });
  });
});

describe("limits summary", () => {
  it("describes the limits in words", () => {
    expect(limitsSummary({ minimum: 0, exclusive_minimum: true })).toBe("mayor que 0");
    expect(limitsSummary({ minimum: 1, maximum: 100 })).toBe("desde 1 · hasta 100");
    expect(limitsSummary({})).toBeNull();
  });
});
