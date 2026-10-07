// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportDefinitionForm } from "./report-definition-form";
import { useReportBuilderDraft } from "@/hooks/use-report-builder-draft";
import { ApiError } from "@/lib/api/errors";
import { emptyExcelLayout } from "@/lib/reports/report-builder";
import { templatePlaceholderDependencies, type TemplateDependencies } from "@/lib/reports/report-template-dependencies";
import { inspectionWithPlaceholders } from "@/test/template-inspection";
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
  push, refresh, createReport, updateReport, updateReportInputs, listReportDataSources, listAllReportParameterOptions,
  getReportBuilder, getReportFieldCatalog, saveReportBuilder,
} = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  createReport: vi.fn(),
  updateReport: vi.fn(),
  updateReportInputs: vi.fn(),
  listReportDataSources: vi.fn(),
  listAllReportParameterOptions: vi.fn(),
  getReportBuilder: vi.fn(),
  getReportFieldCatalog: vi.fn(),
  saveReportBuilder: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/lib/api/reports", () => ({
  createReport, updateReport, updateReportInputs, listReportDataSources, listAllReportParameterOptions,
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
  capabilities: [], parameters: [], fields: [
    { key: "product.part_number", label: "Número de parte", data_type: "string", group: "Producto", required_context: "product" },
  ],
};
const SIMPLE_SOURCE: ReportDataSource = {
  id: 2, code: "SIMPLE_TWO", name: "Fuente simple compatible", description: null, enabled: true,
  capabilities: [], parameters: [], fields: PRODUCT_SOURCE.fields,
};
const QUOTATION_SOURCE: ReportDataSource = {
  id: 3, code: "QUOTATION_ROWS", name: "Renglones de cotización", description: null, enabled: true,
  capabilities: ["REPEATABLE_ROWS"], parameters: [PRICE_LIST], fields: PRODUCT_SOURCE.fields,
};
const INCOMPATIBLE_SOURCE: ReportDataSource = {
  id: 4, code: "INCOMPATIBLE", name: "Fuente sin número de parte", description: null, enabled: true,
  capabilities: [], parameters: [], fields: [],
};
const REPEATABLE_SOURCE: ReportDataSource = {
  id: 5, code: "OTHER_ROWS", name: "Otros renglones", description: null, enabled: true,
  capabilities: ["REPEATABLE_ROWS"], parameters: [REFERENCE_LIST], fields: PRODUCT_SOURCE.fields,
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

function reportFor(
  source: ReportDataSource,
  parameters: ReportParameter[] = source.parameters,
  groups: ReportParameterGroup[] = [],
): ReportAdminDefinition {
  return {
    ...REPORT,
    data_source_id: source.id,
    data_source: source,
    parameters,
    parameter_groups: groups,
  };
}

function builderFor(
  report: ReportAdminDefinition,
  columns: ReportColumn[] = [column({})],
  groups: ReportParameterGroup[] = report.parameter_groups,
): ReportBuilderDefinition {
  return {
    report,
    columns,
    parameter_groups: groups,
    excel_layout: { ...emptyExcelLayout(), totals: [] },
  };
}

function Step({
  report = null,
  onSaved = vi.fn(),
  onGoToData,
  templateDependencies,
  onGoToMapping,
  onTemplateMayHaveChanged,
}: {
  report?: ReportAdminDefinition | null;
  onSaved?: (saved: ReportAdminDefinition) => void;
  onGoToData?: () => void;
  templateDependencies?: TemplateDependencies;
  onGoToMapping?: () => void;
  onTemplateMayHaveChanged?: () => void;
}) {
  const builder = useReportBuilderDraft(report?.code ?? null);
  return (
    <>
      <ReportDefinitionForm
        report={report}
        builder={builder}
        createRedirectPath={(code) => `/administracion/reportes/${code}/configurar?step=3`}
        onSaved={onSaved}
        onGoToData={onGoToData}
        templateDependencies={templateDependencies}
        onGoToMapping={onGoToMapping}
        onTemplateMayHaveChanged={onTemplateMayHaveChanged}
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
  listReportDataSources.mockResolvedValue([PRODUCT_SOURCE, SIMPLE_SOURCE, QUOTATION_SOURCE, INCOMPATIBLE_SOURCE, REPEATABLE_SOURCE]);
  listAllReportParameterOptions.mockResolvedValue([{ value: 17, label: "Donaldson · 2026" }]);
  getReportBuilder.mockResolvedValue(SAVED_BUILDER);
  getReportFieldCatalog.mockResolvedValue([]);
  updateReport.mockImplementation(async (_code: string, request: { parameters: ReportParameter[] }) => ({ ...REPORT, parameters: request.parameters }));
  updateReportInputs.mockImplementation(async (code: string, request: {
    name: string; description: string | null; category: string | null; enabled: boolean;
    data_source_id: number; parameters: ReportParameter[]; parameter_groups: ReportParameterGroup[];
  }) => {
    const source = [PRODUCT_SOURCE, SIMPLE_SOURCE, QUOTATION_SOURCE, INCOMPATIBLE_SOURCE, REPEATABLE_SOURCE]
      .find((candidate) => candidate.id === request.data_source_id)!;
    const savedReport = {
      ...REPORT,
      code,
      name: request.name,
      description: request.description,
      category: request.category,
      enabled: request.enabled,
      data_source_id: source.id,
      data_source: source,
      parameters: request.parameters,
      parameter_groups: request.parameter_groups,
    };
    return { ...SAVED_BUILDER, report: savedReport, parameter_groups: request.parameter_groups };
  });
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
  async function editing(report = REPORT, onGoToData?: () => void) {
    const onSaved = vi.fn();
    render(<Step report={report} onSaved={onSaved} onGoToData={onGoToData} />);
    await screen.findByText("Productos por renglón");
    await waitFor(() => expect(screen.getByRole("option", { name: QUOTATION_SOURCE.name })).toBeTruthy());
    return onSaved;
  }

  it("uses one inputs PUT for EDIT even when the datasource and groups do not change", async () => {
    const user = userEvent.setup();
    const onSaved = await editing();
    await user.type(screen.getByLabelText("Nombre"), " 2026");
    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(updateReportInputs).toHaveBeenCalledTimes(1);
    expect(updateReportInputs).toHaveBeenCalledWith("COTIZACION", expect.objectContaining({
      name: "Cotización 2026",
      description: null,
      category: null,
      enabled: true,
      data_source_id: QUOTATION_SOURCE.id,
      parameters: [PRICE_LIST, CUSTOMER, TAX],
      parameter_groups: [ITEMS],
    }));
    expect(updateReport).not.toHaveBeenCalled();
    expect(saveReportBuilder).not.toHaveBeenCalled();
    expect(getReportBuilder).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("applies the inputs response and preserves unsaved step-3 columns and layout", async () => {
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
    expect(updateReportInputs).toHaveBeenCalledTimes(1);
    const [code, request] = updateReportInputs.mock.calls[0];
    expect(code).toBe("COTIZACION");
    expect(request.parameter_groups).toEqual([{
      ...ITEMS, label: "Artículos",
      fields: [ITEMS.fields[0], { ...ITEMS.fields[1], configuration_json: { minimum: 0, exclusive_minimum: true, maximum: "50" } }],
    }]);
    expect(request).not.toHaveProperty("columns");
    expect(request).not.toHaveProperty("excel_layout");
    expect(updateReport).not.toHaveBeenCalled();
    expect(saveReportBuilder).not.toHaveBeenCalled();
    // The unsaved edits of "Datos del reporte" are still a draft, not lost and not saved.
    expect(screen.getByTestId("draft-columns").textContent).toContain("(sin guardar)");
    expect(screen.getByTestId("draft-sheet").textContent).toBe("Hoja sin guardar");
    expect(screen.getByTestId("persisted-group").textContent).toBe("Artículos");
  });

  it("keeps every draft on 422 without pending state, navigation, reload, or special retry", async () => {
    updateReportInputs.mockRejectedValueOnce(new ApiError(422, "El contexto no es válido."));
    const user = userEvent.setup();
    const onSaved = await editing();
    await user.click(screen.getByRole("button", { name: "editar-paso-3" }));
    await user.type(screen.getByLabelText("Nombre visible del grupo"), " y servicios");
    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    expect(await screen.findByText("El contexto no es válido.")).toBeTruthy();
    expect(screen.queryByText(/quedaron pendientes/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Reintentar/ })).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByTestId("persisted-group").textContent).toBe("Productos");
    expect((screen.getByLabelText("Nombre visible del grupo") as HTMLInputElement).value).toBe("Productos y servicios");
    expect(screen.getByTestId("draft-columns").textContent).toContain("(sin guardar)");
    expect(screen.getByTestId("draft-sheet").textContent).toBe("Hoja sin guardar");
    expect(refresh).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(getReportBuilder).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(updateReportInputs).toHaveBeenCalledTimes(2);
    expect(updateReport).not.toHaveBeenCalled();
    expect(saveReportBuilder).not.toHaveBeenCalled();
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
    expect(updateReportInputs.mock.calls[0][1].parameter_groups).toEqual([{ ...legacy, label: "Productos!" }]);
    expect(screen.getByText("Personalizado (anterior)")).toBeTruthy();
  });

  it("blocks repeatable to simple when a saved group field is used", async () => {
    const onGoToData = vi.fn();
    const user = userEvent.setup();
    await editing(REPORT, onGoToData);
    await user.selectOptions(screen.getByLabelText("Fuente de datos"), String(PRODUCT_SOURCE.id));

    expect(screen.getByText("Columna \"Cantidad\" — usa Productos por renglón, que se quitarán.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Ir a Datos del reporte" }));
    expect(onGoToData).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText("Fuente de datos") as HTMLSelectElement).value).toBe(String(QUOTATION_SOURCE.id));
    expect(updateReport).not.toHaveBeenCalled();
    expect(updateReportInputs).not.toHaveBeenCalled();
    expect(saveReportBuilder).not.toHaveBeenCalled();
  });
});

