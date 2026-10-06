// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportDefinitionForm } from "./report-definition-form";
import { useReportBuilderDraft } from "@/hooks/use-report-builder-draft";
import { ApiError } from "@/lib/api/errors";
import { emptyExcelLayout } from "@/lib/reports/report-builder";
import type {
  ReportAdminDefinition,
  ReportBuilderDefinition,
  ReportColumn,
  ReportDataSource,
  ReportParameter,
  ReportParameterGroup,
} from "@/types/api";

/**
 * "Fuente y entradas" with the wizard-owned builder (Frontend #41B): the
 * repeatable rows are configured beside the parameters and saved right after
 * the definition, with the real `useReportBuilderDraft` behind the form.
 */
const {
  push, refresh, createReport, updateReport, listReportDataSources, listAllReportParameterOptions,
  getReportBuilder, getReportFieldCatalog, saveReportBuilder,
} = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  createReport: vi.fn(),
  updateReport: vi.fn(),
  listReportDataSources: vi.fn(),
  listAllReportParameterOptions: vi.fn(),
  getReportBuilder: vi.fn(),
  getReportFieldCatalog: vi.fn(),
  saveReportBuilder: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/api/reports", () => ({
  createReport, updateReport, listReportDataSources, listAllReportParameterOptions,
  getReportBuilder, getReportFieldCatalog, saveReportBuilder,
}));

const PRICE_LIST: ReportParameter = {
  name: "price_list_id", label: "Lista de precios", data_type: "integer", input_type: "select",
  required: true, default_value: null, display_order: 0, configuration_json: { options_source: "price_lists" },
};
const REFERENCE_LIST: ReportParameter = { ...PRICE_LIST, name: "lista_de_referencia", label: "Lista de referencia", required: false, display_order: 1 };
const CUSTOMER: ReportParameter = {
  name: "customer_name", label: "Cliente", data_type: "string", input_type: "text",
  required: false, default_value: null, display_order: 1, configuration_json: null,
};
const TAX: ReportParameter = {
  name: "tax_rate", label: "IVA %", data_type: "decimal", input_type: "number",
  required: false, default_value: 16, display_order: 2, configuration_json: null,
};

const PRODUCT_SOURCE: ReportDataSource = {
  id: 1, code: "PRODUCT_CATALOG", name: "Catálogo de productos", description: null, enabled: true,
  capabilities: [], parameters: [], fields: [],
};
const QUOTATION_SOURCE: ReportDataSource = {
  id: 3, code: "QUOTATION_ROWS", name: "Renglones de cotización", description: null, enabled: true,
  capabilities: ["REPEATABLE_ROWS"], parameters: [PRICE_LIST], fields: [],
};

const ITEMS: ReportParameterGroup = {
  name: "items", label: "Productos", resolver_key: "products_by_price_list", context_parameter: "price_list_id",
  min_items: 1, max_items: null, display_order: 0,
  fields: [
    { name: "product_id", label: "Producto", data_type: "integer", input_type: "select", required: true, default_value: null, display_order: 0, configuration_json: { options_source: "products_by_price_list", context_parameter: "price_list_id" } },
    { name: "quantity", label: "Cantidad", data_type: "integer", input_type: "number", required: true, default_value: 1, display_order: 1, configuration_json: { minimum: 0, exclusive_minimum: true } },
  ],
};

function column(overrides: Partial<ReportColumn>): ReportColumn {
  return {
    key: "part_number", label: "Número de parte", column_type: "FIELD", source_field: "product.part_number",
    source_parameter: null, formula_definition: null, data_type: "string", format_type: "text",
    display_order: 0, visible: true, width: null, ...overrides,
  };
}

const COLUMNS: ReportColumn[] = [
  column({}),
  column({ key: "customer", label: "Cliente", column_type: "PARAMETER", source_field: null, source_parameter: "customer_name", display_order: 1 }),
  column({ key: "quantity", label: "Cantidad", column_type: "PARAMETER", source_field: null, source_parameter: "items.quantity", data_type: "integer", format_type: "number", display_order: 2 }),
];

const REPORT: ReportAdminDefinition = {
  code: "COTIZACION", name: "Cotización", description: null, category: null, filename_template: null, enabled: true,
  data_source_id: QUOTATION_SOURCE.id, data_source: QUOTATION_SOURCE,
  parameters: [PRICE_LIST, CUSTOMER, TAX], parameter_groups: [ITEMS],
  created_at: "2026-08-26T00:00:00Z", updated_at: "2026-08-26T00:00:00Z",
};

