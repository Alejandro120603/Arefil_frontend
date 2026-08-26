import { describe, expect, it } from "vitest";
import {
  initialRuntimeValues,
  orderedReportParameters,
  validateRuntimeParameters,
} from "./report-runtime";
import type { ReportParameter } from "@/types/api";

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