describe("Fuente y entradas — datasource transitions in EDIT", () => {
  async function renderExisting(
    report: ReportAdminDefinition,
    persisted: ReportBuilderDefinition,
  ) {
    const onSaved = vi.fn();
    getReportBuilder.mockResolvedValue(persisted);
    render(<Step report={report} onSaved={onSaved} />);
    await waitFor(() => expect(screen.getByRole("option", { name: persisted.report.data_source.name })).toBeTruthy());
    await waitFor(() => expect(getReportBuilder).toHaveBeenCalledTimes(1));
    return { onSaved, user: userEvent.setup() };
  }

  it("allows simple to simple and saves it through inputs", async () => {
    const report = reportFor(PRODUCT_SOURCE, [CUSTOMER]);
    const { onSaved, user } = await renderExisting(report, builderFor(report));

    await user.selectOptions(screen.getByLabelText("Fuente de datos"), String(SIMPLE_SOURCE.id));
    expect(screen.getByText(`Confirmar cambio a "${SIMPLE_SOURCE.name}"`)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cambiar fuente" }));
    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const request = updateReportInputs.mock.calls[0][1];
    expect(request).toEqual(expect.objectContaining({ data_source_id: SIMPLE_SOURCE.id, parameter_groups: [] }));
    expect(request.parameters).toEqual([expect.objectContaining({ name: "customer_name", label: "Cliente", display_order: 0 })]);
    expect(updateReport).not.toHaveBeenCalled();
    expect(saveReportBuilder).not.toHaveBeenCalled();
  });

  it("blocks simple to simple when a FIELD is absent from the target metadata", async () => {
    const report = reportFor(PRODUCT_SOURCE);
    const { user } = await renderExisting(report, builderFor(report));

    await user.selectOptions(screen.getByLabelText("Fuente de datos"), String(INCOMPATIBLE_SOURCE.id));

    expect(screen.getByText("Columna \"Número de parte\" — ese dato no existe en la nueva fuente.")).toBeTruthy();
    expect((screen.getByLabelText("Fuente de datos") as HTMLSelectElement).value).toBe(String(PRODUCT_SOURCE.id));
    expect(updateReportInputs).not.toHaveBeenCalled();
  });

  it("cancels repeatable to simple without changing source, parameters, or groups", async () => {
    const report = reportFor(QUOTATION_SOURCE, [PRICE_LIST, CUSTOMER, TAX], [ITEMS]);
    const { user } = await renderExisting(report, builderFor(report, [column({})], [ITEMS]));

    await user.selectOptions(screen.getByLabelText("Fuente de datos"), String(PRODUCT_SOURCE.id));
    expect(screen.getByText("Productos por renglón", { selector: '[data-slot="card-title"]' })).toBeTruthy();
    expect(screen.getByText("Lista de precios", { selector: "li" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect((screen.getByLabelText("Fuente de datos") as HTMLSelectElement).value).toBe(String(QUOTATION_SOURCE.id));
    expect(screen.getByText("Productos por renglón")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Lista de precios" })).toBeTruthy();
    expect((screen.getByLabelText("Nombre visible del grupo") as HTMLInputElement).value).toBe("Productos");
    expect(updateReportInputs).not.toHaveBeenCalled();
  });

  it("allows repeatable to simple without dependencies, then sends empty groups", async () => {
    const report = reportFor(QUOTATION_SOURCE, [PRICE_LIST, CUSTOMER, TAX], [ITEMS]);
    const { onSaved, user } = await renderExisting(report, builderFor(report, [column({})], [ITEMS]));

    await user.selectOptions(screen.getByLabelText("Fuente de datos"), String(PRODUCT_SOURCE.id));
    expect(screen.getByText("Productos por renglón", { selector: "li" })).toBeTruthy();
    expect(screen.getByText("Lista de precios", { selector: "li" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cambiar fuente" }));
    expect(screen.queryByText("Productos por renglón")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const request = updateReportInputs.mock.calls[0][1];
    expect(request).toEqual(expect.objectContaining({ data_source_id: PRODUCT_SOURCE.id, parameter_groups: [] }));
    expect(request.parameters).toEqual([
      expect.objectContaining({ name: "customer_name", display_order: 0 }),
      expect.objectContaining({ name: "tax_rate", display_order: 1 }),
    ]);
  });

  it("creates the canonical group for simple to repeatable and saves it atomically", async () => {
    const report = reportFor(PRODUCT_SOURCE, [CUSTOMER]);
    const { onSaved, user } = await renderExisting(report, builderFor(report));

    await user.selectOptions(screen.getByLabelText("Fuente de datos"), String(QUOTATION_SOURCE.id));
    await user.click(screen.getByRole("button", { name: "Cambiar fuente" }));
    expect(await screen.findByText("Productos por renglón")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const request = updateReportInputs.mock.calls[0][1];
    expect(request.data_source_id).toBe(QUOTATION_SOURCE.id);
    expect(request.parameter_groups).toHaveLength(1);
    expect(request.parameter_groups[0]).toMatchObject({ context_parameter: "price_list_id" });
    expect(saveReportBuilder).not.toHaveBeenCalled();
  });

  it("keeps repeatable identifiers while adapting the context for another repeatable source", async () => {
    const report = reportFor(QUOTATION_SOURCE, [PRICE_LIST, CUSTOMER, TAX], [ITEMS]);
    const { onSaved, user } = await renderExisting(report, builderFor(report, COLUMNS, [ITEMS]));

    await user.selectOptions(screen.getByLabelText("Fuente de datos"), String(REPEATABLE_SOURCE.id));
    await user.click(screen.getByRole("button", { name: "Cambiar fuente" }));
    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const group = updateReportInputs.mock.calls[0][1].parameter_groups[0];
    expect(group.name).toBe("items");
    expect(group.context_parameter).toBe("lista_de_referencia");
    expect(group.fields.map((field: ReportParameterGroup["fields"][number]) => field.name)).toEqual(["product_id", "quantity"]);
    expect(group.fields[0].configuration_json).toEqual({
      options_source: "products_by_price_list",
      context_parameter: "lista_de_referencia",
    });
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

describe("Fuente y entradas — protecting what the active Excel template uses (#43)", () => {
  const usingCustomer = templatePlaceholderDependencies(inspectionWithPlaceholders(["parameters.customer_name"]));
  const report = reportFor(PRODUCT_SOURCE, [CUSTOMER, TAX]);

  async function renderWithTemplate(
    dependencies: TemplateDependencies | undefined,
    current = report,
    extra: { onGoToMapping?: () => void; onTemplateMayHaveChanged?: () => void } = {},
  ) {
    const onSaved = vi.fn();
    getReportBuilder.mockResolvedValue(builderFor(current));
    render(<Step report={current} onSaved={onSaved} templateDependencies={dependencies} {...extra} />);
    await waitFor(() => expect(screen.getByRole("option", { name: current.data_source.name })).toBeTruthy());
    await waitFor(() => expect(getReportBuilder).toHaveBeenCalledTimes(1));
    return { onSaved, user: userEvent.setup() };
  }

  it("marks the parameter the template uses, and only that one", async () => {
    await renderWithTemplate(usingCustomer);
    expect(within(screen.getByRole("group", { name: /Cliente/ })).getByText("Plantilla Excel")).toBeTruthy();
    expect(within(screen.getByRole("group", { name: /IVA/ })).queryByText("Plantilla Excel")).toBeNull();
  });

  it("A: removes a parameter the template does not use", async () => {
    const { user, onSaved } = await renderWithTemplate(usingCustomer);
    await user.click(screen.getByRole("button", { name: "Quitar IVA %" }));
    expect(screen.queryByRole("group", { name: /IVA/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it("B: refuses to remove a parameter the template uses, with its location and a way to the mapper", async () => {
    const onGoToMapping = vi.fn();
    const { user } = await renderWithTemplate(usingCustomer, report, { onGoToMapping });
    await user.click(screen.getByRole("button", { name: "Quitar Cliente" }));

    expect(screen.getByText('No puedes quitar "Cliente".')).toBeTruthy();
    expect(screen.getByText("La plantilla Excel utiliza este dato. Primero quítalo o reemplázalo en la plantilla.")).toBeTruthy();
    expect(screen.getByText(/Cotización!B2/)).toBeTruthy();
    expect(screen.getByRole("group", { name: /Cliente/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Ir a Mapear campos" }));
    expect(onGoToMapping).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText('No puedes quitar "Cliente".')).toBeNull();
    expect(updateReportInputs).not.toHaveBeenCalled();
  });

  it("C: allows relabeling a used parameter, since its name stays", async () => {
    const { user, onSaved } = await renderWithTemplate(usingCustomer);
    const label = within(screen.getByRole("group", { name: /Cliente/ })).getByLabelText("Nombre visible");
    await user.type(label, " principal");
    expect(screen.queryByText(/No puedes/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(updateReportInputs.mock.calls[0][1].parameters[0]).toEqual(
      expect.objectContaining({ name: "customer_name", label: "Cliente principal" }),
    );
  });

  it("D: blocks a datasource change that drops a parameter the template uses, inside the same dialog", async () => {
    const quotation = reportFor(QUOTATION_SOURCE, [PRICE_LIST, CUSTOMER, TAX], [ITEMS]);
    const usingPriceList = templatePlaceholderDependencies(inspectionWithPlaceholders(["parameters.price_list_id"]));
    const onGoToMapping = vi.fn();
    getReportBuilder.mockResolvedValue(builderFor(quotation, [column({})], [ITEMS]));
    render(<Step report={quotation} templateDependencies={usingPriceList} onGoToMapping={onGoToMapping} />);
    await waitFor(() => expect(screen.getByRole("option", { name: REPEATABLE_SOURCE.name })).toBeTruthy());
    await waitFor(() => expect(getReportBuilder).toHaveBeenCalledTimes(1));
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText("Fuente de datos"), String(REPEATABLE_SOURCE.id));

    expect(screen.getByText(`Antes de cambiar a "${REPEATABLE_SOURCE.name}", ajusta estos elementos en la plantilla Excel:`)).toBeTruthy();
    expect(screen.getByText('Plantilla Excel — usa el dato "Lista de precios" en Cotización!B2, que se quitaría.')).toBeTruthy();
    expect(screen.queryByText(/Confirmar cambio/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Ir a Datos del reporte" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Ir a Mapear campos" }));
    expect(onGoToMapping).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText("Fuente de datos") as HTMLSelectElement).value).toBe(String(QUOTATION_SOURCE.id));
    expect(updateReportInputs).not.toHaveBeenCalled();
  });

  it("E: without a template nothing is marked and nothing is blocked", async () => {
    const { user } = await renderWithTemplate(undefined);
    expect(screen.queryByText("Plantilla Excel")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Quitar Cliente" }));
    expect(screen.queryByRole("group", { name: /Cliente/ })).toBeNull();
  });

  it("S/T: shows the backend's ACTIVE_TEMPLATE_INCOMPATIBLE with labels and locations, keeping the draft", async () => {
    updateReportInputs.mockRejectedValueOnce(new ApiError(422, {
      code: "ACTIVE_TEMPLATE_INCOMPATIBLE",
      message: "La plantilla Excel activa utiliza datos que ya no existirían.",
      template_version: 4,
      issues: [
        { placeholder: "parameters.tax_rate", sheet: "Cotización", cell: "B2", range: null, reason: "unknown_placeholder" },
        { placeholder: "parameters.legacy", sheet: "Anexo", cell: "D9", range: null, reason: "brand_new_reason" },
      ],
    }));
    const onTemplateMayHaveChanged = vi.fn();
    // A stale inspection: it does not know the template uses tax_rate.
    const { user, onSaved } = await renderWithTemplate(undefined, report, { onTemplateMayHaveChanged });
    await user.click(screen.getByRole("button", { name: "Quitar IVA %" }));
    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    expect(await screen.findByText("La plantilla Excel utiliza datos que este cambio eliminaría.")).toBeTruthy();
    expect(screen.getByText("IVA % — Cotización!B2 (ya no existiría)")).toBeTruthy();
    expect(screen.getByText("parameters.legacy — Anexo!D9 (no sería compatible)")).toBeTruthy();
    expect(onTemplateMayHaveChanged).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: /IVA/ })).toBeNull();
  });

  it("U: shows a 409 as a temporary conflict, keeping the draft for a manual retry", async () => {
    updateReportInputs.mockRejectedValueOnce(new ApiError(409, "La plantilla Excel activa cambió."));
    const onTemplateMayHaveChanged = vi.fn();
    const { user, onSaved } = await renderWithTemplate(usingCustomer, report, { onTemplateMayHaveChanged });
    const label = within(screen.getByRole("group", { name: /IVA/ })).getByLabelText("Nombre visible");
    await user.clear(label);
    await user.type(label, "Impuesto");
    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    expect(await screen.findByText("La configuración o la plantilla cambió mientras guardabas. Intenta guardar nuevamente.")).toBeTruthy();
    expect(screen.queryByText(/utiliza datos que este cambio eliminaría/)).toBeNull();
    expect(onTemplateMayHaveChanged).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect((within(screen.getByRole("group", { name: /Impuesto/ })).getByLabelText("Nombre visible") as HTMLInputElement).value).toBe("Impuesto");
    expect(updateReportInputs).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Guardar y continuar" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });
});
