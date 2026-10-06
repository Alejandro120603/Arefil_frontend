// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportBuilderWorkspace } from "./report-builder-workspace";
import { useReportBuilderDraft, type ReportBuilderDraft } from "@/hooks/use-report-builder-draft";
import { ApiError } from "@/lib/api/errors";
import { builderFormFromDefinition, toBuilderRequest } from "@/lib/reports/report-builder";
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
  listAllReportParameterOptionsMock,
  resolveReportProductOptionMock,
  searchReportProductOptionsMock,
} = vi.hoisted(() => ({
  getReportBuilderMock: vi.fn(),
  getReportFieldCatalogMock: vi.fn(),
  saveReportBuilderMock: vi.fn(),
  previewReportBuilderMock: vi.fn(),
  listAllReportParameterOptionsMock: vi.fn(),
  resolveReportProductOptionMock: vi.fn(),
  searchReportProductOptionsMock: vi.fn(),
}));

vi.mock("@/lib/api/reports", () => ({
  getReportBuilder: getReportBuilderMock,
  getReportFieldCatalog: getReportFieldCatalogMock,
  saveReportBuilder: saveReportBuilderMock,
  previewReportBuilder: previewReportBuilderMock,
  listAllReportParameterOptions: listAllReportParameterOptionsMock,
  resolveReportProductOption: resolveReportProductOptionMock,
  searchReportProductOptions: searchReportProductOptionsMock,
}));

const FIELDS: ReportFieldDescriptor[] = [
  { key: "product.part_number", label: "Número de parte", data_type: "string", group: "Producto", required_context: "product" },
  { key: "price_list_item.unit_price", label: "Precio unitario", data_type: "decimal", group: "Item de lista", required_context: "price_list_item" },
];

const QUANTITY: ReportParameter = {
  name: "quantity", label: "Cantidad", data_type: "integer", input_type: "number",
  required: true, default_value: 1, display_order: 0, configuration_json: null,
};

const CUSTOMER: ReportParameter = {
  name: "customer_name", label: "Cliente", data_type: "string", input_type: "text",
  required: false, default_value: null, display_order: 1, configuration_json: null,
};

const PRICE_LIST: ReportParameter = {
  name: "price_list_id", label: "Lista de precios", data_type: "integer", input_type: "select",
  required: true, default_value: null, display_order: 2, configuration_json: { options_source: "price_lists" },
};

const REPORT = {
  code: "COTIZACION", name: "Cotización", description: null, category: null, filename_template: null, enabled: true,
  data_source_id: 5,
  data_source: {
    id: 5, code: "QUOTATION_ROWS", name: "Renglones de cotización",
    description: null, enabled: true, capabilities: ["REPEATABLE_ROWS"],
  },
  parameters: [QUANTITY],
  parameter_groups: [],
  created_at: "2026-08-26T00:00:00Z", updated_at: "2026-08-26T00:00:00Z",
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
  listAllReportParameterOptionsMock.mockResolvedValue([]);
  searchReportProductOptionsMock.mockResolvedValue([]);
  resolveReportProductOptionMock.mockResolvedValue(null);
});

afterEach(cleanup);

/** The workspace is controlled: like the wizard, this harness owns the builder through the shared hook. */
function WorkspaceWithBuilder({ parameters }: { parameters: ReportParameter[] }) {
  const builder = useReportBuilderDraft("COTIZACION");
  return (
    <ReportBuilderWorkspace
      code="COTIZACION"
      builder={builder}
      parameters={parameters}
    />
  );
}

function renderWorkspace(parameters: ReportParameter[] = [QUANTITY]) {
  return render(<WorkspaceWithBuilder parameters={parameters} />);
}

async function addFieldColumn(user: ReturnType<typeof userEvent.setup>, fieldKey: string) {
  const select = await screen.findByLabelText("Agregar dato de la fuente");
  await user.selectOptions(select, fieldKey);
}

