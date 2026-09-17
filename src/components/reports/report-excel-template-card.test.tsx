// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportExcelTemplateCard } from "./report-excel-template-card";
import { ApiError } from "@/lib/api/errors";
import type {
  ReportBuilderDefinition,
  ReportExcelTemplate,
  ReportExcelTemplateUpload,
  ReportExcelTemplateValidationResult,
  ReportParameter,
} from "@/types/api";

const {
  getReportExcelTemplate, uploadReportExcelTemplate, downloadReportExcelTemplate,
  deleteReportExcelTemplate, getReportBuilder, triggerBrowserDownload,
} = vi.hoisted(() => ({
  getReportExcelTemplate: vi.fn(), uploadReportExcelTemplate: vi.fn(), downloadReportExcelTemplate: vi.fn(),
  deleteReportExcelTemplate: vi.fn(), getReportBuilder: vi.fn(), triggerBrowserDownload: vi.fn(),
}));
vi.mock("@/lib/api/reports", () => ({
  getReportExcelTemplate, uploadReportExcelTemplate, downloadReportExcelTemplate,
  deleteReportExcelTemplate, getReportBuilder,
}));
vi.mock("@/lib/download", () => ({ triggerBrowserDownload }));

const PARAMETERS: ReportParameter[] = [
  { name: "customer_name", label: "Cliente", data_type: "string", input_type: "text", required: true, default_value: null, display_order: 0, configuration_json: null },
];

const BUILDER = {
  report: {} as ReportBuilderDefinition["report"],
  columns: [{
    key: "line_total", label: "Precio Total", column_type: "FORMULA", source_field: null, source_parameter: null,
    formula_definition: "quantity * unit_price", data_type: "decimal", format_type: "currency",
    display_order: 0, visible: true, width: null,
  }],
  parameter_groups: [],
  excel_layout: {
    sheet_name: "Cotización", title: null, show_report_name: true, show_generated_at: true,
    show_parameters: true, freeze_header: true, header_row: 1,
    totals: [{ key: "subtotal", label: "Subtotal", column_key: "line_total", operation: "SUM", formula_definition: null, format_type: "currency" }],
  },
} as unknown as ReportBuilderDefinition;

const TEMPLATE: ReportExcelTemplate = {
  report_code: "COTIZACION", original_filename: "BONATTI-COTIZACION.xlsx", size_bytes: 24_576,
  version: 2, checksum: "abc123", is_active: true,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
};

const CLEAN_VALIDATION: ReportExcelTemplateValidationResult = {
  valid: true, placeholder_count: 14, repeatable_rows: 1, warnings: [], errors: [],
};

const UPLOAD: ReportExcelTemplateUpload = { ...TEMPLATE, validation: CLEAN_VALIDATION };

/** The `422` body of a template the preflight refuses to activate. */
const REJECTION = new ApiError(422, {
  valid: false,
  placeholder_count: 5,
  repeatable_rows: 1,
  warnings: [],
  errors: [
    {
      code: "unknown_placeholder",
      message: "Placeholder desconocido en Cotización!B4: {{rows.descuento}}.",
      sheet: "Cotización",
      cell: "B4",
      placeholder: "{{rows.descuento}}",
      range: null,
    },
    {
      code: "merge_crosses_repeatable_row",
      message: "La combinación A8:C9 en la hoja Cotización atraviesa una fila repetible.",
      sheet: "Cotización",
      cell: null,
      placeholder: null,
      range: "A8:C9",
    },
  ],
});

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function xlsxFile(name = "BONATTI-COTIZACION.xlsx"): File {
  return new File(["PK"], name, { type: XLSX_TYPE });
}

function renderCard() {
  return render(<ReportExcelTemplateCard code="COTIZACION" parameters={PARAMETERS} />);
}

