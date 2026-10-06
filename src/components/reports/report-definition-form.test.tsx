// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportDefinitionForm } from "./report-definition-form";
import type { ReportAdminDefinition, ReportBuilderDefinition, ReportDataSource, ReportDefinition } from "@/types/api";

const {
  push,
  refresh,
  createReport,
  updateReportInputs,
  listReportDataSources,
  listAllReportParameterOptions,
} = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  createReport: vi.fn(),
  updateReportInputs: vi.fn(),
  listReportDataSources: vi.fn(),
  listAllReportParameterOptions: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/api/reports", () => ({
  createReport,
  updateReportInputs,
  listReportDataSources,
  listAllReportParameterOptions,
}));

const PRODUCT_SOURCE: ReportDataSource = {
  id: 1,
  code: "PRODUCT_CATALOG",
  name: "Catálogo de productos",
  description: "Catálogo actual de productos disponibles.",
  enabled: true,
  capabilities: [],
  parameters: [],
  fields: [
    { key: "product.part_number", label: "Número de parte", data_type: "string", group: "Producto", required_context: "product" },
  ],
};

const HISTORY_SOURCE: ReportDataSource = {
  id: 2,
  code: "PRICE_HISTORY",
  name: "Historial de precios",
  description: "Evolución cronológica del precio.",
  enabled: true,
  capabilities: [],
  parameters: [{
    name: "product_id",
    label: "Producto",
    data_type: "integer",
    input_type: "select",
    required: true,
    default_value: null,
    display_order: 0,
    configuration_json: { options_source: "products" },
  }],
  fields: [
    { key: "price_history.absolute_change", label: "Cambio absoluto", data_type: "decimal", group: "Historial", required_context: "price_history" },
  ],
};

const PRICE_LIST_PARAMETER = {
  name: "price_list_id",
  label: "Lista de precios",
  data_type: "integer" as const,
  input_type: "select" as const,
  required: true,
  default_value: null,
  display_order: 0,
  configuration_json: { options_source: "price_lists" as const },
};

const QUOTATION_SOURCE: ReportDataSource = {
  id: 3,
  code: "QUOTATION_ROWS",
  name: "Renglones de cotización",
  description: "Renglones capturados por producto.",
  enabled: true,
  capabilities: ["REPEATABLE_ROWS"],
  parameters: [PRICE_LIST_PARAMETER],
  fields: [
    { key: "system.row_number", label: "Número de renglón", data_type: "integer", group: "Sistema", required_context: "row" },
  ],
};

const REPORT: ReportAdminDefinition = {
  code: "PRODUCT_REPORT",
  name: "Catálogo",
  description: "Productos",
  category: "Catálogo",
  filename_template: null,
  enabled: true,
  data_source_id: PRODUCT_SOURCE.id,
  data_source: PRODUCT_SOURCE,
  parameters: [],
  parameter_groups: [],
  created_at: "2026-08-25T12:00:00Z",
  updated_at: "2026-08-25T12:00:00Z",
};

const QUOTATION_REPORT: ReportAdminDefinition = {
  ...REPORT,
  code: "COTIZACION",
  name: "Cotización",
  data_source_id: QUOTATION_SOURCE.id,
  data_source: QUOTATION_SOURCE,
  parameters: [PRICE_LIST_PARAMETER],
};

function inputsResponse(report: ReportAdminDefinition): ReportBuilderDefinition {
  return { report, columns: [], parameter_groups: report.parameter_groups, excel_layout: null };
}

function extraSection(): HTMLElement {
  return screen.getByRole("region", { name: "Datos adicionales que capturará el usuario" });
}