const SAVED_BUILDER: ReportBuilderDefinition = {
  report: REPORT,
  columns: COLUMNS,
  parameter_groups: [ITEMS],
  excel_layout: {
    ...emptyExcelLayout(), sheet_name: "Cotización",
    totals: [{ key: "iva", label: "IVA", column_key: null, operation: "FORMULA", formula_definition: "100 * tax_rate", format_type: "currency" }],
  },
};

function Step({ report = null, onSaved = vi.fn() }: { report?: ReportAdminDefinition | null; onSaved?: (saved: ReportAdminDefinition) => void }) {
  const builder = useReportBuilderDraft(report?.code ?? null);
  return (
    <>
      <ReportDefinitionForm
        report={report}
        builder={builder}
        createRedirectPath={(code) => `/administracion/reportes/${code}/configurar?step=3`}
        onSaved={onSaved}
      />
      {/* What "Datos del reporte" would see, and a way to leave unsaved edits there. */}
      <p data-testid="draft-columns">{builder.draft?.columns.map((item) => item.label).join("|")}</p>
      <p data-testid="draft-sheet">{builder.draft?.layout.sheet_name}</p>
      <p data-testid="persisted-group">{builder.persisted?.parameter_groups[0]?.label ?? "none"}</p>
      <button
        type="button"
        onClick={() => builder.updateDraft((draft) => ({
          ...draft,
          columns: draft.columns.map((item) => ({ ...item, label: `${item.label} (sin guardar)` })),
          layout: { ...draft.layout, sheet_name: "Hoja sin guardar" },
        }))}
      >editar-paso-3</button>
    </>
  );
}

async function createWith(user: ReturnType<typeof userEvent.setup>, sourceId: number) {
  render(<Step />);
  await user.type(screen.getByLabelText("Nombre"), "Nueva cotización");
  await user.type(screen.getByLabelText("Código"), "NUEVA");
  await waitFor(() => expect(screen.getByRole("option", { name: QUOTATION_SOURCE.name })).toBeTruthy());
  await user.selectOptions(screen.getByLabelText("Fuente de datos"), String(sourceId));
}

function created(sourceId: number): ReportAdminDefinition {
  const source = sourceId === QUOTATION_SOURCE.id ? QUOTATION_SOURCE : PRODUCT_SOURCE;
  return { ...REPORT, code: "NUEVA", name: "Nueva cotización", data_source_id: source.id, data_source: source, parameters: source.parameters, parameter_groups: [] };
}

