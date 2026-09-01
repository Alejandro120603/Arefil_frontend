import { describe, expect, it } from "vitest";
import {
  excelTemplateIssueLocation,
  excelTemplatePlaceholders,
  excelTemplateStatus,
  excelTemplateValidationStatus,
  formatFileSize,
  isXlsxFile,
  parseExcelTemplateValidation,
} from "./report-excel-template";
import type {
  ReportColumn,
  ReportExcelTemplate,
  ReportExcelTemplateValidationResult,
  ReportParameter,
  ReportSummaryConfiguration,
} from "@/types/api";

const PARAMETERS: ReportParameter[] = [
  { name: "customer_name", label: "Cliente", data_type: "string", input_type: "text", required: true, default_value: null, display_order: 1, configuration_json: null },
  { name: "price_list_id", label: "Lista de precios", data_type: "integer", input_type: "select", required: true, default_value: null, display_order: 0, configuration_json: { options_source: "price_lists" } },
];

function column(overrides: Partial<ReportColumn> & Pick<ReportColumn, "key" | "label">): ReportColumn {
  return {
    column_type: "FIELD", source_field: "product.part_number", source_parameter: null, formula_definition: null,
    data_type: "string", format_type: "text", display_order: 0, visible: true, width: null,
    ...overrides,
  };
}

const COLUMNS: ReportColumn[] = [
  column({ key: "line_total", label: "Precio Total", data_type: "decimal", format_type: "currency", display_order: 2, column_type: "FORMULA", source_field: null, formula_definition: "quantity * unit_price" }),
  column({ key: "part_number", label: "No. Parte", display_order: 0 }),
  column({ key: "internal_cost", label: "Costo", data_type: "decimal", display_order: 1, visible: false }),
];

const SUMMARIES: ReportSummaryConfiguration[] = [
  { key: "subtotal", label: "Subtotal", column_key: "line_total", operation: "SUM", formula_definition: null, format_type: "currency" },
  { key: "tax", label: "IVA", column_key: null, operation: "FORMULA", formula_definition: "subtotal * tax_rate / 100", format_type: "currency" },
];

const TEMPLATE: ReportExcelTemplate = {
  report_code: "COTIZACION", original_filename: "BONATTI-COTIZACION.xlsx", size_bytes: 24_576,
  version: 2, checksum: "abc123", is_active: true,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
};

function file(name: string): File {
  return new File(["x"], name);
}

describe("report excel template contract", () => {
  it("lists every placeholder in reading order and hides invisible columns", () => {
    expect(excelTemplatePlaceholders(PARAMETERS, COLUMNS, SUMMARIES).map((field) => field.placeholder)).toEqual([
      "{{report.code}}", "{{report.name}}", "{{report.description}}", "{{report.category}}",
      "{{parameters.price_list_id}}", "{{parameters.customer_name}}",
      "{{rows.part_number}}", "{{rows.line_total}}",
      "{{summary.subtotal}}", "{{summary.tax}}",
    ]);
    expect(
      excelTemplatePlaceholders(PARAMETERS, COLUMNS, SUMMARIES)
        .find((field) => field.placeholder === "{{summary.tax}}"),
    ).toMatchObject({ label: "IVA", section: "Resúmenes", data_type: "decimal" });
  });

  it("derives the placeholders from the saved report, not from a fixed BONATTI list", () => {
    expect(excelTemplatePlaceholders([], [], []).map((field) => field.placeholder)).toEqual([
      "{{report.code}}", "{{report.name}}", "{{report.description}}", "{{report.category}}",
    ]);
  });

  it("reports the state the section header shows", () => {
    expect(excelTemplateStatus(null)).toBe("missing");
    expect(excelTemplateStatus(TEMPLATE)).toBe("configured");
  });

  it("accepts .xlsx files only, whatever the case of the extension", () => {
    expect(isXlsxFile(file("BONATTI.xlsx"))).toBe(true);
    expect(isXlsxFile(file("BONATTI.XLSX"))).toBe(true);
    expect(isXlsxFile(file("plantilla.pdf"))).toBe(false);
    expect(isXlsxFile(file("plantilla.xls"))).toBe(false);
  });

  it("formats the stored size the way the metadata block reads it", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(24_576)).toBe("24.0 KB");
    expect(formatFileSize(5_000_000)).toBe("4.8 MB");
    expect(formatFileSize(-1)).toBe("—");
  });
});

