// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportExcelTemplateInspector } from "./report-excel-template-inspector";
import { ApiError } from "@/lib/api/errors";
import type { ReportBuilderDefinition, ReportExcelTemplateInspection, ReportWorkbookCellInspection } from "@/types/api";

const {
  inspectReportExcelTemplate, getReportBuilder, updateReportExcelTemplateMappings,
  previewReportBuilder, renderReportExcelTemplatePreview, listReportExcelTemplateVersions,
  restoreReportExcelTemplateVersion,
} = vi.hoisted(() => ({
  inspectReportExcelTemplate: vi.fn(),
  getReportBuilder: vi.fn(),
  updateReportExcelTemplateMappings: vi.fn(),
  previewReportBuilder: vi.fn(),
  renderReportExcelTemplatePreview: vi.fn(),
  listReportExcelTemplateVersions: vi.fn(),
  restoreReportExcelTemplateVersion: vi.fn(),
}));
vi.mock("@/lib/api/reports", () => ({
  inspectReportExcelTemplate, getReportBuilder, updateReportExcelTemplateMappings,
  previewReportBuilder, renderReportExcelTemplatePreview, listReportExcelTemplateVersions,
  restoreReportExcelTemplateVersion,
}));

const BUILDER: ReportBuilderDefinition = {
  report: {
    code: "COTIZACION", name: "Cotización", description: null, category: null, filename_template: null,
    enabled: true, data_source_id: 1,
    data_source: { id: 1, code: "quotes", name: "Cotizaciones", description: null, enabled: true, capabilities: [] },
    parameters: [
      { name: "customer_name", label: "Cliente", data_type: "string", input_type: "text", required: true, default_value: null, display_order: 0, configuration_json: null },
    ],
    parameter_groups: [], created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  },
  columns: [
    { key: "part_number", label: "No. Parte", column_type: "FIELD", source_field: "product.part_number", source_parameter: null, formula_definition: null, data_type: "string", format_type: "text", display_order: 0, visible: true, width: null },
  ],
  parameter_groups: [],
  excel_layout: {
    sheet_name: "Cotización", title: null, show_report_name: true, show_generated_at: true,
    show_parameters: true, freeze_header: true, header_row: 1,
    totals: [{ key: "subtotal", label: "Subtotal", column_key: "part_number", operation: "SUM", formula_definition: null, format_type: "currency" }],
  },
};

function cell(overrides: Partial<ReportWorkbookCellInspection> = {}): ReportWorkbookCellInspection {
  return {
    coordinate: "A1", row: 1, column: 1, value: null, value_type: "empty", formula: null,
    placeholders: [], style_id: 0, number_format: "General", merged_range: null, merge_anchor: null,
    ...overrides,
  };
}

const MAPPED_CELL = cell({ coordinate: "B2", row: 2, column: 2, value: "{{parameters.customer_name}}", value_type: "text", placeholders: ["{{parameters.customer_name}}"] });
const BLANK_TARGET = cell({ coordinate: "D4", row: 4, column: 4 });
const FORMULA_CELL = cell({ coordinate: "C1", row: 1, column: 3, value_type: "formula", formula: "=A1+A2" });
const ROW_ANCHOR = cell({ coordinate: "A13", row: 13, column: 1, value: "{{rows.row_number}}", value_type: "text", placeholders: ["{{rows.row_number}}"] });
const OTHER_ROW_TARGET = cell({ coordinate: "A20", row: 20, column: 1 });

const SHEET_A = {
  name: "Cotización", index: 0, hidden: false, state: "visible" as const, max_row: 20, max_column: 4,
  used_range: "A1:D20", merged_ranges: [], row_heights: {}, column_widths: {},
  default_row_height: null, default_column_width: null,
  cells: [MAPPED_CELL, BLANK_TARGET, FORMULA_CELL],
  drawings: [],
};

/** Adds an already-established repeatable row (A13), for the row-blocking tests. */
const SHEET_WITH_REPEATABLE_ROW = { ...SHEET_A, cells: [...SHEET_A.cells, ROW_ANCHOR, OTHER_ROW_TARGET] };

const SHEET_B = { ...SHEET_A, name: "Anexos", index: 1, hidden: true, state: "hidden" as const, cells: [] };

const INSPECTION: ReportExcelTemplateInspection = {
  template: { version: 3, filename: "COTIZACION.xlsx", checksum: "abc" },
  sheets: [SHEET_A],
  styles: {},
  truncated: false,
};

