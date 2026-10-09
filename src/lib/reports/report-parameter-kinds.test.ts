import { describe, expect, it } from "vitest";
import {
  REPORT_PARAMETER_KINDS,
  parameterNameBase,
  parameterShapeOf,
  relabelParameter,
  uniqueParameterName,
  withParameterShape,
} from "./report-parameter-kinds";
import { REPORT_PARAMETER_PRESETS, emptyParameter } from "./report-form";
import type { ReportParameter } from "@/types/api";

function parameter(patch: Partial<ReportParameter>): ReportParameter {
  return { ...emptyParameter(0), name: "dato", label: "Dato", ...patch };
}

describe("parameter kinds", () => {
  it("round-trips every business kind through its technical triple", () => {
    for (const kind of REPORT_PARAMETER_KINDS) {
      const shaped = withParameterShape(parameter({ data_type: "boolean", input_type: "checkbox" }), kind.kind);
      expect(parameterShapeOf(shaped)).toEqual({ kind: kind.kind, decimals: false });
      expect(shaped.input_type === "select").toBe(kind.options_source != null);
      if (shaped.input_type === "select") expect(shaped.data_type).toBe("integer");
    }
    const decimal = withParameterShape(parameter({}), "number", true);
    expect(decimal).toEqual(expect.objectContaining({ data_type: "decimal", input_type: "number", configuration_json: null }));
    expect(parameterShapeOf(decimal)).toEqual({ kind: "number", decimals: true });
  });

  it("never reinterprets a combination it would not produce", () => {
    for (const legacy of [
      parameter({ data_type: "string", input_type: "select", configuration_json: { options_source: "products" } }),
      parameter({ data_type: "date", input_type: "select", configuration_json: { options_source: "price_lists" } }),
      parameter({ data_type: "boolean", input_type: "select", configuration_json: { options_source: "suppliers" } }),
      parameter({ data_type: "integer", input_type: "select", configuration_json: null }),
      parameter({
        data_type: "integer",
        input_type: "select",
        configuration_json: { options_source: "products", extra: true } as unknown as ReportParameter["configuration_json"],
      }),
      parameter({ data_type: "string", input_type: "text", configuration_json: { options_source: "products" } }),
    ]) {
      expect(parameterShapeOf(legacy)).toBeNull();
    }
    // An empty configuration object is what the backend normalizes to null.
    expect(parameterShapeOf(parameter({ configuration_json: {} as ReportParameter["configuration_json"] })))
      .toEqual({ kind: "text", decimals: false });
  });

  it("clears the default and any option source whenever the kind changes", () => {
    const product = parameter({
      data_type: "integer", input_type: "select", configuration_json: { options_source: "products" }, default_value: 9,
    });
    expect(withParameterShape(product, "text")).toEqual(expect.objectContaining({
      data_type: "string", input_type: "text", configuration_json: null, default_value: null,
    }));
    const unchanged = withParameterShape(product, "product");
    expect(unchanged).toBe(product);
  });

  it("keeps a default across the decimals toggle only while it stays valid", () => {
    const integer = parameter({ data_type: "integer", input_type: "number", default_value: "3" });
    const decimal = withParameterShape(integer, "number", true);
    expect(decimal.default_value).toBe("3");
    expect(withParameterShape({ ...decimal, default_value: "2.5" }, "number", false).default_value).toBeNull();
    expect(withParameterShape({ ...decimal, default_value: "4" }, "number", false).default_value).toBe("4");
  });

  it("builds the presets from the same mapping", () => {
    const byKey = Object.fromEntries(REPORT_PARAMETER_PRESETS.map((preset) => [preset.key, preset.parameter]));
    expect(Object.keys(byKey)).toEqual([
      "customer_name", "customer_email", "attention_to", "requisition", "quotation_date", "commercial_conditions", "tax_rate",
    ]);
    expect(byKey.customer_name).toEqual(expect.objectContaining({ data_type: "string", input_type: "text", configuration_json: null }));
    expect(byKey.quotation_date).toEqual(expect.objectContaining({ data_type: "date", input_type: "date" }));
    expect(byKey.tax_rate).toEqual(expect.objectContaining({ data_type: "decimal", input_type: "number" }));
  });
});

describe("internal names", () => {
  it("derives a valid identifier from any visible name", () => {
    expect(parameterNameBase("Cantidad")).toBe("cantidad");
    expect(parameterNameBase("Fecha de entrega")).toBe("fecha_de_entrega");
    expect(parameterNameBase("IVA %")).toBe("iva");
    expect(parameterNameBase("Año  fiscal")).toBe("ano_fiscal");
    expect(parameterNameBase("2do contacto")).toBe("dato_2do_contacto");
    expect(parameterNameBase("%%%")).toBe("dato");
    expect(parameterNameBase("x".repeat(200)).length).toBeLessThanOrEqual(60);
  });

  it("suffixes deterministically and case-insensitively", () => {
    expect(uniqueParameterName("cliente", ["CLIENTE", "cliente_2"])).toBe("cliente_3");
    expect(uniqueParameterName("cliente", ["otro"])).toBe("cliente");
  });

  it("lets only an unsaved, generated name follow its label", () => {
    const fresh = relabelParameter(parameter({ name: "", label: "" }), "Cliente", { locked: false, takenNames: ["cliente"] });
    expect(fresh.name).toBe("cliente_2");
    expect(relabelParameter(fresh, "Razón social", { locked: false, takenNames: [] }).name).toBe("razon_social");

    const saved = parameter({ name: "customer_name", label: "Cliente" });
    expect(relabelParameter(saved, "Razón social", { locked: true, takenNames: [] }))
      .toEqual({ ...saved, label: "Razón social" });
    // A preset is unsaved but keeps its well-known name.
    expect(relabelParameter(saved, "Razón social", { locked: false, takenNames: [] }).name).toBe("customer_name");
    // Once saved, even a generated name is frozen.
    const generated = parameter({ name: "cantidad", label: "Cantidad" });
    expect(relabelParameter(generated, "Piezas", { locked: true, takenNames: [] }).name).toBe("cantidad");
  });
});