async function addPreset(user: ReturnType<typeof userEvent.setup>, label: string): Promise<void> {
  const quickAdd = within(extraSection()).getByRole("group", { name: "Agregar rápido" });
  await user.click(within(quickAdd).getByRole("button", { name: label }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  listReportDataSources.mockResolvedValue([PRODUCT_SOURCE, HISTORY_SOURCE, QUOTATION_SOURCE]);
  listAllReportParameterOptions.mockResolvedValue([
    { value: 17, label: "Donaldson · 2026-01-01 · MXN" },
  ]);
});

describe("ReportDefinitionForm", () => {
  it("loads reusable sources and never renders technical executors or SQL", async () => {
    render(<ReportDefinitionForm />);

    expect(await screen.findByRole("option", { name: "Catálogo de productos" })).toBeTruthy();
    expect(screen.queryByText("SQL_QUERY")).toBeNull();
    expect(screen.queryByText("HANDLER")).toBeNull();
    expect(screen.queryByLabelText("Consulta")).toBeNull();
    expect(listReportDataSources).toHaveBeenCalledTimes(1);
  });

  it("selects a source, shows metadata, and creates without query_text", async () => {
    const user = userEvent.setup();
    createReport.mockResolvedValue({ ...REPORT } satisfies ReportDefinition);
    render(<ReportDefinitionForm />);

    await screen.findByRole("option", { name: "Catálogo de productos" });
    await user.type(screen.getByLabelText("Nombre"), "Catálogo");
    await user.type(screen.getByLabelText("Código"), "product-report");
    await user.selectOptions(screen.getByLabelText("Fuente de datos"), String(PRODUCT_SOURCE.id));

    expect(screen.getByText(PRODUCT_SOURCE.description!)).toBeTruthy();
    // The field catalog belongs to the builder step; the source card only helps choose a source.
    expect(screen.queryByText("Número de parte")).toBeNull();
    expect(screen.queryByText("Campos disponibles")).toBeNull();
    expect(screen.queryByText("Parámetros requeridos")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Crear reporte" }));

    await waitFor(() => expect(createReport).toHaveBeenCalledTimes(1));
    expect(createReport.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      code: "PRODUCT_REPORT",
      data_source_id: PRODUCT_SOURCE.id,
      enabled: true,
      parameters: [],
    }));
    expect(createReport.mock.calls[0]?.[0]).not.toHaveProperty("query_text");
    expect(createReport.mock.calls[0]?.[0]).not.toHaveProperty("data_source_type");
    expect(push).toHaveBeenCalledWith("/administracion/reportes/PRODUCT_REPORT/configurar");
  });

  it("shows source parameters as friendly required data without any technical metadata", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    render(<ReportDefinitionForm />);
    await screen.findByRole("option", { name: "Historial de precios" });

    await user.selectOptions(screen.getByLabelText("Fuente de datos"), String(HISTORY_SOURCE.id));

    const sourceSection = screen.getByRole("region", { name: "Datos que pide la fuente" });
    const productField = within(sourceSection).getByRole("group", { name: "Producto" });
    expect(within(productField).getByText("Obligatorio")).toBeTruthy();
    expect(within(productField).getByText(/seleccionará un producto/)).toBeTruthy();
    expect(within(productField).queryByDisplayValue("product_id")).toBeNull();
    expect(within(productField).queryByLabelText("Tipo")).toBeNull();
    expect(within(productField).queryByLabelText("Tipo de entrada")).toBeNull();
    expect(within(productField).queryByLabelText("Control")).toBeNull();
    expect(within(productField).queryByLabelText("Fuente de opciones")).toBeNull();
    expect(within(productField).queryByRole("checkbox")).toBeNull();
    expect(within(productField).queryByText("Ver configuración técnica")).toBeNull();
    for (const technical of ["product_id", "integer", "select", "products", "options_source"]) {
      expect(within(productField).queryByText(technical)).toBeNull();
    }
    const defaultValue = within(productField).getByLabelText(/Valor predeterminado/) as HTMLSelectElement;
    expect(defaultValue.tagName).toBe("SELECT");
    expect(defaultValue.disabled).toBe(true);
    expect(within(productField).getByText(
      "Podrás elegir un valor predeterminado después de crear el reporte.",
    )).toBeTruthy();
    expect(listAllReportParameterOptions).not.toHaveBeenCalled();
    expect(screen.queryByText("Cambio absoluto")).toBeNull();
    expect((within(productField).getByLabelText("Nombre visible") as HTMLInputElement).value)
      .toBe("Producto");
    expect(within(extraSection()).getByText(/todavía no pide datos adicionales/)).toBeTruthy();
  });

  it("separates the source contract from the report's own parameters and saves both", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    updateReportInputs.mockResolvedValue(inputsResponse({ ...QUOTATION_REPORT }));
    render(<ReportDefinitionForm report={QUOTATION_REPORT} />);
    await screen.findByRole("option", { name: "Renglones de cotización" });

    const sourceSection = screen.getByRole("region", { name: "Datos que pide la fuente" });
    const priceListField = within(sourceSection).getByRole("group", { name: "Lista de precios" });
    expect(within(priceListField).queryByDisplayValue("price_list_id")).toBeNull();
    expect(within(priceListField).getByText("Obligatorio")).toBeTruthy();
    expect(await within(priceListField).findByRole("option", {
      name: "Donaldson · 2026-01-01 · MXN",
    })).toBeTruthy();
    await user.selectOptions(
      within(priceListField).getByLabelText(/Valor predeterminado/),
      "17",
    );
    const sourceLabel = within(priceListField).getByLabelText("Nombre visible");
    await user.clear(sourceLabel);
    await user.type(sourceLabel, "Lista base");

    await addPreset(user, "Cliente");
    await addPreset(user, "IVA %");
    // A report input stays editable, unlike the source contract above, and
    // never shows its internal name.
    const customer = within(extraSection()).getByRole("group", { name: "Cliente" });
    expect((within(customer).getByLabelText("Nombre visible") as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByDisplayValue("customer_name")).toBeNull();
    const tax = within(extraSection()).getByRole("group", { name: "IVA %" });
    expect((within(tax).getByLabelText("Tipo de entrada") as HTMLSelectElement).value).toBe("number");
    expect((within(tax).getByLabelText("Permitir decimales") as HTMLInputElement).checked).toBe(true);

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(updateReportInputs).toHaveBeenCalledTimes(1));
    expect(updateReportInputs.mock.calls[0]?.[1].parameters).toEqual([
      expect.objectContaining({
        name: "price_list_id",
        label: "Lista base",
        data_type: "integer",
        input_type: "select",
        required: true,
        default_value: 17,
        display_order: 0,
        configuration_json: { options_source: "price_lists" },
      }),
      expect.objectContaining({ name: "customer_name", label: "Cliente", data_type: "string", display_order: 1 }),
      expect.objectContaining({
        name: "tax_rate", label: "IVA %", data_type: "decimal", input_type: "number", display_order: 2,
      }),
    ]);
    expect(listAllReportParameterOptions).toHaveBeenCalledWith(
      "COTIZACION",
      "price_list_id",
      undefined,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("keeps the report's own parameters when the data source changes", async () => {
    const user = userEvent.setup();
    render(<ReportDefinitionForm report={QUOTATION_REPORT} />);
    await screen.findByRole("option", { name: "Historial de precios" });

    await addPreset(user, "Cliente");
    await user.selectOptions(screen.getByLabelText("Fuente de datos"), String(HISTORY_SOURCE.id));
    await user.click(screen.getByRole("button", { name: "Cambiar fuente" }));

    expect(within(extraSection()).getByRole("group", { name: "Cliente" })).toBeTruthy();
    const sourceSection = screen.getByRole("region", { name: "Datos que pide la fuente" });
    expect(within(sourceSection).queryByRole("group", { name: "Lista de precios" })).toBeNull();
    expect(within(sourceSection).getByRole("group", { name: "Producto" })).toBeTruthy();
  });

  it("refuses to save a report that dropped a parameter its source requires", async () => {
    const user = userEvent.setup();
    render(<ReportDefinitionForm report={{ ...QUOTATION_REPORT, parameters: [] }} />);
    await screen.findByRole("option", { name: "Renglones de cotización" });

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("La fuente requiere el parámetro 'price_list_id'.")).toBeTruthy();
    expect(updateReportInputs).not.toHaveBeenCalled();
  });

  it("preserves form data and surfaces catalog and create errors", async () => {
    const user = userEvent.setup();
    createReport.mockRejectedValue(new Error("network"));
    render(<ReportDefinitionForm />);
    await screen.findByRole("option", { name: "Catálogo de productos" });

    await user.type(screen.getByLabelText("Nombre"), "Sin guardar");
    await user.type(screen.getByLabelText("Código"), "FAILED_REPORT");
    await user.selectOptions(screen.getByLabelText("Fuente de datos"), String(PRODUCT_SOURCE.id));
    await user.click(screen.getByRole("button", { name: "Crear reporte" }));

    expect(await screen.findByText("No se pudo guardar el reporte. Tus cambios siguen en el formulario.")).toBeTruthy();
    expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe("Sin guardar");
    expect(push).not.toHaveBeenCalled();
  });

  it("no longer exposes any filename configuration or technical placeholder", async () => {
    render(<ReportDefinitionForm report={{ ...QUOTATION_REPORT, filename_template: "legacy_{{report.code}}" }} />);
    await screen.findByRole("option", { name: "Renglones de cotización" });

    expect(screen.queryByText(/Nombre del archivo/)).toBeNull();
    expect(screen.queryByText("Patrón del nombre")).toBeNull();
    expect(screen.queryByLabelText("Patrón del nombre")).toBeNull();
    expect(screen.queryByText(/Placeholders disponibles/)).toBeNull();
    expect(screen.queryByText(/filename_template/)).toBeNull();
    expect(screen.queryByText(/\{\{/)).toBeNull();
    expect(screen.queryByDisplayValue("legacy_{{report.code}}")).toBeNull();
    expect(screen.queryByRole("button", { name: /\{\{/ })).toBeNull();
    // Frontend #35 stays intact: source data is still summarized, not edited.
    expect(screen.getByRole("region", { name: "Datos que pide la fuente" })).toBeTruthy();
  });

  it("creates a report without sending filename_template", async () => {
    const user = userEvent.setup();
    createReport.mockResolvedValue({ ...REPORT } satisfies ReportDefinition);
    render(<ReportDefinitionForm />);
    await screen.findByRole("option", { name: "Catálogo de productos" });

    await user.type(screen.getByLabelText("Nombre"), "Catálogo");
    await user.type(screen.getByLabelText("Código"), "product-report");
    await user.selectOptions(screen.getByLabelText("Fuente de datos"), String(PRODUCT_SOURCE.id));
    await user.click(screen.getByRole("button", { name: "Crear reporte" }));

    await waitFor(() => expect(createReport).toHaveBeenCalledTimes(1));
    expect(createReport.mock.calls[0]?.[0]).toEqual({
      code: "PRODUCT_REPORT",
      name: "Catálogo",
      description: null,
      category: null,
      data_source_id: PRODUCT_SOURCE.id,
      enabled: true,
      parameters: [],
    });
  });

  it("preserves a legacy filename_template when another field is saved", async () => {
    const user = userEvent.setup();
    const legacy = { ...QUOTATION_REPORT, filename_template: "legacy_{{report.code}}" };
    updateReportInputs.mockResolvedValue(inputsResponse({ ...legacy, name: "Cotización final" }));
    render(<ReportDefinitionForm report={legacy} />);
    await screen.findByRole("option", { name: "Renglones de cotización" });

    const name = screen.getByLabelText("Nombre");
    await user.clear(name);
    await user.type(name, "Cotización final");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(updateReportInputs).toHaveBeenCalledTimes(1));
    // Omitting the key is what makes the backend's partial PATCH keep the stored
    // pattern; sending null or a new default would overwrite it.
    expect(updateReportInputs.mock.calls[0]?.[1]).not.toHaveProperty("filename_template");
    expect(updateReportInputs.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ name: "Cotización final" }));

    // A second save after the backend echoes the legacy value still leaves it alone.
    await screen.findByText("Reporte actualizado");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(updateReportInputs).toHaveBeenCalledTimes(2));
    expect(updateReportInputs.mock.calls[1]?.[1]).not.toHaveProperty("filename_template");
  });

  it("does not block saving on a legacy pattern the admin can no longer edit", async () => {
    const user = userEvent.setup();
    updateReportInputs.mockResolvedValue(inputsResponse({ ...QUOTATION_REPORT, filename_template: "{{execution.id}}" }));
    render(<ReportDefinitionForm report={{ ...QUOTATION_REPORT, filename_template: "{{execution.id}}" }} />);
    await screen.findByRole("option", { name: "Renglones de cotización" });

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(updateReportInputs).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Placeholder no permitido/)).toBeNull();
    expect(updateReportInputs.mock.calls[0]?.[1]).not.toHaveProperty("filename_template");
  });

  it("shows a migrated report whose source is now disabled", async () => {
    listReportDataSources.mockResolvedValue([HISTORY_SOURCE]);
    render(<ReportDefinitionForm report={{ ...REPORT, data_source: { ...PRODUCT_SOURCE, enabled: false } }} />);

    expect(await screen.findByText("Fuente deshabilitada")).toBeTruthy();
    expect(screen.getByRole("option", { name: /Catálogo de productos.*deshabilitada/ })).toBeTruthy();
  });

  it("keeps an internal migrated source visible only on its existing report", async () => {
    listReportDataSources.mockResolvedValue([HISTORY_SOURCE]);
    render(<ReportDefinitionForm report={REPORT} />);

    expect(await screen.findByText("Fuente no seleccionable")).toBeTruthy();
    expect(screen.getByRole("option", { name: /Catálogo de productos.*no seleccionable/ })).toBeTruthy();
    expect(screen.queryByText("SQL_QUERY")).toBeNull();
  });
});