describe("ReportBuilderWorkspace", () => {
  it("never loads the builder itself: it renders and edits the draft it is given", async () => {
    const updateDraft = vi.fn();
    const save = vi.fn().mockResolvedValue(SAVED_BUILDER);
    const builder: ReportBuilderDraft = {
      code: "COTIZACION", loading: false, loadError: null, catalogError: null, fields: FIELDS,
      draft: builderFormFromDefinition(SAVED_BUILDER), persisted: SAVED_BUILDER, dirty: false, saving: false,
      groupsDirty: false, updateDraft, save, saveGroups: vi.fn(), reload: vi.fn(),
    };
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<ReportBuilderWorkspace code="COTIZACION" builder={builder} parameters={[QUANTITY]} onSaved={onSaved} />);

    expect((screen.getByLabelText("Título de columna") as HTMLInputElement).value).toBe("SKU");
    expect(getReportBuilderMock).not.toHaveBeenCalled();
    expect(getReportFieldCatalogMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Título de columna"), "!");
    expect(updateDraft).toHaveBeenCalled();
    const [update] = updateDraft.mock.calls.at(-1)!;
    expect(update(builderFormFromDefinition(SAVED_BUILDER)).columns[0].label).toBe("SKU!");

    await user.click(screen.getByRole("button", { name: /Guardar constructor/ }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(saveReportBuilderMock).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("sends exactly the PUT payload the workspace built before #41A", async () => {
    const legacy: ReportBuilderDefinition = {
      ...SAVED_BUILDER,
      columns: [
        SAVED_BUILDER.columns[0],
        { ...SAVED_BUILDER.columns[0], key: "price", label: "Precio", source_field: "price_list_item.unit_price", data_type: "decimal", format_type: "currency", display_order: 1, width: null },
        { ...SAVED_BUILDER.columns[0], key: "line_total", label: "Importe", column_type: "FORMULA", source_field: null, formula_definition: "price * quantity", data_type: "decimal", format_type: "currency", display_order: 2, width: null },
      ],
      excel_layout: {
        ...SAVED_BUILDER.excel_layout!,
        totals: [
          { key: "subtotal", label: "Subtotal", column_key: "line_total", operation: "SUM", formula_definition: null, format_type: "currency" },
          { key: "tax", label: "IVA", column_key: null, operation: "FORMULA", formula_definition: "subtotal * 0.16", format_type: "currency" },
        ],
      },
    };
    getReportBuilderMock.mockResolvedValue(legacy);
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByDisplayValue("IVA");
    await user.click(screen.getByRole("button", { name: /Guardar constructor/ }));

    await waitFor(() => expect(saveReportBuilderMock).toHaveBeenCalledTimes(1));
    // `toBuilderRequest(builderFormFromDefinition(...))` is exactly what the
    // workspace computed from its own state before the builder moved to the wizard.
    expect(saveReportBuilderMock).toHaveBeenCalledWith("COTIZACION", toBuilderRequest(builderFormFromDefinition(legacy)));
    expect(getReportBuilderMock).toHaveBeenCalledTimes(1);
  });

  it("loads the field catalog from the backend and groups it for the user", async () => {
    renderWorkspace();
    const select = await screen.findByLabelText("Agregar dato de la fuente");
    expect(getReportFieldCatalogMock).toHaveBeenCalled();
    expect(within(select).getByRole("group", { name: "Producto" })).toBeTruthy();
    // Only the business label is shown; the catalog key stays internal.
    expect(within(select).getByRole("option", { name: "Número de parte" })).toBeTruthy();
    expect(within(select).queryByText(/product\.part_number/)).toBeNull();
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
    expect(((await screen.findByLabelText("Título de columna")) as HTMLInputElement).value).toBe("SKU");
    expect(((await screen.findByLabelText("Ancho")) as HTMLInputElement).value).toBe("18");
    expect(((await screen.findByLabelText("Nombre de hoja")) as HTMLInputElement).value).toBe("Cotización");
  });

  it("adds a FIELD column bound to a catalog key, without Origen or Nombre interno", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await addFieldColumn(user, "price_list_item.unit_price");

    expect(screen.getByText(/Dato de la fuente · Item de lista → Precio unitario/)).toBeTruthy();
    const source = screen.getByLabelText("Dato que muestra") as HTMLSelectElement;
    expect(source.value).toBe("price_list_item.unit_price");
    expect(source.selectedOptions[0].textContent).toBe("Item de lista → Precio unitario");
    expect(within(source).queryByText(/price_list_item\.unit_price/)).toBeNull();
    expect(screen.queryByLabelText("Origen")).toBeNull();
    expect(screen.queryByLabelText("Nombre interno")).toBeNull();
    expect(screen.queryByText("Origen")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Guardar constructor/ }));
    await waitFor(() => expect(saveReportBuilderMock).toHaveBeenCalledTimes(1));
    expect(saveReportBuilderMock.mock.calls[0][1].columns).toEqual([{
      key: "unit_price", label: "Precio unitario", column_type: "FIELD",
      source_field: "price_list_item.unit_price", source_parameter: null, formula_definition: null,
      data_type: "decimal", format_type: "number", display_order: 0, visible: true, width: null,
    }]);
  });

  it("generates unique hidden keys for new columns", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await addFieldColumn(user, "price_list_item.unit_price");
    await addFieldColumn(user, "price_list_item.unit_price");
    await user.click(screen.getByRole("button", { name: "Agregar cálculo" }));
    await user.click(screen.getByRole("button", { name: "Agregar cálculo" }));
    await user.type(screen.getByLabelText("Fórmula", { selector: "#column-formula-2" }), "unit_price * 2");
    await user.type(screen.getByLabelText("Fórmula", { selector: "#column-formula-3" }), "unit_price_2 * 3");
    await user.click(screen.getByRole("button", { name: /Guardar constructor/ }));

    await waitFor(() => expect(saveReportBuilderMock).toHaveBeenCalledTimes(1));
    expect(saveReportBuilderMock.mock.calls[0][1].columns.map((column: { key: string }) => column.key)).toEqual([
      "unit_price", "unit_price_2", "calculo", "calculo_2",
    ]);
    expect(saveReportBuilderMock.mock.calls[0][1].columns.map((column: { column_type: string }) => column.column_type)).toEqual([
      "FIELD", "FIELD", "FORMULA", "FORMULA",
    ]);
  });

  it("re-points a FIELD column through Dato que muestra, keeping its key and a valid type", async () => {
    getReportBuilderMock.mockResolvedValue(SAVED_BUILDER);
    const user = userEvent.setup();
    renderWorkspace();
    await user.selectOptions(await screen.findByLabelText("Dato que muestra"), "price_list_item.unit_price");
    await user.click(screen.getByRole("button", { name: /Guardar constructor/ }));

    await waitFor(() => expect(saveReportBuilderMock).toHaveBeenCalledTimes(1));
    expect(saveReportBuilderMock.mock.calls[0][1].columns[0]).toMatchObject({
      key: "part_number", label: "SKU", column_type: "FIELD", source_field: "price_list_item.unit_price",
      data_type: "decimal", format_type: "text",
    });
  });

  it("adds a PARAMETER column by its business label and sends the real parameter name", async () => {
    const user = userEvent.setup();
    renderWorkspace([QUANTITY, CUSTOMER]);
    const select = await screen.findByLabelText("Agregar dato capturado");
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "¿Qué dato capturado quieres mostrar?", "Cantidad", "Cliente",
    ]);
    await user.selectOptions(select, "customer_name");

    expect(screen.getByText(/Dato capturado · Cliente/)).toBeTruthy();
    const source = screen.getByLabelText("Dato capturado que muestra") as HTMLSelectElement;
    expect(source.selectedOptions[0].textContent).toBe("Cliente");
    expect(screen.queryByText(/customer_name/)).toBeNull();
    expect(screen.queryByLabelText("Nombre interno")).toBeNull();
    // The parameter is consumed, so it is no longer offered a second time.
    expect(within(await screen.findByLabelText("Agregar dato capturado")).getAllByRole("option").map((option) => option.textContent))
      .toEqual(["¿Qué dato capturado quieres mostrar?", "Cantidad"]);

    await user.click(screen.getByRole("button", { name: /Guardar constructor/ }));
    await waitFor(() => expect(saveReportBuilderMock).toHaveBeenCalledTimes(1));
    expect(saveReportBuilderMock.mock.calls[0][1].columns).toEqual([{
      key: "customer_name", label: "Cliente", column_type: "PARAMETER",
      source_field: null, source_parameter: "customer_name", formula_definition: null,
      data_type: "string", format_type: "text", display_order: 0, visible: true, width: null,
    }]);
  });

  it("keeps saved columns' keys and sources when only their titles change", async () => {
    getReportBuilderMock.mockResolvedValue({
      ...SAVED_BUILDER,
      columns: [
        { ...SAVED_BUILDER.columns[0], key: "price", label: "Precio unitario", source_field: "price_list_item.unit_price", data_type: "decimal", format_type: "currency" },
        { ...SAVED_BUILDER.columns[0], key: "customer", label: "Cliente", column_type: "PARAMETER", source_field: null, source_parameter: "customer_name", display_order: 1 },
        { ...SAVED_BUILDER.columns[0], key: "subtotal", label: "Subtotal", column_type: "FORMULA", source_field: null, formula_definition: "price * 2", data_type: "decimal", format_type: "currency", display_order: 2 },
      ],
    });
    const user = userEvent.setup();
    renderWorkspace([QUANTITY, CUSTOMER]);

    expect(((await screen.findByLabelText("Dato que muestra")) as HTMLSelectElement).selectedOptions[0].textContent)
      .toBe("Item de lista → Precio unitario");
    expect((screen.getByLabelText("Dato capturado que muestra") as HTMLSelectElement).selectedOptions[0].textContent)
      .toBe("Cliente");
    expect((screen.getByLabelText("Fórmula") as HTMLInputElement).value).toBe("price * 2");
    expect(screen.queryByLabelText("Origen")).toBeNull();
    expect(screen.queryByLabelText("Nombre interno")).toBeNull();

    const titles = screen.getAllByLabelText("Título de columna");
    await user.clear(titles[0]);
    await user.type(titles[0], "Precio");
    await user.type(titles[2], " neto");
    await user.click(screen.getByRole("button", { name: /Guardar constructor/ }));

    await waitFor(() => expect(saveReportBuilderMock).toHaveBeenCalledTimes(1));
    expect(saveReportBuilderMock.mock.calls[0][1].columns).toEqual([
      expect.objectContaining({ key: "price", label: "Precio", column_type: "FIELD", source_field: "price_list_item.unit_price", source_parameter: null }),
      expect.objectContaining({ key: "customer", label: "Cliente", column_type: "PARAMETER", source_field: null, source_parameter: "customer_name" }),
      expect.objectContaining({ key: "subtotal", label: "Subtotal neto", column_type: "FORMULA", formula_definition: "price * 2" }),
    ]);
  });

  it("adds a FORMULA column that only offers numeric references", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await addFieldColumn(user, "product.part_number");
    await addFieldColumn(user, "price_list_item.unit_price");
    await user.click(screen.getByRole("button", { name: "Agregar cálculo" }));

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
    await user.click(screen.getByRole("button", { name: "Agregar cálculo" }));

    await user.selectOptions(await screen.findByLabelText("Insertar referencia"), "unit_price");
    await user.click(screen.getByRole("button", { name: "Insertar *" }));
    await user.selectOptions(screen.getByLabelText("Insertar referencia"), "quantity");

    expect((screen.getByLabelText("Fórmula") as HTMLInputElement).value).toBe("unit_price * quantity ");
  });

  it("flags an unknown formula reference inline", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: "Agregar cálculo" }));
    await user.type(screen.getByLabelText("Fórmula"), "precio_inventado * 2");
    expect(screen.getByText(/Referencias desconocidas: precio_inventado/)).toBeTruthy();
  });

  it("reorders, hides and removes columns without leaving inconsistent state", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await addFieldColumn(user, "product.part_number");
    await addFieldColumn(user, "price_list_item.unit_price");

    const labels = () => screen.getAllByLabelText("Título de columna").map((input) => (input as HTMLInputElement).value);
    expect(labels()).toEqual(["Número de parte", "Precio unitario"]);

    await user.click(screen.getByRole("button", { name: "Mover Precio unitario arriba" }));
    expect(labels()).toEqual(["Precio unitario", "Número de parte"]);

    await user.click(screen.getAllByLabelText("Visible")[0]);
    expect(screen.getByText("Oculta")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Eliminar Precio unitario" }));
    expect(labels()).toEqual(["Número de parte"]);
  });

  it("blocks a save that the backend would reject and keeps the edits on screen", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: "Agregar cálculo" }));
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

  it("no longer configures repeatable rows, but its columns still read them and saving resends them intact", async () => {
    const items = {
      name: "items", label: "Productos", resolver_key: "products_by_price_list" as const, context_parameter: "price_list_id",
      min_items: 1, max_items: null, display_order: 0,
      fields: [
        { name: "product_id", label: "Producto", data_type: "integer" as const, input_type: "select" as const, required: true, default_value: null, display_order: 0, configuration_json: { options_source: "products_by_price_list" as const, context_parameter: "price_list_id" } },
        { name: "quantity", label: "Cantidad", data_type: "integer" as const, input_type: "number" as const, required: true, default_value: 1, display_order: 1, configuration_json: { minimum: 0, exclusive_minimum: true } },
        { name: "discount", label: "Descuento", data_type: "decimal" as const, input_type: "number" as const, required: false, default_value: null, display_order: 2, configuration_json: { minimum: 0 } },
      ],
    };
    const quantityColumn = {
      key: "quantity", label: "Cantidad", column_type: "PARAMETER" as const, source_field: null, source_parameter: "items.quantity",
      formula_definition: null, data_type: "integer" as const, format_type: "number" as const, display_order: 0, visible: true, width: null,
    };
    getReportBuilderMock.mockResolvedValue({ ...SAVED_BUILDER, columns: [quantityColumn], parameter_groups: [items] });
    const user = userEvent.setup();
    renderWorkspace([PRICE_LIST]);

    const addCaptured = await screen.findByLabelText("Agregar dato capturado");
    expect(screen.queryByText("Productos por renglón")).toBeNull();
    expect(screen.queryByLabelText("Nombre visible del grupo")).toBeNull();
    expect(within(addCaptured).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "¿Qué dato capturado quieres mostrar?", "Lista de precios", "Productos → Producto", "Productos → Descuento",
    ]);
    expect((screen.getByLabelText("Dato capturado que muestra") as HTMLSelectElement).selectedOptions[0].textContent).toBe("Productos → Cantidad");

    await user.click(screen.getByRole("button", { name: /Guardar constructor/ }));
    await waitFor(() => expect(saveReportBuilderMock).toHaveBeenCalledTimes(1));
    const request = saveReportBuilderMock.mock.calls[0][1];
    expect(request.parameter_groups).toEqual([items]);
    expect(request.columns).toEqual([quantityColumn]);
  });

  it("surfaces the backend save error and preserves the edited state", async () => {
    saveReportBuilderMock.mockRejectedValue(new ApiError(422, "Las fórmulas contienen una dependencia cíclica."));
    const user = userEvent.setup();
    renderWorkspace();
    await addFieldColumn(user, "product.part_number");
    await user.click(screen.getByRole("button", { name: /Guardar constructor/ }));

    expect(await screen.findByText("Las fórmulas contienen una dependencia cíclica.")).toBeTruthy();
    expect(((await screen.findByLabelText("Título de columna")) as HTMLInputElement).value).toBe("Número de parte");
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

  it("renders the builder preview natively", async () => {
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

  it("configures Subtotal and IVA as report-level summaries and saves them with the builder", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await addFieldColumn(user, "price_list_item.unit_price");

    const addTotal = screen.getByLabelText("Agregar total de columna");
    // Columns are offered by their title, never by their hidden key.
    expect(within(addTotal).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "¿Qué columna quieres totalizar?", "Precio unitario",
    ]);
    await user.selectOptions(addTotal, "unit_price");
    await user.clear(screen.getByLabelText("Título", { selector: "#summary-label-0" }));
    await user.type(screen.getByLabelText("Título", { selector: "#summary-label-0" }), "Subtotal");
    const totalColumn = screen.getByLabelText("Columna a totalizar") as HTMLSelectElement;
    expect(totalColumn.selectedOptions[0].textContent).toBe("Precio unitario");
    expect(screen.getByText("Total de columna · Precio unitario")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Agregar total calculado" }));
    await user.clear(screen.getByLabelText("Título", { selector: "#summary-label-1" }));
    await user.type(screen.getByLabelText("Título", { selector: "#summary-label-1" }), "IVA");
    // The formula editor still lists the identifiers the DSL uses.
    await user.selectOptions(screen.getByLabelText("Insertar referencia", { selector: "#summary-formula-1-reference" }), "unit_price");
    await user.type(screen.getByLabelText("Fórmula", { selector: "#summary-formula-1" }), "* quantity");

    expect(screen.queryByLabelText("Origen")).toBeNull();
    expect(screen.queryByLabelText("Nombre interno")).toBeNull();
    expect(screen.queryByText(/SUM/)).toBeNull();

    await user.click(screen.getByRole("button", { name: /Guardar constructor/ }));

    await waitFor(() => expect(saveReportBuilderMock).toHaveBeenCalledTimes(1));
    expect(saveReportBuilderMock.mock.calls[0][1].excel_layout.totals).toEqual([
      { key: "unit_price", label: "Subtotal", column_key: "unit_price", operation: "SUM", formula_definition: null, format_type: "number" },
      { key: "resumen", label: "IVA", column_key: null, operation: "FORMULA", formula_definition: "unit_price * quantity", format_type: "number" },
    ]);
  });

  it("keeps saved summary keys when their titles change", async () => {
    getReportBuilderMock.mockResolvedValue({
      ...SAVED_BUILDER,
      columns: [{ ...SAVED_BUILDER.columns[0], key: "line_total", label: "Importe", source_field: "price_list_item.unit_price", data_type: "decimal", format_type: "currency" }],
      excel_layout: {
        ...SAVED_BUILDER.excel_layout!,
        totals: [
          { key: "subtotal", label: "Subtotal", column_key: "line_total", operation: "SUM", formula_definition: null, format_type: "currency" },
          { key: "tax", label: "IVA", column_key: null, operation: "FORMULA", formula_definition: "subtotal * 0.16", format_type: "currency" },
        ],
      },
    });
    const user = userEvent.setup();
    renderWorkspace();

    const totalColumn = (await screen.findByLabelText("Columna a totalizar")) as HTMLSelectElement;
    expect(totalColumn.selectedOptions[0].textContent).toBe("Importe");
    expect(within(totalColumn).queryByText(/line_total/)).toBeNull();
    expect((screen.getByLabelText("Fórmula", { selector: "#summary-formula-1" }) as HTMLInputElement).value).toBe("subtotal * 0.16");
    expect(screen.queryByLabelText("Nombre interno")).toBeNull();

    await user.clear(screen.getByLabelText("Título", { selector: "#summary-label-0" }));
    await user.type(screen.getByLabelText("Título", { selector: "#summary-label-0" }), "Suma");
    await user.type(screen.getByLabelText("Título", { selector: "#summary-label-1" }), " 16%");
    await user.click(screen.getByRole("button", { name: /Guardar constructor/ }));

    await waitFor(() => expect(saveReportBuilderMock).toHaveBeenCalledTimes(1));
    expect(saveReportBuilderMock.mock.calls[0][1].excel_layout.totals).toEqual([
      { key: "subtotal", label: "Suma", column_key: "line_total", operation: "SUM", formula_definition: null, format_type: "currency" },
      { key: "tax", label: "IVA 16%", column_key: null, operation: "FORMULA", formula_definition: "subtotal * 0.16", format_type: "currency" },
    ]);
  });

  it("refuses a summary formula the backend would reject", async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await addFieldColumn(user, "price_list_item.unit_price");
    await user.click(screen.getByRole("button", { name: "Agregar total calculado" }));
    await user.type(screen.getByLabelText("Fórmula", { selector: "#summary-formula-0" }), "unit_price + 1");
    await user.click(screen.getByRole("button", { name: /Guardar constructor/ }));

    expect(await screen.findByText("El resumen 'resumen' referencia 'unit_price', que no existe.")).toBeTruthy();
    expect(saveReportBuilderMock).not.toHaveBeenCalled();
  });

  it("renders the backend summary with the labels the builder declared", async () => {
    getReportBuilderMock.mockResolvedValue({
      ...SAVED_BUILDER,
      excel_layout: {
        ...SAVED_BUILDER.excel_layout!,
        totals: [
          { key: "subtotal", label: "Subtotal", column_key: "part_number", operation: "SUM", formula_definition: null, format_type: "currency" },
          { key: "tax", label: "IVA", column_key: null, operation: "FORMULA", formula_definition: "subtotal * 0.16", format_type: "currency" },
          { key: "grand_total", label: "Total", column_key: null, operation: "FORMULA", formula_definition: "subtotal + tax", format_type: "currency" },
        ],
      },
    });
    previewReportBuilderMock.mockResolvedValue({
      columns: [{ key: "part_number", label: "SKU", data_type: "string", format_type: "text" }],
      parameters: { quantity: 4 },
      rows: [{ part_number: "P181050" }],
      summary: { subtotal: "1000.00", tax: "160.00", grand_total: "1160.00" },
      totals: { subtotal: "1000.00", tax: "160.00", grand_total: "1160.00" },
      row_count: 1,
      truncated: false,
    } satisfies ReportBuilderPreviewResponse);

    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole("button", { name: /Generar vista previa/ }));

    expect(await screen.findByText("$1,160.00")).toBeTruthy();
    const summary = screen.getByText("$1,160.00").closest("dl") as HTMLElement;
    expect(within(summary).getByText("Subtotal")).toBeTruthy();
    expect(within(summary).getByText("IVA")).toBeTruthy();
    expect(within(summary).getByText("Total")).toBeTruthy();
    expect(within(summary).getByText("$160.00")).toBeTruthy();
    // The parameters the backend actually ran with, labelled by the report.
    expect(screen.getByText("Cantidad:")).toBeTruthy();
  });

  it("refuses to preview unsaved changes", async () => {
    getReportBuilderMock.mockResolvedValue(SAVED_BUILDER);
    const user = userEvent.setup();
    renderWorkspace();
    await user.type(await screen.findByLabelText("Título de columna"), "!");
    expect(await screen.findByText(/Guarda el constructor antes de previsualizar/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Generar vista previa/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