beforeEach(() => {
  getReportBuilder.mockResolvedValue(BUILDER);
  getReportExcelTemplate.mockRejectedValue(new ApiError(404, "El reporte no tiene plantilla Excel activa."));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReportExcelTemplateCard", () => {
  it("treats a report without template as a state, not a failure, and lists the placeholders it can use", async () => {
    const user = userEvent.setup();
    renderCard();

    expect(await screen.findByText("Sin plantilla")).toBeTruthy();
    expect(screen.queryByText("No se pudo cargar la plantilla")).toBeNull();
    expect(screen.getByText(/todavía no tiene una plantilla Excel configurada/)).toBeTruthy();
    expect(screen.getByLabelText("Subir plantilla Excel")).toBeTruthy();

    await user.click(await screen.findByRole("button", { name: /Campos disponibles para la plantilla/ }));
    expect(screen.getByText("{{report.name}}")).toBeTruthy();
    expect(screen.getByText("{{parameters.customer_name}}")).toBeTruthy();
    expect(screen.getByText("{{rows.line_total}}")).toBeTruthy();
    expect(screen.getByText("{{summary.subtotal}}")).toBeTruthy();
    expect(screen.getByText(/será utilizada como fila plantilla/)).toBeTruthy();
  });

  it("uploads an .xlsx file and shows the metadata the backend answered with", async () => {
    uploadReportExcelTemplate.mockResolvedValue(UPLOAD);
    const user = userEvent.setup();
    renderCard();

    const file = xlsxFile();
    await user.upload(await screen.findByLabelText("Subir plantilla Excel"), file);

    await waitFor(() => expect(uploadReportExcelTemplate).toHaveBeenCalledWith("COTIZACION", file));
    expect(await screen.findByText("Configurada · v2")).toBeTruthy();
    expect(screen.getByText("BONATTI-COTIZACION.xlsx")).toBeTruthy();
    expect(screen.getByText("Versión: 2")).toBeTruthy();
    expect(screen.getByText("Tamaño: 24.0 KB")).toBeTruthy();
    expect(screen.getByLabelText("Reemplazar plantilla")).toBeTruthy();
    expect(screen.getByText("Compatibilidad: Válida")).toBeTruthy();
    expect(screen.getByText("Placeholders reconocidos: 14")).toBeTruthy();
    expect(screen.getByText("Filas repetibles detectadas: 1")).toBeTruthy();
  });

  it("rejects a file with the wrong extension in the client, without calling the backend", async () => {
    // `applyAccept: false` bypasses the input's own `accept` filter so the
    // component's guard is what rejects the file, exactly as it must for a
    // browser (or a user) that ignores the hint.
    const user = userEvent.setup({ applyAccept: false });
    renderCard();

    await user.upload(await screen.findByLabelText("Subir plantilla Excel"), new File(["{}"], "plantilla.xls"));

    expect(await screen.findByText("Solo se aceptan archivos .xlsx.")).toBeTruthy();
    expect(uploadReportExcelTemplate).not.toHaveBeenCalled();
    expect(screen.getByText("Sin plantilla")).toBeTruthy();
  });

  it("keeps the chosen file for a retry when the upload fails", async () => {
    uploadReportExcelTemplate
      .mockRejectedValueOnce(new ApiError(422, "El archivo no es un XLSX válido."))
      .mockResolvedValueOnce(UPLOAD);
    const user = userEvent.setup();
    renderCard();

    await user.upload(await screen.findByLabelText("Subir plantilla Excel"), xlsxFile());
    expect(await screen.findByText("El archivo no es un XLSX válido.")).toBeTruthy();
    // The builder section around it is untouched: the placeholders still render.
    expect(screen.getByRole("button", { name: /Campos disponibles para la plantilla/ })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Reintentar BONATTI-COTIZACION\.xlsx/ }));
    expect(await screen.findByText("Configurada · v2")).toBeTruthy();
    expect(screen.queryByText("El archivo no es un XLSX válido.")).toBeNull();
  });

  it("replaces, downloads and deletes the active template", async () => {
    getReportExcelTemplate.mockResolvedValue(TEMPLATE);
    uploadReportExcelTemplate.mockResolvedValue({ ...UPLOAD, version: 3, original_filename: "NUEVA.xlsx" });
    downloadReportExcelTemplate.mockResolvedValue({ blob: new Blob(["PK"]), filename: "BONATTI-COTIZACION.xlsx" });
    deleteReportExcelTemplate.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderCard();

    await user.upload(await screen.findByLabelText("Reemplazar plantilla"), xlsxFile("NUEVA.xlsx"));
    expect(await screen.findByText("Configurada · v3")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Descargar plantilla" }));
    await waitFor(() => expect(triggerBrowserDownload).toHaveBeenCalledWith(
      expect.anything(), "NUEVA.xlsx",
    ));

    getReportExcelTemplate.mockRejectedValue(new ApiError(404, "El reporte no tiene plantilla Excel activa."));
    await user.click(screen.getByRole("button", { name: "Eliminar plantilla" }));
    expect(deleteReportExcelTemplate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(deleteReportExcelTemplate).toHaveBeenCalledWith("COTIZACION"));
    expect(await screen.findByText("Sin plantilla")).toBeTruthy();
  });

  it("surfaces a delete failure without losing the template on screen", async () => {
    getReportExcelTemplate.mockResolvedValue(TEMPLATE);
    deleteReportExcelTemplate.mockRejectedValue(new ApiError(500, "No se pudo eliminar."));
    const user = userEvent.setup();
    renderCard();

    await user.click(await screen.findByRole("button", { name: "Eliminar plantilla" }));
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByText("No se pudo eliminar.")).toBeTruthy();
    expect(screen.getByText("BONATTI-COTIZACION.xlsx")).toBeTruthy();
    expect(screen.getByText("Configurada · v2")).toBeTruthy();
  });
  it("shows the compatibility diagnosis of a rejected template without ever calling it Configurada", async () => {
    uploadReportExcelTemplate.mockRejectedValue(REJECTION);
    const user = userEvent.setup();
    renderCard();

    await user.upload(await screen.findByLabelText("Subir plantilla Excel"), xlsxFile("ROTA.xlsx"));

    expect(await screen.findByText("Compatibilidad: No compatible")).toBeTruthy();
    expect(screen.getByText("Placeholders reconocidos: 5")).toBeTruthy();
    expect(screen.getByText("Filas repetibles detectadas: 1")).toBeTruthy();
    expect(screen.getByText("Errores (2)")).toBeTruthy();
    // Every issue names the sheet and the cell or merged range it came from.
    expect(screen.getByText("Cotización!B4")).toBeTruthy();
    expect(screen.getByText(/Placeholder desconocido en Cotización!B4/)).toBeTruthy();
    expect(screen.getByText("Cotización!A8:C9")).toBeTruthy();
    expect(screen.getByText(/atraviesa una fila repetible/)).toBeTruthy();
    expect(screen.queryByText("Advertencias (0)")).toBeNull();

    // The report is still without a template, and the file survives for a retry.
    expect(screen.getByText("Sin plantilla")).toBeTruthy();
    expect(screen.queryByText(/^Configurada/)).toBeNull();
    expect(screen.getByRole("button", { name: /Reintentar ROTA\.xlsx/ })).toBeTruthy();
  });

  it("keeps the active template on screen when a replacement is rejected", async () => {
    getReportExcelTemplate.mockResolvedValue(TEMPLATE);
    uploadReportExcelTemplate.mockRejectedValueOnce(REJECTION).mockResolvedValueOnce({
      ...UPLOAD, version: 3, original_filename: "CORREGIDA.xlsx",
    });
    const user = userEvent.setup();
    renderCard();

    await user.upload(await screen.findByLabelText("Reemplazar plantilla"), xlsxFile("CORREGIDA.xlsx"));

    expect(await screen.findByText("Compatibilidad: No compatible")).toBeTruthy();
    // The rejected file never became a version: v2 is still the active one.
    expect(screen.getByText("Configurada · v2")).toBeTruthy();
    expect(screen.getByText("BONATTI-COTIZACION.xlsx")).toBeTruthy();
    expect(screen.getByText(/la plantilla vigente no fue modificada/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Reintentar CORREGIDA\.xlsx/ }));
    expect(await screen.findByText("Configurada · v3")).toBeTruthy();
    expect(screen.getByText("Compatibilidad: Válida")).toBeTruthy();
    expect(screen.queryByText("Errores (2)")).toBeNull();
  });

  it("reports a template the backend accepted with warnings as installed but flagged", async () => {
    uploadReportExcelTemplate.mockResolvedValue({
      ...UPLOAD,
      validation: {
        valid: true,
        placeholder_count: 9,
        repeatable_rows: 0,
        warnings: [{
          code: "no_repeatable_row",
          message: "Ninguna fila contiene campos de partidas.",
          sheet: "Cotización",
          cell: null,
          placeholder: null,
          range: null,
        }],
        errors: [],
      },
    });
    const user = userEvent.setup();
    renderCard();

    await user.upload(await screen.findByLabelText("Subir plantilla Excel"), xlsxFile());

    expect(await screen.findByText("Compatibilidad: Con advertencias")).toBeTruthy();
    expect(screen.getByText("Advertencias (1)")).toBeTruthy();
    expect(screen.getByText("Cotización")).toBeTruthy();
    expect(screen.getByText("Configurada · v2")).toBeTruthy();
  });

  it("falls back to the plain message when the failure carries no validation result", async () => {
    uploadReportExcelTemplate.mockRejectedValue(new ApiError(413, "La plantilla excede el tamaño máximo."));
    const user = userEvent.setup();
    renderCard();

    await user.upload(await screen.findByLabelText("Subir plantilla Excel"), xlsxFile());

    expect(await screen.findByText("La plantilla excede el tamaño máximo.")).toBeTruthy();
    expect(screen.queryByText(/^Compatibilidad:/)).toBeNull();
  });

  it("drops the diagnosis with the template it described when the template is deleted", async () => {
    getReportExcelTemplate.mockResolvedValue(TEMPLATE);
    uploadReportExcelTemplate.mockResolvedValue(UPLOAD);
    deleteReportExcelTemplate.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderCard();

    await user.upload(await screen.findByLabelText("Reemplazar plantilla"), xlsxFile());
    expect(await screen.findByText("Compatibilidad: Válida")).toBeTruthy();

    getReportExcelTemplate.mockRejectedValue(new ApiError(404, "El reporte no tiene plantilla Excel activa."));
    await user.click(screen.getByRole("button", { name: "Eliminar plantilla" }));
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByText("Sin plantilla")).toBeTruthy();
    expect(screen.queryByText(/^Compatibilidad:/)).toBeNull();
  });
});
