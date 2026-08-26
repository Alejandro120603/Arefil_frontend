import { describe, expect, it } from "vitest";
import {
  coerceRuntimeValue,
  emptyParameter,
  emptyReportForm,
  handlerParameters,
  normalizeReportCode,
  toReportRequest,
  toReportUpdate,
  validateReportForm,
} from "./report-form";

describe("report definition form contract", () => {
  it("normalizes codes and creates SQL reports as disabled transactional payloads", () => {
    const value = {
      ...emptyReportForm(),
      code: "product-catalog",
      name: " Catálogo ",
      query_text: " SELECT id FROM products WHERE supplier_id = :supplier_id ",
      enabled: true,
      parameters: [{
        ...emptyParameter(4),
        name: "supplier_id",
        label: "Proveedor",
        data_type: "integer" as const,
        input_type: "select" as const,
        required: true,
        configuration_json: { options_source: "suppliers" as const },
      }],
    };

    expect(normalizeReportCode(value.code)).toBe("PRODUCT_CATALOG");
    expect(validateReportForm(value, true)).toEqual([]);
    expect(toReportRequest(value)).toMatchObject({
      code: "PRODUCT_CATALOG",
      name: "Catálogo",
      data_source_type: "SQL_QUERY",
      data_source_key: null,
      enabled: false,
      parameters: [{ name: "supplier_id", display_order: 0 }],
    });
  });

  it("locks the known handler contract and preserves enabled on update", () => {
    const value = {
      ...emptyReportForm(),
      code: "CUSTOM_COMPARISON",
      name: "Comparación",
      data_source_type: "HANDLER" as const,
      data_source_key: "price_list_comparison",
      enabled: false,
      parameters: handlerParameters(),
    };

    expect(validateReportForm(value, true)).toEqual([]);
    expect(toReportUpdate(value)).toMatchObject({
      data_source_key: "price_list_comparison",
      query_text: null,
      enabled: false,
      parameters: [
        { name: "price_list_a_id", configuration_json: { options_source: "price_lists" } },
        { name: "price_list_b_id", configuration_json: { options_source: "price_lists" } },
      ],
    });
  });

  it("rejects invalid, duplicate, and incompatible parameters before the request", () => {
    const first = { ...emptyParameter(0), name: "1bad", label: "" };
    const second = { ...emptyParameter(1), name: "1BAD", label: "Segundo", input_type: "select" as const };
    const errors = validateReportForm({
      ...emptyReportForm(), code: "BAD", name: "Reporte", query_text: "SELECT 1", parameters: [first, second],
    }, true);

    expect(errors.join(" ")).toContain("nombre del parámetro 1");
    expect(errors.join(" ")).toContain("duplicado");
    expect(errors.join(" ")).toContain("etiqueta");
    expect(errors.join(" ")).toContain("fuente de opciones");
  });

  it("coerces runtime values without converting decimals to floats", () => {
    expect(coerceRuntimeValue({ ...emptyParameter(0), data_type: "integer" }, "7")).toBe(7);
    expect(coerceRuntimeValue({ ...emptyParameter(0), data_type: "decimal" }, "10.25")).toBe("10.25");
    expect(coerceRuntimeValue({ ...emptyParameter(0), data_type: "boolean" }, true)).toBe(true);
    expect(coerceRuntimeValue(emptyParameter(0), "")).toBeUndefined();
  });
});