describe("ReportDefinitionForm — datos adicionales en lenguaje de negocio", () => {
  type User = ReturnType<typeof userEvent.setup>;

  async function startCreate(user: User): Promise<void> {
    render(<ReportDefinitionForm />);
    await screen.findByRole("option", { name: "Catálogo de productos" });
    await user.type(screen.getByLabelText("Nombre"), "Catálogo");
    await user.type(screen.getByLabelText("Código"), "product-report");
    await user.selectOptions(screen.getByLabelText("Fuente de datos"), String(PRODUCT_SOURCE.id));
  }

  /** Adds an input through "Agregar dato" and returns its card, found by its visible name. */
  async function addInput(user: User, label: string, kindLabel?: string): Promise<HTMLElement> {
    await user.click(within(extraSection()).getByRole("button", { name: "Agregar dato" }));
    const cards = within(extraSection()).getAllByRole("group").filter((card) => card.hasAttribute("aria-labelledby"));
    const card = cards[cards.length - 1]!;
    await user.type(within(card).getByLabelText("Nombre visible"), label);
    if (kindLabel) await chooseKind(user, card, kindLabel);
    return card;
  }

  async function chooseKind(user: User, card: HTMLElement, kindLabel: string): Promise<void> {
    const kind = within(card).getByLabelText("Tipo de entrada");
    await user.selectOptions(kind, within(kind).getByRole("option", { name: kindLabel }));
  }

  async function createdParameters(user: User) {
    createReport.mockResolvedValue({ ...REPORT } satisfies ReportDefinition);
    await user.click(screen.getByRole("button", { name: "Crear reporte" }));
    await waitFor(() => expect(createReport).toHaveBeenCalledTimes(1));
    return createReport.mock.calls[0]?.[0].parameters;
  }

  it.each([
    ["Texto", false, "string", "text", null],
    ["Número", false, "integer", "number", null],
    ["Número", true, "decimal", "number", null],
    ["Fecha", false, "date", "date", null],
    ["Fecha y hora", false, "datetime", "datetime", null],
    ["Sí / No", false, "boolean", "checkbox", null],
    ["Lista de precios", false, "integer", "select", { options_source: "price_lists" }],
    ["Proveedor", false, "integer", "select", { options_source: "suppliers" }],
    ["Producto", false, "integer", "select", { options_source: "products" }],
  ] as const)(
    "maps '%s' (decimales: %s) to %s/%s",
    async (kindLabel, decimals, dataType, inputType, configuration) => {
      const user = userEvent.setup();
      await startCreate(user);
      const card = await addInput(user, "Dato capturado", kindLabel);
      if (decimals) await user.click(within(card).getByLabelText("Permitir decimales"));

      expect(await createdParameters(user)).toEqual([{
        name: "dato_capturado",
        label: "Dato capturado",
        data_type: dataType,
        input_type: inputType,
        required: false,
        default_value: null,
        display_order: 0,
        configuration_json: configuration,
      }]);
    },
  );

  it("offers only the business kinds, so no free data type/control combination can be built", async () => {
    const user = userEvent.setup();
    await startCreate(user);
    const card = await addInput(user, "Entrega");

    const kind = within(card).getByLabelText("Tipo de entrada") as HTMLSelectElement;
    expect([...kind.options].map((option) => option.textContent)).toEqual([
      "Texto", "Número", "Fecha", "Fecha y hora", "Sí / No", "Lista de precios", "Proveedor", "Producto",
    ]);
    expect(within(card).queryByLabelText("Tipo")).toBeNull();
    expect(within(card).queryByLabelText("Control")).toBeNull();
    expect(within(card).queryByLabelText("Fuente de opciones")).toBeNull();
    expect(within(card).queryByText("Ver configuración técnica")).toBeNull();
    expect(within(card).queryByLabelText("Nombre")).toBeNull();
    // "Permitir decimales" only exists for numbers.
    expect(within(card).queryByLabelText("Permitir decimales")).toBeNull();

    // Product → Fecha leaves no options_source behind; Número → Texto drops the number default.
    await chooseKind(user, card, "Producto");
    await chooseKind(user, card, "Fecha");
    const second = await addInput(user, "Piezas", "Número");
    await user.type(within(second).getByLabelText(/Valor predeterminado/), "5");
    await chooseKind(user, second, "Texto");

    const [date, text] = await createdParameters(user);
    expect(date).toEqual(expect.objectContaining({ data_type: "date", input_type: "date", configuration_json: null }));
    expect(text).toEqual(expect.objectContaining({ data_type: "string", input_type: "text", default_value: null }));
  });

  it("uses a native control per kind for the default value and keeps 'Sin valor' distinct from No", async () => {
    const user = userEvent.setup();
    await startCreate(user);
    const quantity = await addInput(user, "Cantidad", "Número");
    const quantityDefault = within(quantity).getByLabelText(/Valor predeterminado/) as HTMLInputElement;
    expect(quantityDefault.type).toBe("number");
    expect(quantityDefault.step).toBe("1");
    await user.click(within(quantity).getByLabelText("Permitir decimales"));
    expect(quantityDefault.step).toBe("any");
    await user.type(quantityDefault, "2.5");

    const due = await addInput(user, "Entrega", "Fecha y hora");
    expect((within(due).getByLabelText(/Valor predeterminado/) as HTMLInputElement).type).toBe("datetime-local");

    const urgent = await addInput(user, "Urgente", "Sí / No");
    const urgentDefault = within(urgent).getByLabelText(/Valor predeterminado/) as HTMLSelectElement;
    expect([...urgentDefault.options].map((option) => option.textContent)).toEqual(["Sin valor", "Sí", "No"]);

    const [savedQuantity, , savedUrgent] = await createdParameters(user);
    expect(savedQuantity).toEqual(expect.objectContaining({ data_type: "decimal", default_value: "2.5" }));
    expect(savedUrgent).toEqual(expect.objectContaining({ data_type: "boolean", default_value: null }));
  });

  it("generates a valid, unique internal name from the visible name", async () => {
    const user = userEvent.setup();
    await startCreate(user);
    await addInput(user, "Fecha de entrega", "Fecha");
    await addInput(user, "Fecha de entrega", "Fecha");
    await addInput(user, "Año fiscal");
    await addInput(user, "IVA %", "Número");

    const parameters = await createdParameters(user);
    expect(parameters.map((parameter: { name: string }) => parameter.name)).toEqual([
      "fecha_de_entrega", "fecha_de_entrega_2", "ano_fiscal", "iva",
    ]);
    for (const parameter of parameters) expect(parameter.name).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
  });

  it("asks for a visible name instead of an internal one", async () => {
    const user = userEvent.setup();
    await startCreate(user);
    await user.click(within(extraSection()).getByRole("button", { name: "Agregar dato" }));
    await user.click(screen.getByRole("button", { name: "Crear reporte" }));

    expect(await screen.findByText("El dato 1 necesita un nombre visible.")).toBeTruthy();
    expect(screen.queryByText(/nombre del parámetro/)).toBeNull();
    expect(createReport).not.toHaveBeenCalled();
  });

  it("keeps a saved internal name when its visible name changes", async () => {
    const user = userEvent.setup();
    const customer = {
      name: "customer_name", label: "Cliente", data_type: "string" as const, input_type: "text" as const,
      required: false, default_value: null, display_order: 1, configuration_json: null,
    };
    const report = { ...QUOTATION_REPORT, parameters: [PRICE_LIST_PARAMETER, customer] };
    updateReportInputs.mockResolvedValue(inputsResponse(report));
    render(<ReportDefinitionForm report={report} />);
    await screen.findByRole("option", { name: "Renglones de cotización" });

    const card = within(extraSection()).getByRole("group", { name: "Cliente" });
    const label = within(card).getByLabelText("Nombre visible");
    await user.clear(label);
    await user.type(label, "Razón social");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(updateReportInputs).toHaveBeenCalledTimes(1));
    expect(updateReportInputs.mock.calls[0]?.[1].parameters[1]).toEqual({
      ...customer, label: "Razón social",
    });
  });

  it("keeps a preset's well-known internal name when it is relabelled before saving", async () => {
    const user = userEvent.setup();
    await startCreate(user);
    await addPreset(user, "Cliente");
    const card = within(extraSection()).getByRole("group", { name: "Cliente" });
    const label = within(card).getByLabelText("Nombre visible");
    await user.clear(label);
    await user.type(label, "Razón social");

    const [parameter] = await createdParameters(user);
    expect(parameter).toEqual(expect.objectContaining({ name: "customer_name", label: "Razón social" }));
  });

  it("shows a non-canonical saved parameter as 'Personalizado (anterior)' and sends it back intact", async () => {
    const user = userEvent.setup();
    const legacy = {
      name: "legacy_part", label: "Parte", data_type: "string" as const, input_type: "select" as const,
      required: false, default_value: "42", display_order: 1,
      configuration_json: { options_source: "products" as const },
    };
    const report = { ...QUOTATION_REPORT, parameters: [PRICE_LIST_PARAMETER, legacy] };
    updateReportInputs.mockResolvedValue(inputsResponse(report));
    render(<ReportDefinitionForm report={report} />);
    await screen.findByRole("option", { name: "Renglones de cotización" });

    const card = within(extraSection()).getByRole("group", { name: "Parte" });
    const kind = within(card).getByLabelText("Tipo de entrada") as HTMLSelectElement;
    expect(kind.disabled).toBe(true);
    expect(kind.selectedOptions[0]?.textContent).toBe("Personalizado (anterior)");
    expect((within(card).getByLabelText(/Valor predeterminado/) as HTMLInputElement).value).toBe("42");
    // "Personalizado" is a read-only state, never a choice for a new input.
    const fresh = await addInput(user, "Nuevo");
    expect(within(within(fresh).getByLabelText("Tipo de entrada")).queryByRole("option", { name: "Personalizado (anterior)" }))
      .toBeNull();
    await user.click(within(fresh).getByRole("button", { name: "Quitar Nuevo" }));

    const label = within(card).getByLabelText("Nombre visible");
    await user.clear(label);
    await user.type(label, "Número de parte");
    await user.click(within(card).getByLabelText("Obligatorio"));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(updateReportInputs).toHaveBeenCalledTimes(1));
    expect(updateReportInputs.mock.calls[0]?.[1].parameters[1]).toEqual({
      ...legacy, label: "Número de parte", required: true,
    });
    expect(listAllReportParameterOptions).not.toHaveBeenCalledWith(
      "COTIZACION", "legacy_part", undefined, expect.anything(),
    );
  });

  it("labels requiredness as Obligatorio and sends it unchanged in the contract", async () => {
    const user = userEvent.setup();
    await startCreate(user);
    const card = await addInput(user, "Cantidad", "Número");
    expect(within(card).queryByLabelText("Requerido")).toBeNull();
    await user.click(within(card).getByLabelText("Obligatorio"));

    const [parameter] = await createdParameters(user);
    expect(parameter).toEqual(expect.objectContaining({ name: "cantidad", required: true }));
  });

  it("never asks for a typed id while creating: a list default waits until the report exists", async () => {
    const user = userEvent.setup();
    await startCreate(user);
    const card = await addInput(user, "Lista", "Lista de precios");

    const defaultValue = within(card).getByLabelText(/Valor predeterminado/) as HTMLSelectElement;
    expect(defaultValue.tagName).toBe("SELECT");
    expect(defaultValue.disabled).toBe(true);
    expect(within(card).queryByRole("textbox", { name: /Valor predeterminado/ })).toBeNull();
    expect(within(card).queryByRole("spinbutton")).toBeNull();
    expect(within(card).getByText("Podrás elegir un valor predeterminado después de crear el reporte.")).toBeTruthy();
    expect(listAllReportParameterOptions).not.toHaveBeenCalled();
  });

  it("explains the product kind's scope without changing its contract", async () => {
    const user = userEvent.setup();
    await startCreate(user);
    const card = await addInput(user, "Producto", "Producto");
    expect(within(card).getByText(/Para capturar varios productos con precio y cantidad/)).toBeTruthy();
  });

  it("chooses a saved list's default from real options, and asks to save a list added in this session", async () => {
    const user = userEvent.setup();
    const supplier = {
      name: "supplier_id", label: "Proveedor", data_type: "integer" as const, input_type: "select" as const,
      required: false, default_value: null, display_order: 1,
      configuration_json: { options_source: "suppliers" as const },
    };
    const report = { ...QUOTATION_REPORT, parameters: [PRICE_LIST_PARAMETER, supplier] };
    updateReportInputs.mockResolvedValue(inputsResponse(report));
    listAllReportParameterOptions.mockImplementation(async (_code: string, name: string) => (
      name === "supplier_id"
        ? [{ value: 7, label: "DON · Donaldson" }]
        : [{ value: 17, label: "Donaldson · 2026-01-01 · MXN" }]
    ));
    render(<ReportDefinitionForm report={report} />);
    await screen.findByRole("option", { name: "Renglones de cotización" });

    const card = within(extraSection()).getByRole("group", { name: "Proveedor" });
    await within(card).findByRole("option", { name: "DON · Donaldson" });
    expect(within(card).queryByRole("textbox", { name: /Valor predeterminado/ })).toBeNull();
    await user.selectOptions(within(card).getByLabelText(/Valor predeterminado/), "7");

    const fresh = await addInput(user, "Otro proveedor", "Proveedor");
    expect((within(fresh).getByLabelText(/Valor predeterminado/) as HTMLSelectElement).disabled).toBe(true);
    expect(within(fresh).getByText("Podrás elegir un valor predeterminado después de guardar los cambios.")).toBeTruthy();
    expect(listAllReportParameterOptions).not.toHaveBeenCalledWith(
      "COTIZACION", "otro_proveedor", undefined, expect.anything(),
    );

    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(updateReportInputs).toHaveBeenCalledTimes(1));
    expect(updateReportInputs.mock.calls[0]?.[1].parameters[1]).toEqual({ ...supplier, default_value: 7 });
  });
});