function mockReady(inspection: ReportExcelTemplateInspection = INSPECTION, builder: ReportBuilderDefinition = BUILDER) {
  inspectReportExcelTemplate.mockResolvedValue(inspection);
  getReportBuilder.mockResolvedValue(builder);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReportExcelTemplateInspector", () => {
  it("shows a loading skeleton, then the grid and template metadata", async () => {
    mockReady();
    render(<ReportExcelTemplateInspector code="COTIZACION" />);

    expect(await screen.findByText("COTIZACION.xlsx · v3")).toBeTruthy();
    expect(screen.getByLabelText("Celda B2")).toBeTruthy();
  });

  it("treats a 404 as the no-template state, not an error", async () => {
    inspectReportExcelTemplate.mockRejectedValue(new ApiError(404, "El reporte no tiene plantilla Excel activa."));
    getReportBuilder.mockResolvedValue(BUILDER);
    render(<ReportExcelTemplateInspector code="COTIZACION" />);

    expect(await screen.findByText(/todavía no tiene una plantilla Excel activa/)).toBeTruthy();
  });

  it("treats a 422 as a workbook-out-of-limits state with the backend's own message", async () => {
    inspectReportExcelTemplate.mockRejectedValue(new ApiError(422, "La hoja supera el máximo de celdas permitido."));
    getReportBuilder.mockResolvedValue(BUILDER);
    render(<ReportExcelTemplateInspector code="COTIZACION" />);

    expect(await screen.findByText("Workbook fuera de límites")).toBeTruthy();
    expect(screen.getByText("La hoja supera el máximo de celdas permitido.")).toBeTruthy();
  });

  it("shows a generic inspection error for anything else", async () => {
    inspectReportExcelTemplate.mockRejectedValue(new ApiError(500, "Error inesperado."));
    getReportBuilder.mockResolvedValue(BUILDER);
    render(<ReportExcelTemplateInspector code="COTIZACION" />);

    expect(await screen.findByText("Error de inspección")).toBeTruthy();
    expect(screen.getByText("Error inesperado.")).toBeTruthy();
  });

  it("selects a cell and shows its content, type, format and current mapping", async () => {
    mockReady();
    const user = userEvent.setup();
    render(<ReportExcelTemplateInspector code="COTIZACION" />);

    await user.click(await screen.findByLabelText("Celda B2"));
    const panel = screen.getByLabelText("Celda seleccionada");
    expect(within(panel).getByText("Celda seleccionada: B2")).toBeTruthy();
    expect(within(panel).getByText(/Contenido actual: \{\{parameters\.customer_name\}\}/)).toBeTruthy();
    expect(within(panel).getByText("Tipo: Texto")).toBeTruthy();
    expect(within(panel).getByText(/Asignado:/)).toBeTruthy();
    expect(within(panel).getByText("[P] Cliente", { selector: "code" })).toBeTruthy();
  });

  it("blocks mapping a formula cell and explains why, with no field picker", async () => {
    mockReady();
    const user = userEvent.setup();
    render(<ReportExcelTemplateInspector code="COTIZACION" />);

    await user.click(await screen.findByLabelText("Celda C1"));
    expect(screen.getByText(/contiene una fórmula de Excel y no se reemplaza/)).toBeTruthy();
    expect(screen.queryByLabelText("Asignar dato")).toBeNull();
  });

  it("assigns a parameter to a cell without typing {{...}}, and the grid shows the friendly label", async () => {
    mockReady();
    const user = userEvent.setup();
    render(<ReportExcelTemplateInspector code="COTIZACION" />);

    await user.click(await screen.findByLabelText("Celda D4"));
    await user.selectOptions(screen.getByLabelText("Asignar dato"), "parameters.customer_name");
    await user.click(screen.getByRole("button", { name: "Asignar" }));

    expect(within(screen.getByLabelText("Celda D4")).getByText("Cliente")).toBeTruthy();
    expect(screen.getByText("Cambios sin guardar")).toBeTruthy();
  });

  it("assigns the first rows.* field of a row and marks it as the repeatable row", async () => {
    mockReady();
    const user = userEvent.setup();
    render(<ReportExcelTemplateInspector code="COTIZACION" />);

    await user.click(await screen.findByLabelText("Celda D4"));
    await user.selectOptions(screen.getByLabelText("Asignar dato"), "rows.part_number");
    await user.click(screen.getByRole("button", { name: "Asignar" }));

    await user.click(screen.getByLabelText("Celda D4"));
    expect(screen.getByText(/Fila 4 · se repetirá por cada renglón/)).toBeTruthy();
  });

  it("blocks a second repeatable row once one is already known, disabling rows.* options elsewhere", async () => {
    mockReady({ ...INSPECTION, sheets: [SHEET_WITH_REPEATABLE_ROW] });
    const user = userEvent.setup();
    render(<ReportExcelTemplateInspector code="COTIZACION" />);

    // A13 already carries a saved rows.* placeholder (the sheet's repeatable row).
    await user.click(await screen.findByLabelText("Celda A20"));
    const rowsOption = screen.getByRole("option", { name: "[R] No. Parte" }) as HTMLOptionElement;
    expect(rowsOption.disabled).toBe(true);
    expect(screen.getByText(/limitados a la fila 13/)).toBeTruthy();
  });

  it("offers Quitar asignación for a cell that already carries a placeholder, and clearing it shows an empty badge", async () => {
    mockReady();
    const user = userEvent.setup();
    render(<ReportExcelTemplateInspector code="COTIZACION" />);

    await user.click(await screen.findByLabelText("Celda B2"));
    await user.click(screen.getByRole("button", { name: "Quitar asignación" }));

    expect(within(screen.getByLabelText("Celda B2")).getByText("(vacío)")).toBeTruthy();
    expect(screen.getByText("Cambios sin guardar")).toBeTruthy();
  });

  it("saves every pending change in one batch and refreshes the version shown", async () => {
    mockReady();
    updateReportExcelTemplateMappings.mockResolvedValue({
      report_code: "COTIZACION", original_filename: "COTIZACION.xlsx", size_bytes: 100, version: 4, checksum: "def",
      is_active: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
      validation: { valid: true, placeholder_count: 2, repeatable_rows: 1, warnings: [], errors: [] },
      inspection: { ...INSPECTION, template: { version: 4, filename: "COTIZACION.xlsx", checksum: "def" } },
    });
    const user = userEvent.setup();
    render(<ReportExcelTemplateInspector code="COTIZACION" />);

    await user.click(await screen.findByLabelText("Celda D4"));
    await user.selectOptions(screen.getByLabelText("Asignar dato"), "parameters.customer_name");
    await user.click(screen.getByRole("button", { name: "Asignar" }));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(updateReportExcelTemplateMappings).toHaveBeenCalledWith("COTIZACION", {
      base_version: 3, base_checksum: "abc",
      mappings: [{ sheet: "Cotización", cell: "D4", placeholder: "parameters.customer_name" }],
      clear: [],
    }));
    expect(await screen.findByText("COTIZACION.xlsx · v4")).toBeTruthy();
    expect(screen.queryByText("Cambios sin guardar")).toBeNull();
  });

  it("blocks a second click while a save is in flight", async () => {
    mockReady();
    let resolveSave!: (value: unknown) => void;
    updateReportExcelTemplateMappings.mockReturnValue(new Promise((resolve) => { resolveSave = resolve; }));
    const user = userEvent.setup();
    render(<ReportExcelTemplateInspector code="COTIZACION" />);

    await user.click(await screen.findByLabelText("Celda D4"));
    await user.selectOptions(screen.getByLabelText("Asignar dato"), "parameters.customer_name");
    await user.click(screen.getByRole("button", { name: "Asignar" }));
    const saveButton = screen.getByRole("button", { name: "Guardar cambios" }) as HTMLButtonElement;
    await user.click(saveButton);

    expect(saveButton.disabled).toBe(true);
    expect(updateReportExcelTemplateMappings).toHaveBeenCalledTimes(1);

    resolveSave({
      report_code: "COTIZACION", original_filename: "COTIZACION.xlsx", size_bytes: 100, version: 4, checksum: "def",
      is_active: true, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
      validation: { valid: true, placeholder_count: 2, repeatable_rows: 1, warnings: [], errors: [] },
      inspection: { ...INSPECTION, template: { version: 4, filename: "COTIZACION.xlsx", checksum: "def" } },
    });
    await waitFor(() => expect(saveButton.disabled).toBe(true)); // no more pending edits once saved
  });

  it("shows the stale-template conflict on a 409 and keeps the local edit until reload", async () => {
    mockReady();
    updateReportExcelTemplateMappings.mockRejectedValue(new ApiError(409, "La plantilla activa cambió. Recargue el inspector y vuelva a aplicar los mappings."));
    const user = userEvent.setup();
    render(<ReportExcelTemplateInspector code="COTIZACION" />);

    await user.click(await screen.findByLabelText("Celda D4"));
    await user.selectOptions(screen.getByLabelText("Asignar dato"), "parameters.customer_name");
    await user.click(screen.getByRole("button", { name: "Asignar" }));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("La plantilla cambió")).toBeTruthy();
    expect(within(screen.getByLabelText("Celda D4")).getByText("Cliente")).toBeTruthy();

    mockReady();
    await user.click(screen.getByRole("button", { name: "Recargar" }));
    await waitFor(() => expect(inspectReportExcelTemplate).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("La plantilla cambió")).toBeNull();
  });

  it("shows a backend validation error per cell while keeping the local edit", async () => {
    mockReady();
    updateReportExcelTemplateMappings.mockRejectedValue(new ApiError(422, {
      errors: [{ code: "unknown_placeholder", message: "El campo no pertenece al contrato del reporte.", sheet: "Cotización", cell: "D4", operation: "mapping" }],
    }));
    const user = userEvent.setup();
    render(<ReportExcelTemplateInspector code="COTIZACION" />);

    await user.click(await screen.findByLabelText("Celda D4"));
    await user.selectOptions(screen.getByLabelText("Asignar dato"), "parameters.customer_name");
    await user.click(screen.getByRole("button", { name: "Asignar" }));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("El campo no pertenece al contrato del reporte.")).toBeTruthy();
    expect(within(screen.getByLabelText("Celda D4")).getByText("Cliente")).toBeTruthy();
  });

  it("switches sheets with tabs and resets the selection", async () => {
    mockReady({ ...INSPECTION, sheets: [SHEET_A, SHEET_B] });
    const user = userEvent.setup();
    render(<ReportExcelTemplateInspector code="COTIZACION" />);

    await user.click(await screen.findByLabelText("Celda B2"));
    expect(screen.getByText("Celda seleccionada: B2")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: /Anexos/ }));
    expect(await screen.findByText("Esta hoja no tiene contenido.")).toBeTruthy();
    expect(screen.getByText("Ninguna celda seleccionada.")).toBeTruthy();
  });

  it("does not show sheet tabs for a single-sheet template, only the Diseño/Vista previa mode tabs", async () => {
    mockReady();
    render(<ReportExcelTemplateInspector code="COTIZACION" />);

    await screen.findByText("COTIZACION.xlsx · v3");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Diseño", "Vista previa"]);
  });

  it("flags an empty sheet without hiding the grid", async () => {
    mockReady({ ...INSPECTION, sheets: [{ ...SHEET_A, used_range: "A1:A1", cells: [] }] });
    render(<ReportExcelTemplateInspector code="COTIZACION" />);

    expect(await screen.findByText("Esta hoja no tiene contenido.")).toBeTruthy();
    expect(screen.getByLabelText("Celda A1")).toBeTruthy();
  });

  it("blocks rendering a sheet whose used range is too large, with an explanatory message", async () => {
    mockReady({ ...INSPECTION, sheets: [{ ...SHEET_A, used_range: "A1:CV5000" }] });
    render(<ReportExcelTemplateInspector code="COTIZACION" />);

    expect(await screen.findByText("Hoja demasiado grande para mostrarse")).toBeTruthy();
    expect(screen.queryByLabelText("Celda B2")).toBeNull();
  });

  it("refetches when the report code changes", async () => {
    mockReady();
    const { rerender } = render(<ReportExcelTemplateInspector code="COTIZACION" />);
    await waitFor(() => expect(inspectReportExcelTemplate).toHaveBeenCalledWith("COTIZACION", expect.anything()));

    rerender(<ReportExcelTemplateInspector code="OTRO" />);
    await waitFor(() => expect(inspectReportExcelTemplate).toHaveBeenCalledWith("OTRO", expect.anything()));
  });

  it("clears the old workbook while another report's inspection is loading", async () => {
    mockReady();
    const { rerender } = render(<ReportExcelTemplateInspector code="COTIZACION" />);
    await screen.findByLabelText("Celda B2");
    inspectReportExcelTemplate.mockImplementationOnce(() => new Promise(() => {}));
    rerender(<ReportExcelTemplateInspector code="OTRO" />);
    expect(screen.queryByLabelText("Celda B2")).toBeNull();
    expect(screen.queryByText("COTIZACION.xlsx · v3")).toBeNull();
  });

  it("switches to the Vista previa tab, which reuses the report's runtime controls for test parameters", async () => {
    mockReady();
    const user = userEvent.setup();
    render(<ReportExcelTemplateInspector code="COTIZACION" />);

    await screen.findByLabelText("Celda B2");
    await user.click(screen.getByRole("tab", { name: "Vista previa" }));

    expect(screen.getByLabelText(/Cliente/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generar vista previa" })).toBeTruthy();
  });

  it("blocks generating a preview while there are unsaved mappings, with the exact required message", async () => {
    mockReady();
    const user = userEvent.setup();
    render(<ReportExcelTemplateInspector code="COTIZACION" />);

    await user.click(await screen.findByLabelText("Celda D4"));
    await user.selectOptions(screen.getByLabelText("Asignar dato"), "parameters.customer_name");
    await user.click(screen.getByRole("button", { name: "Asignar" }));

    await user.click(screen.getByRole("tab", { name: "Vista previa" }));
    expect(screen.getByText("Guarda los cambios de la plantilla antes de generar la vista previa.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Generar vista previa" }) as HTMLButtonElement).disabled).toBe(true);
    expect(previewReportBuilder).not.toHaveBeenCalled();
  });

  it("offers a version history entry point that blocks restoring while mappings are dirty", async () => {
    mockReady();
    listReportExcelTemplateVersions.mockResolvedValue([
      { report_code: "COTIZACION", original_filename: "COTIZACION.xlsx", size_bytes: 100, version: 3, checksum: "abc",
        is_active: true, created_at: "2026-09-16T10:00:00Z", updated_at: "2026-09-16T10:00:00Z" },
    ]);
    const user = userEvent.setup();
    render(<ReportExcelTemplateInspector code="COTIZACION" />);

    await user.click(await screen.findByLabelText("Celda D4"));
    await user.selectOptions(screen.getByLabelText("Asignar dato"), "parameters.customer_name");
    await user.click(screen.getByRole("button", { name: "Asignar" }));

    await user.click(screen.getByRole("button", { name: /Historial de versiones/ }));
    expect(await screen.findByText("Guarda o descarta tus cambios antes de restaurar otra versión.")).toBeTruthy();
  });

  it("reloads the inspection and builder after restoring a version from the history", async () => {
    inspectReportExcelTemplate
      .mockResolvedValueOnce(INSPECTION)
      .mockResolvedValueOnce({ ...INSPECTION, template: { version: 4, filename: "COTIZACION.xlsx", checksum: "new" } });
    getReportBuilder.mockResolvedValue(BUILDER);
    listReportExcelTemplateVersions.mockResolvedValue([
      { report_code: "COTIZACION", original_filename: "COTIZACION.xlsx", size_bytes: 100, version: 3, checksum: "abc",
        is_active: true, created_at: "2026-09-16T10:00:00Z", updated_at: "2026-09-16T10:00:00Z" },
      { report_code: "COTIZACION", original_filename: "COTIZACION.xlsx", size_bytes: 90, version: 2, checksum: "old",
        is_active: false, created_at: "2026-09-15T10:00:00Z", updated_at: "2026-09-15T10:00:00Z" },
    ]);
    restoreReportExcelTemplateVersion.mockResolvedValue({
      report_code: "COTIZACION", original_filename: "COTIZACION.xlsx", size_bytes: 90, version: 4, checksum: "new",
      is_active: true, created_at: "2026-09-17T10:00:00Z", updated_at: "2026-09-17T10:00:00Z",
      validation: { valid: true, placeholder_count: 1, repeatable_rows: 0, warnings: [], errors: [] },
    });
    const user = userEvent.setup();
    render(<ReportExcelTemplateInspector code="COTIZACION" />);

    await screen.findByText("COTIZACION.xlsx · v3");
    await user.click(screen.getByRole("button", { name: /Historial de versiones/ }));
    await user.click(await screen.findByRole("button", { name: /Restaurar esta versión/ }));
    await user.click(screen.getByRole("button", { name: "Confirmar restauración" }));

    await waitFor(() => expect(restoreReportExcelTemplateVersion).toHaveBeenCalledWith(
      "COTIZACION", 2, { base_version: 3, base_checksum: "abc" },
    ));
    expect(await screen.findByText("COTIZACION.xlsx · v4")).toBeTruthy();
  });
});

it("refreshes a mounted no-template editor when the wizard uploads a template", async () => {
  inspectReportExcelTemplate.mockRejectedValue(new ApiError(404, "no template"));
  getReportBuilder.mockResolvedValue(BUILDER);
  const view = render(<ReportExcelTemplateInspector code="COTIZACION" refreshToken="none" />);
  expect(await screen.findByText(/todavía no tiene una plantilla Excel activa/)).toBeTruthy();
  mockReady();
  view.rerender(<ReportExcelTemplateInspector code="COTIZACION" refreshToken="3" />);
  expect(await screen.findByText("COTIZACION.xlsx · v3")).toBeTruthy();
  expect(screen.getByLabelText("Celda B2")).toBeTruthy();
});