const VALID: ReportExcelTemplateValidationResult = {
  valid: true, placeholder_count: 14, repeatable_rows: 1, warnings: [], errors: [],
};

describe("excel template compatibility preflight", () => {
  it("reads the three states the card labels", () => {
    expect(excelTemplateValidationStatus(VALID)).toBe("valid");
    expect(excelTemplateValidationStatus({
      ...VALID,
      warnings: [{ code: "empty_sheet", message: "Hoja vacía.", sheet: "Hoja2", cell: null, placeholder: null, range: null }],
    })).toBe("warning");
    expect(excelTemplateValidationStatus({
      ...VALID,
      valid: false,
      errors: [{ code: "unknown_placeholder", message: "Placeholder desconocido.", sheet: "Cotización", cell: "B4", placeholder: "{{rows.foo}}", range: null }],
    })).toBe("invalid");
  });

  it("treats a result that carries errors as incompatible even if the flag disagrees", () => {
    expect(excelTemplateValidationStatus({
      ...VALID,
      errors: [{ code: "invalid_placeholder", message: "Inválido.", sheet: "Cotización", cell: "A1", placeholder: "{{ }}", range: null }],
    })).toBe("invalid");
  });

  it("locates an issue by cell, by merged range, or by sheet alone", () => {
    expect(excelTemplateIssueLocation({ code: "x", message: "m", sheet: "Cotización", cell: "B4", placeholder: null, range: null })).toBe("Cotización!B4");
    expect(excelTemplateIssueLocation({ code: "x", message: "m", sheet: "Cotización", cell: null, placeholder: null, range: "A8:C9" })).toBe("Cotización!A8:C9");
    expect(excelTemplateIssueLocation({ code: "x", message: "m", sheet: "Cotización", cell: null, placeholder: null, range: null })).toBe("Cotización");
  });

  it("parses the 422 detail the backend sends for a rejected template", () => {
    expect(parseExcelTemplateValidation({
      valid: false,
      placeholder_count: 3,
      repeatable_rows: 1,
      warnings: [],
      errors: [{
        code: "merge_crosses_repeatable_row",
        message: "La combinación A8:C9 atraviesa una fila repetible.",
        sheet: "Cotización",
        cell: null,
        placeholder: null,
        range: "A8:C9",
      }],
    })).toEqual({
      valid: false,
      placeholder_count: 3,
      repeatable_rows: 1,
      warnings: [],
      errors: [{
        code: "merge_crosses_repeatable_row",
        message: "La combinación A8:C9 atraviesa una fila repetible.",
        sheet: "Cotización",
        cell: null,
        placeholder: null,
        range: "A8:C9",
      }],
    });
  });

  it("fills the optional issue fields the backend omits", () => {
    expect(parseExcelTemplateValidation({
      valid: false, placeholder_count: 1, repeatable_rows: 0,
      errors: [{ code: "unknown_namespace", message: "Namespace desconocido.", sheet: "Hoja1" }],
    })?.errors).toEqual([
      { code: "unknown_namespace", message: "Namespace desconocido.", sheet: "Hoja1", cell: null, placeholder: null, range: null },
    ]);
  });

  it("refuses any payload that is not a validation result, so no half-parsed diagnostic renders", () => {
    expect(parseExcelTemplateValidation("El archivo no es un XLSX válido.")).toBeNull();
    expect(parseExcelTemplateValidation(null)).toBeNull();
    expect(parseExcelTemplateValidation([{ loc: ["body"], msg: "field required" }])).toBeNull();
    expect(parseExcelTemplateValidation({ valid: false })).toBeNull();
    expect(parseExcelTemplateValidation({ valid: false, placeholder_count: 1, repeatable_rows: 0, errors: ["boom"] })?.errors).toEqual([]);
  });
});