beforeEach(() => {
  listReportDataSources.mockResolvedValue([PRODUCT_SOURCE, QUOTATION_SOURCE]);
  listAllReportParameterOptions.mockResolvedValue([{ value: 17, label: "Donaldson · 2026" }]);
  getReportBuilder.mockResolvedValue(SAVED_BUILDER);
  getReportFieldCatalog.mockResolvedValue([]);
  updateReport.mockImplementation(async (_code: string, request: { parameters: ReportParameter[] }) => ({ ...REPORT, parameters: request.parameters }));
  saveReportBuilder.mockImplementation(async (code: string, request: { columns: ReportColumn[]; parameter_groups: ReportParameterGroup[] }) => ({
    ...SAVED_BUILDER, report: { ...REPORT, code }, columns: request.columns, parameter_groups: request.parameter_groups,
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("Fuente y entradas — creating a report", () => {
  it("creates a report whose source has no repeatable rows with a single POST", async () => {
    createReport.mockResolvedValue(created(PRODUCT_SOURCE.id));
    const user = userEvent.setup();
    await createWith(user, PRODUCT_SOURCE.id);
    expect(screen.queryByText("Productos por renglón")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/administracion/reportes/NUEVA/configurar?step=3"));
    expect(createReport).toHaveBeenCalledTimes(1);
    expect(saveReportBuilder).not.toHaveBeenCalled();
    expect(getReportBuilder).not.toHaveBeenCalled();
  });

  it("configures the products per row beside the parameters and saves them right after the POST", async () => {
    createReport.mockResolvedValue(created(QUOTATION_SOURCE.id));
    const user = userEvent.setup();
    await createWith(user, QUOTATION_SOURCE.id);

    // The source demands the group: it is there from the start, with no way to remove it.
    expect(await screen.findByText("Productos por renglón")).toBeTruthy();
    expect(screen.getByText("Los productos se toman de")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Quitar productos por renglón/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Cantidad" }));
    await user.click(screen.getByRole("button", { name: "Descuento" }));
    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/administracion/reportes/NUEVA/configurar?step=3"));
    expect(createReport).toHaveBeenCalledTimes(1);
    expect(saveReportBuilder).toHaveBeenCalledTimes(1);
    expect(createReport.mock.invocationCallOrder[0]).toBeLessThan(saveReportBuilder.mock.invocationCallOrder[0]);
    const [code, request] = saveReportBuilder.mock.calls[0];
    expect(code).toBe("NUEVA");
    expect(request.columns).toEqual([]);
    expect(request.excel_layout).toEqual({ ...emptyExcelLayout(), title: null, totals: [] });
    expect(request.parameter_groups).toEqual([{
      name: "productos", label: "Productos", resolver_key: "products_by_price_list", context_parameter: "price_list_id",
      min_items: 1, max_items: null, display_order: 0,
      fields: [
        expect.objectContaining({ name: "product_id", input_type: "select", configuration_json: { options_source: "products_by_price_list", context_parameter: "price_list_id" } }),
        expect.objectContaining({ name: "cantidad", data_type: "integer", default_value: 1, configuration_json: { minimum: 0, exclusive_minimum: true } }),
        expect.objectContaining({ name: "descuento", data_type: "decimal", configuration_json: { minimum: 0 } }),
      ],
    }]);
  });

  it("keeps everything and sends no PUT when the POST fails", async () => {
    createReport.mockRejectedValue(new ApiError(409, "El reporte NUEVA ya existe."));
    const user = userEvent.setup();
    await createWith(user, QUOTATION_SOURCE.id);
    await user.click(await screen.findByRole("button", { name: "Cantidad" }));
    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    expect(await screen.findByText("El reporte NUEVA ya existe.")).toBeTruthy();
    expect(saveReportBuilder).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe("Nueva cotización");
    expect(screen.getByRole("group", { name: "Cantidad" })).toBeTruthy();
  });

  it("never POSTs twice: a failed PUT is retried alone, on the code already created", async () => {
    createReport.mockResolvedValue(created(QUOTATION_SOURCE.id));
    saveReportBuilder.mockRejectedValueOnce(new ApiError(422, "El grupo no es válido."));
    const user = userEvent.setup();
    await createWith(user, QUOTATION_SOURCE.id);
    await screen.findByText("Productos por renglón");
    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    expect(await screen.findByText("El reporte se creó, pero no se pudieron guardar los productos por renglón.")).toBeTruthy();
    expect(screen.getByText("El grupo no es válido.")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Guardar y continuar" }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: /Reintentar/ }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/administracion/reportes/NUEVA/configurar?step=3"));
    expect(createReport).toHaveBeenCalledTimes(1);
    expect(saveReportBuilder).toHaveBeenCalledTimes(2);
    expect(saveReportBuilder.mock.calls[1][0]).toBe("NUEVA");
    expect(saveReportBuilder.mock.calls[1][1]).toEqual(saveReportBuilder.mock.calls[0][1]);
  });

  it("asks before a new source without rows discards the group, and keeps everything on cancel", async () => {
    const confirm = vi.spyOn(globalThis, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const user = userEvent.setup();
    await createWith(user, QUOTATION_SOURCE.id);
    await screen.findByText("Productos por renglón");

    await user.selectOptions(screen.getByLabelText("Fuente de datos"), String(PRODUCT_SOURCE.id));
    expect(confirm.mock.calls[0][0]).toContain("La nueva fuente no utiliza productos por renglón. Esta configuración se descartará.");
    expect((screen.getByLabelText("Fuente de datos") as HTMLSelectElement).value).toBe(String(QUOTATION_SOURCE.id));
    expect(screen.getByText("Productos por renglón")).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Fuente de datos"), String(PRODUCT_SOURCE.id));
    expect((screen.getByLabelText("Fuente de datos") as HTMLSelectElement).value).toBe(String(PRODUCT_SOURCE.id));
    expect(screen.queryByText("Productos por renglón")).toBeNull();
  });
});

describe("Fuente y entradas — editing a report", () => {
  async function editing(report = REPORT) {
    const onSaved = vi.fn();
    render(<Step report={report} onSaved={onSaved} />);
    await screen.findByText("Productos por renglón");
    await waitFor(() => expect(screen.getByRole("option", { name: QUOTATION_SOURCE.name })).toBeTruthy());
    return onSaved;
  }

  it("only PATCHes when the groups did not change", async () => {
    const user = userEvent.setup();
    const onSaved = await editing();
    await user.type(screen.getByLabelText("Nombre"), " 2026");
    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(updateReport).toHaveBeenCalledTimes(1);
    expect(saveReportBuilder).not.toHaveBeenCalled();
    expect(getReportBuilder).toHaveBeenCalledTimes(1);
  });

  it("PATCHes, then PUTs only the groups over the persisted columns and layout — never unsaved step-3 edits", async () => {
    const user = userEvent.setup();
    const onSaved = await editing();
    await user.click(screen.getByRole("button", { name: "editar-paso-3" }));
    const groupLabel = screen.getByLabelText("Nombre visible del grupo");
    await user.clear(groupLabel);
    await user.type(groupLabel, "Artículos");
    const limits = within(screen.getByRole("group", { name: "Cantidad" }));
    await user.click(limits.getByText("Límites"));
    await user.type(limits.getByLabelText("Valor máximo"), "50");
    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(updateReport).toHaveBeenCalledTimes(1);
    expect(saveReportBuilder).toHaveBeenCalledTimes(1);
    expect(updateReport.mock.invocationCallOrder[0]).toBeLessThan(saveReportBuilder.mock.invocationCallOrder[0]);
    const [code, request] = saveReportBuilder.mock.calls[0];
    expect(code).toBe("COTIZACION");
    expect(request.columns).toEqual(COLUMNS);
    expect(request.excel_layout).toEqual({ ...SAVED_BUILDER.excel_layout, title: null });
    expect(request.parameter_groups).toEqual([{
      ...ITEMS, label: "Artículos",
      fields: [ITEMS.fields[0], { ...ITEMS.fields[1], configuration_json: { minimum: 0, exclusive_minimum: true, maximum: "50" } }],
    }]);
    // The unsaved edits of "Datos del reporte" are still a draft, not lost and not saved.
    expect(screen.getByTestId("draft-columns").textContent).toContain("(sin guardar)");
    expect(screen.getByTestId("draft-sheet").textContent).toBe("Hoja sin guardar");
    expect(screen.getByTestId("persisted-group").textContent).toBe("Artículos");
  });

  it("reports pending groups after a saved definition and retries only the PUT", async () => {
    saveReportBuilder.mockRejectedValueOnce(new ApiError(422, "El contexto no es válido."));
    const user = userEvent.setup();
    const onSaved = await editing();
    await user.type(screen.getByLabelText("Nombre visible del grupo"), " y servicios");
    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    expect(await screen.findByText("Los datos del reporte se guardaron, pero los productos por renglón quedaron pendientes.")).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByTestId("persisted-group").textContent).toBe("Productos");

    await user.click(screen.getByRole("button", { name: /Reintentar/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(updateReport).toHaveBeenCalledTimes(1);
    expect(saveReportBuilder).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("persisted-group").textContent).toBe("Productos y servicios");
  });

  it("keeps a legacy group's names and configuration intact", async () => {
    const legacy: ReportParameterGroup = {
      ...ITEMS,
      fields: [...ITEMS.fields, {
        name: "delivery", label: "Entrega", data_type: "date", input_type: "date",
        required: false, default_value: null, display_order: 2, configuration_json: null,
      }],
    };
    getReportBuilder.mockResolvedValue({ ...SAVED_BUILDER, parameter_groups: [legacy] });
    const user = userEvent.setup();
    const onSaved = await editing({ ...REPORT, parameter_groups: [legacy] });
    expect(screen.getByText("Personalizado (anterior)")).toBeTruthy();
    await user.type(screen.getByLabelText("Nombre visible del grupo"), "!");
    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(saveReportBuilder.mock.calls[0][1].parameter_groups).toEqual([{ ...legacy, label: "Productos!" }]);
  });

  it("refuses to change to a source without rows while a saved group exists", async () => {
    const confirm = vi.spyOn(globalThis, "confirm");
    const user = userEvent.setup();
    await editing();
    await user.selectOptions(screen.getByLabelText("Fuente de datos"), String(PRODUCT_SOURCE.id));

    expect(screen.getByText("Este reporte utiliza Productos por renglón. Actualmente no puede cambiarse a una fuente que no admita renglones.")).toBeTruthy();
    expect((screen.getByLabelText("Fuente de datos") as HTMLSelectElement).value).toBe(String(QUOTATION_SOURCE.id));
    expect(confirm).not.toHaveBeenCalled();
    expect(updateReport).not.toHaveBeenCalled();
  });
});

describe("Fuente y entradas — protecting what the saved builder uses", () => {
  function manualCard(title: string): ReturnType<typeof within> {
    return within(screen.getByRole("group", { name: title }));
  }

  it("refuses to remove or retype the price list the products are filtered by", async () => {
    const report = { ...REPORT, parameters: [PRICE_LIST, REFERENCE_LIST], parameter_groups: [{ ...ITEMS, context_parameter: "lista_de_referencia" }] };
    const group = { ...ITEMS, context_parameter: "lista_de_referencia", fields: [ITEMS.fields[0], ITEMS.fields[1]].map((item) => item.input_type === "select" ? { ...item, configuration_json: { options_source: "products_by_price_list" as const, context_parameter: "lista_de_referencia" } } : item) };
    getReportBuilder.mockResolvedValue({ ...SAVED_BUILDER, columns: [column({})], parameter_groups: [group], excel_layout: { ...SAVED_BUILDER.excel_layout!, totals: [] } });
    const user = userEvent.setup();
    render(<Step report={report} />);
    await screen.findByText("Productos por renglón");

    await user.selectOptions(manualCard("Lista de referencia").getByLabelText("Tipo de entrada"), "text");
    expect(screen.getByText("\"Lista de referencia\" se utiliza para seleccionar los productos por renglón.")).toBeTruthy();
    expect((manualCard("Lista de referencia").getByLabelText("Tipo de entrada") as HTMLSelectElement).value).toBe("price_list");

    await user.click(screen.getByRole("button", { name: "Quitar Lista de referencia" }));
    expect(screen.getByRole("group", { name: "Lista de referencia" })).toBeTruthy();
    expect(updateReport).not.toHaveBeenCalled();
  });

  it("refuses to remove a subfield a saved column shows", async () => {
    const user = userEvent.setup();
    render(<Step report={REPORT} />);
    await screen.findByText("Productos por renglón");

    await user.click(screen.getByRole("button", { name: "Quitar Cantidad" }));
    expect(screen.getByText("No puedes quitar \"Cantidad\" porque se utiliza en la columna \"Cantidad\".")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Cantidad" })).toBeTruthy();
  });

  it("refuses to remove or retype a parameter a saved PARAMETER column shows", async () => {
    const user = userEvent.setup();
    render(<Step report={REPORT} />);
    await screen.findByText("Productos por renglón");

    await user.selectOptions(manualCard("Cliente").getByLabelText("Tipo de entrada"), "number");
    expect(screen.getByText("No puedes cambiar el tipo de \"Cliente\" porque se utiliza en la columna \"Cliente\".")).toBeTruthy();
    expect((manualCard("Cliente").getByLabelText("Tipo de entrada") as HTMLSelectElement).value).toBe("text");

    await user.click(screen.getByRole("button", { name: "Quitar Cliente" }));
    expect(screen.getByText("No puedes quitar \"Cliente\" porque se utiliza en la columna \"Cliente\".")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Cliente" })).toBeTruthy();
  });

  it("refuses to make a parameter a saved formula reads non-numeric, but allows a numeric change", async () => {
    const user = userEvent.setup();
    render(<Step report={REPORT} />);
    await screen.findByText("Productos por renglón");

    await user.selectOptions(manualCard("IVA %").getByLabelText("Tipo de entrada"), "text");
    expect(screen.getByText("No puedes cambiar el tipo de \"IVA %\" porque se utiliza en el total \"IVA\".")).toBeTruthy();
    expect((manualCard("IVA %").getByLabelText("Tipo de entrada") as HTMLSelectElement).value).toBe("number");

    await user.click(manualCard("IVA %").getByLabelText("Permitir decimales"));
    expect((manualCard("IVA %").getByLabelText("Permitir decimales") as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByText(/No puedes/)).toBeNull();
  });
});
