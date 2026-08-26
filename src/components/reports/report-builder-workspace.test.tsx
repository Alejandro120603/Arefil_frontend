// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportBuilderWorkspace } from "./report-builder-workspace";
import { ApiError } from "@/lib/api/errors";
import type {
  ReportBuilderDefinition,
  ReportBuilderPreviewResponse,
  ReportFieldDescriptor,
  ReportParameter,
} from "@/types/api";

const {
  getReportBuilderMock,
  getReportFieldCatalogMock,
  saveReportBuilderMock,
  previewReportBuilderMock,
  getReportParameterOptionsMock,
} = vi.hoisted(() => ({
  getReportBuilderMock: vi.fn(),
  getReportFieldCatalogMock: vi.fn(),
  saveReportBuilderMock: vi.fn(),
  previewReportBuilderMock: vi.fn(),
  getReportParameterOptionsMock: vi.fn(),
}));

vi.mock("@/lib/api/reports", () => ({
  getReportBuilder: getReportBuilderMock,
  getReportFieldCatalog: getReportFieldCatalogMock,
  saveReportBuilder: saveReportBuilderMock,
  previewReportBuilder: previewReportBuilderMock,
  getReportParameterOptions: getReportParameterOptionsMock,
}));

const FIELDS: ReportFieldDescriptor[] = [
  { key: "product.part_number", label: "Número de parte", data_type: "string", group: "Producto", required_context: "product" },
  { key: "price_list_item.unit_price", label: "Precio unitario", data_type: "decimal", group: "Item de lista", required_context: "price_list_item" },
];

const QUANTITY: ReportParameter = {
  name: "quantity", label: "Cantidad", data_type: "integer", input_type: "number",
  required: true, default_value: 1, display_order: 0, configuration_json: null,
};

const REPORT = {
  code: "COTIZACION", name: "Cotización", description: null, category: null, enabled: true,
  data_source_type: "SQL_QUERY" as const, active_template_version: null, parameters: [QUANTITY],
  parameter_groups: [],
  created_at: "2026-08-26T00:00:00Z", updated_at: "2026-08-26T00:00:00Z",
  data_source_key: null, query_text: "SELECT 1",
};

const EMPTY_BUILDER: ReportBuilderDefinition = { report: REPORT, columns: [], parameter_groups: [], excel_layout: null };

const SAVED_BUILDER: ReportBuilderDefinition = {
  report: REPORT,
  columns: [{
    key: "part_number", label: "SKU", column_type: "FIELD",
    source_field: "product.part_number", source_parameter: null, formula_definition: null,
    data_type: "string", format_type: "text", display_order: 0, visible: true, width: 18,
  }],
  parameter_groups: [],
  excel_layout: {
    sheet_name: "Cotización", title: "Cotización", show_report_name: true, show_generated_at: true,
    show_parameters: true, freeze_header: true, header_row: 1, totals: [],
  },
};

beforeEach(() => {
  // `restoreMocks` only restores spies; these hoisted `vi.fn()`s keep their
  // call history between tests unless it is cleared explicitly.
  vi.clearAllMocks();
  getReportFieldCatalogMock.mockResolvedValue(FIELDS);
  getReportBuilderMock.mockResolvedValue(EMPTY_BUILDER);
  saveReportBuilderMock.mockResolvedValue(SAVED_BUILDER);
  getReportParameterOptionsMock.mockResolvedValue([]);
});

afterEach(cleanup);

function renderWorkspace(dataSourceKey: string | null = null) {
  return render(<ReportBuilderWorkspace code="COTIZACION" parameters={[QUANTITY]} dataSourceKey={dataSourceKey} />);
}

async function addFieldColumn(user: ReturnType<typeof userEvent.setup>, fieldKey: string) {
  const select = await screen.findByLabelText("Agregar columna de campo");
  await user.selectOptions(select, fieldKey);
}

