import { describe, expect, it } from "vitest";
import {
  fallbackReportFilename,
  previewReportFilename,
  sampleParameterValues,
  sanitizeReportFilename,
  supportedFilenamePlaceholders,
  validateFilenameTemplate,
} from "./report-filename-template";
import type { ReportParameter } from "@/types/api";

function parameter(name: string, label: string, default_value: unknown = null): ReportParameter {
  return {
    name,
    label,
    data_type: "string",
    input_type: "text",
    required: false,
    default_value,
    display_order: 0,
    configuration_json: null,
  };
}

const PARAMETERS = [
  parameter("customer_name", "Cliente", "BONATTI FILTROS"),
  parameter("requisition", "Requisición", "LMR850205-048"),
];

describe("supportedFilenamePlaceholders", () => {
  it("offers the report's own parameters plus the two report keys, and nothing else", () => {
    expect(supportedFilenamePlaceholders(PARAMETERS).map((item) => item.token)).toEqual([
      "{{parameters.customer_name}}",
      "{{parameters.requisition}}",
      "{{report.code}}",
      "{{report.name}}",
    ]);
  });

  it("ignores a half-typed parameter name the backend could never accept", () => {
    expect(supportedFilenamePlaceholders([parameter("", "")]).map((item) => item.token))
      .toEqual(["{{report.code}}", "{{report.name}}"]);
  });
});

describe("validateFilenameTemplate", () => {
  it("accepts an empty configuration", () => {
    expect(validateFilenameTemplate("", [])).toEqual([]);
    expect(validateFilenameTemplate("   ", [])).toEqual([]);
  });

  it("accepts supported placeholders, with or without inner spaces", () => {
    expect(validateFilenameTemplate(
      "{{parameters.customer_name}} {{ report.code }} v2",
      ["customer_name"],
    )).toEqual([]);
  });

  it("rejects a namespace the backend does not expose", () => {
    expect(validateFilenameTemplate("{{execution.id}}", [])).toEqual([
      "Placeholder no permitido en el nombre de archivo: {{execution.id}}.",
    ]);
  });

  it("rejects an unsupported report key", () => {
    expect(validateFilenameTemplate("{{report.description}}", [])).toEqual([
      "Placeholder no permitido en el nombre de archivo: {{report.description}}.",
    ]);
  });

  it("rejects a parameter the report does not declare", () => {
    expect(validateFilenameTemplate("{{parameters.folio}}", ["customer_name"])).toEqual([
      "El parámetro 'folio' usado por el nombre de archivo no está definido.",
    ]);
  });

  it("rejects an unbalanced placeholder", () => {
    expect(validateFilenameTemplate("{{parameters.customer_name}", ["customer_name"])).toEqual([
      "El nombre de archivo contiene un placeholder incompleto o inválido.",
    ]);
  });

  it("rejects a pattern longer than the persisted column", () => {
    expect(validateFilenameTemplate("a".repeat(501), [])).toEqual([
      "El patrón del nombre de archivo no puede superar 500 caracteres.",
    ]);
  });
});

describe("sanitizeReportFilename", () => {
  it("mirrors the backend sanitizer: no paths, no unsafe characters", () => {
    expect(sanitizeReportFilename("../../etc/passwd.xlsx")).toBe("passwd.xlsx");
    expect(sanitizeReportFilename("BONATTI FILTROS LMR850205-048.xlsx"))
      .toBe("BONATTI_FILTROS_LMR850205-048.xlsx");
    expect(sanitizeReportFilename("...xlsx")).toBe("archivo.xlsx");
  });
});

describe("previewReportFilename", () => {
  const context = {
    code: "COTIZACION",
    name: "Cotización",
    parameters: { customer_name: "BONATTI FILTROS", requisition: "LMR850205-048" },
  };

  it("falls back to the generic name when no pattern is configured", () => {
    expect(previewReportFilename("", context)).toEqual({
      filename: "cotizacion-document.xlsx",
      missing: [],
    });
    expect(fallbackReportFilename("COTIZACION")).toBe("cotizacion-document.xlsx");
  });

  it("resolves parameters and report keys, adding the extension once", () => {
    expect(previewReportFilename("{{parameters.customer_name}} {{parameters.requisition}}", context).filename)
      .toBe("BONATTI_FILTROS_LMR850205-048.xlsx");
    expect(previewReportFilename("{{report.code}}.xlsx.xlsx", context).filename)
      .toBe("COTIZACION.xlsx");
  });

  it("withholds the preview instead of inventing missing data", () => {
    expect(previewReportFilename("{{parameters.customer_name}}-{{parameters.folio}}", context)).toEqual({
      filename: null,
      missing: ["{{parameters.folio}}"],
    });
  });
});

describe("sampleParameterValues", () => {
  it("takes only the defaults that exist", () => {
    expect(sampleParameterValues([...PARAMETERS, parameter("folio", "Folio")])).toEqual({
      customer_name: "BONATTI FILTROS",
      requisition: "LMR850205-048",
    });
  });
});