describe("ReportBuilderWorkspace", () => {
  it("loads the field catalog from the backend and groups it for the user", async () => {
    renderWorkspace();
    const select = await screen.findByLabelText("Agregar columna de campo");
    expect(getReportFieldCatalogMock).toHaveBeenCalled();
    expect(within(select).getByRole("group", { name: "Producto" })).toBeTruthy();
    // The friendly label leads; the technical key stays visible but secondary.
    expect(within(select).getByRole("option", { name: /Número de parte · product\.part_number/ })).toBeTruthy();
  });

  it("shows the backend's error when the field catalog cannot be loaded", async () => {
    getReportFieldCatalogMock.mockRejectedValue(new ApiError(503, "El catálogo no está disponible."));
    renderWorkspace();
    expect(await screen.findByText("El catálogo no está disponible.")).toBeTruthy();
  });

  it("starts from an empty shell when the report has no builder configured", async () => {
    renderWorkspace();
    expect(await screen.findByText(/todavía no tiene columnas/)).toBeTruthy();
    expect(((await screen.findByLabelText("Nombre de hoja")) as HTMLInputElement).value).toBe("Data");
  });

  it("loads an existing builder into the editor", async () => {
    getReportBuilderMock.mockResolvedValue(SAVED_BUILDER);
    renderWorkspace();
    expect(((await screen.findByLabelText("Etiqueta")) as HTMLInputElement).value).toBe("SKU");
    expect(((await screen.findByLabelText("Ancho")) as HTMLInputElement).value).toBe("18");
    expect(((await screen.findByLabelText("Nombre de hoja")) as HTMLInputElement).value).toBe("Cotización");
  });

  it("adds a FIELD column bound to a catalog key", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await addFieldColumn(user, "product.part_number");
    expect(((await screen.findByLabelText("Nombre interno")) as HTMLInputElement).value).toBe("part_number");
    expect(screen.getByText(/Campo · Producto → Número de parte/)).toBeTruthy();
  });

  it("adds a PARAMETER column offering only real report parameters", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const select = await screen.findByLabelText("Agregar columna de parámetro");
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Selecciona un parámetro…", "Cantidad · quantity",
    ]);
    await user.selectOptions(select, "quantity");
    expect(screen.getByText(/Parámetro · quantity/)).toBeTruthy();
    // The parameter is consumed, so it is no longer offered a second time.
    expect(within(await screen.findByLabelText("Agregar columna de parámetro")).getAllByRole("option")).toHaveLength(1);
  });

  it("adds a FORMULA column that only offers numeric references", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await addFieldColumn(user, "product.part_number");
    await addFieldColumn(user, "price_list_item.unit_price");
    await user.click(screen.getByRole("button", { name: /Agregar columna calculada/ }));

    const references = await screen.findByLabelText("Insertar referencia");
    const names = within(references).getAllByRole("option").map((option) => option.textContent);
    // `part_number` is a string column and must never be offered.
    expect(names.some((name) => name?.includes("part_number"))).toBe(false);
    expect(names.some((name) => name?.includes("unit_price"))).toBe(true);
    expect(names.some((name) => name?.includes("quantity"))).toBe(true);
  });

  it("builds a formula from controlled references and operators, never free code", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await addFieldColumn(user, "price_list_item.unit_price");
    await user.click(screen.getByRole("button", { name: /Agregar columna calculada/ }));

    await user.selectOptions(await screen.findByLabelText("Insertar referencia"), "unit_price");
    await user.click(screen.getByRole("button", { name: "Insertar *" }));
    await user.selectOptions(screen.getByLabelText("Insertar referencia"), "quantity");

    expect((screen.getByLabelText("Fórmula") as HTMLInputElement).value).toBe("unit_price * quantity ");
  });

  it("flags an unknown formula reference inline", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /Agregar columna calculada/ }));
    await user.type(screen.getByLabelText("Fórmula"), "precio_inventado * 2");
    expect(screen.getByText(/Referencias desconocidas: precio_inventado/)).toBeTruthy();
  });

  it("reorders, hides and removes columns without leaving inconsistent state", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await addFieldColumn(user, "product.part_number");
    await addFieldColumn(user, "price_list_item.unit_price");

    const labels = () => screen.getAllByLabelText("Etiqueta").map((input) => (input as HTMLInputElement).value);
    expect(labels()).toEqual(["Número de parte", "Precio unitario"]);

    await user.click(screen.getByRole("button", { name: "Mover unit_price arriba" }));
    expect(labels()).toEqual(["Precio unitario", "Número de parte"]);

    await user.click(screen.getAllByLabelText("Visible")[0]);
    expect(screen.getByText("Oculta")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Eliminar unit_price" }));
    expect(labels()).toEqual(["Número de parte"]);
  });

  it("blocks a save that the backend would reject and keeps the edits on screen", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /Agregar columna calculada/ }));
    await user.click(screen.getByRole("button", { name: /Guardar constructor/ }));

    expect(await screen.findByText(/requiere una fórmula/)).toBeTruthy();
    expect(saveReportBuilderMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Fórmula")).toBeTruthy();
  });

  it("saves columns and Excel layout together in one request", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await addFieldColumn(user, "product.part_number");
    await user.clear(await screen.findByLabelText("Nombre de hoja"));
    await user.type(screen.getByLabelText("Nombre de hoja"), "Cotización");
    await user.click(screen.getByRole("button", { name: /Guardar constructor/ }));

    await waitFor(() => expect(saveReportBuilderMock).toHaveBeenCalledTimes(1));
    const [code, request] = saveReportBuilderMock.mock.calls[0];
    expect(code).toBe("COTIZACION");
    expect(request.columns).toEqual([expect.objectContaining({
      key: "part_number", column_type: "FIELD", source_field: "product.part_number", display_order: 0,
    })]);
    expect(request.excel_layout).toMatchObject({ sheet_name: "Cotización", freeze_header: true, totals: [] });
    expect(await screen.findByText("Constructor guardado")).toBeTruthy();
  });

  it("configures and saves repeatable metadata in the same transactional builder request", async () => {
    const user = userEvent.setup();
    renderWorkspace("repeatable_rows");
    await user.click(await screen.findByRole("button", { name: "Agregar grupo repetible" }));
    expect((screen.getByLabelText("Nombre interno", { selector: "#group-name" }) as HTMLInputElement).value).toBe("items");
    expect(screen.getByDisplayValue("Producto")).toBeTruthy();
    await addFieldColumn(user, "product.part_number");
    await user.click(screen.getByRole("button", { name: /Guardar constructor/ }));

    await waitFor(() => expect(saveReportBuilderMock).toHaveBeenCalledTimes(1));
    expect(saveReportBuilderMock.mock.calls[0][1]).toMatchObject({
      parameter_groups: [{
        name: "items", resolver_key: "products_by_price_list", context_parameter: "quantity", min_items: 1,
        fields: [{
          name: "product_id", data_type: "integer", input_type: "select", required: true,
          configuration_json: { options_source: "products_by_price_list", context_parameter: "quantity" },
        }],
      }],
    });
  });

  it("surfaces the backend save error and preserves the edited state", async () => {
    saveReportBuilderMock.mockRejectedValue(new ApiError(422, "Las fórmulas contienen una dependencia cíclica."));
    const user = userEvent.setup();
    renderWorkspace();
    await addFieldColumn(user, "product.part_number");
    await user.click(screen.getByRole("button", { name: /Guardar constructor/ }));

    expect(await screen.findByText("Las fórmulas contienen una dependencia cíclica.")).toBeTruthy();
    expect(((await screen.findByLabelText("Etiqueta")) as HTMLInputElement).value).toBe("Número de parte");
  });

  it("never reports success before the backend answers, and never submits twice", async () => {
    let resolveSave: ((builder: ReportBuilderDefinition) => void) | undefined;
    saveReportBuilderMock.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    const user = userEvent.setup();
    renderWorkspace();
    await addFieldColumn(user, "product.part_number");

    await user.click(screen.getByRole("button", { name: /Guardar constructor/ }));
    expect(await screen.findByRole("button", { name: /Guardando/ })).toBeTruthy();
    expect(screen.queryByText("Constructor guardado")).toBeNull();
    await user.click(screen.getByRole("button", { name: /Guardando/ }));
    expect(saveReportBuilderMock).toHaveBeenCalledTimes(1);

    resolveSave?.(SAVED_BUILDER);
    expect(await screen.findByText("Constructor guardado")).toBeTruthy();
  });

  it("renders the builder preview without loading Stimulsoft", async () => {
    const preview: ReportBuilderPreviewResponse = {
      columns: [
        { key: "part_number", label: "SKU", data_type: "string", format_type: "text" },
        { key: "subtotal", label: "Subtotal", data_type: "decimal", format_type: "currency" },
      ],
      rows: [{ part_number: "P181050", subtotal: "300.00" }],
      totals: { subtotal: "300.00" },
      row_count: 1,
      truncated: true,
    };
    previewReportBuilderMock.mockResolvedValue(preview);
    getReportBuilderMock.mockResolvedValue(SAVED_BUILDER);

    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /Generar vista previa/ }));

    await waitFor(() => expect(previewReportBuilderMock).toHaveBeenCalledWith("COTIZACION", { quantity: 1 }));
    expect(await screen.findByRole("columnheader", { name: "Subtotal" })).toBeTruthy();
    expect(screen.getByText("P181050")).toBeTruthy();
    expect(screen.getAllByText("$300.00")).toHaveLength(2); // row + totals row
    expect(screen.getByText("Resultado truncado")).toBeTruthy();
    // No Stimulsoft asset is ever requested for the builder preview.
    expect(document.querySelector("script[src*='stimulsoft']")).toBeNull();
  });

  it("reports an empty preview instead of pretending it failed", async () => {
    previewReportBuilderMock.mockResolvedValue({
      columns: [{ key: "part_number", label: "SKU", data_type: "string", format_type: "text" }],
      rows: [], totals: {}, row_count: 0, truncated: false,
    });
    getReportBuilderMock.mockResolvedValue(SAVED_BUILDER);
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /Generar vista previa/ }));
    expect(await screen.findByText(/no devolvió filas/)).toBeTruthy();
  });

  it("shows the backend message when the preview fails", async () => {
    previewReportBuilderMock.mockRejectedValue(
      new ApiError(409, "El reporte COTIZACION no tiene builder configurado."),
    );
    getReportBuilderMock.mockResolvedValue(SAVED_BUILDER);
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /Generar vista previa/ }));
    expect(await screen.findByText("El reporte COTIZACION no tiene builder configurado.")).toBeTruthy();
  });

  it("refuses to preview unsaved changes", async () => {
    getReportBuilderMock.mockResolvedValue(SAVED_BUILDER);
    const user = userEvent.setup();
    renderWorkspace();
    await user.type(await screen.findByLabelText("Etiqueta"), "!");
    expect(await screen.findByText(/Guarda el constructor antes de previsualizar/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Generar vista previa/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
