// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyBuilderForm, useReportBuilderDraft } from "./use-report-builder-draft";
import { ApiError } from "@/lib/api/errors";
import { builderFormFromDefinition, emptyExcelLayout, toBuilderRequest } from "@/lib/reports/report-builder";
import type { ReportBuilderDefinition, ReportFieldDescriptor } from "@/types/api";

const { getReportBuilder, getReportFieldCatalog, saveReportBuilder } = vi.hoisted(() => ({
  getReportBuilder: vi.fn(),
  getReportFieldCatalog: vi.fn(),
  saveReportBuilder: vi.fn(),
}));
vi.mock("@/lib/api/reports", () => ({ getReportBuilder, getReportFieldCatalog, saveReportBuilder }));

const FIELDS: ReportFieldDescriptor[] = [
  { key: "product.part_number", label: "Número de parte", data_type: "string", group: "Producto", required_context: "product" },
];

function builderFor(code: string, label: string): ReportBuilderDefinition {
  return {
    report: {
      code, name: code, description: null, category: null, filename_template: null, enabled: true, data_source_id: 5,
      data_source: { id: 5, code: "QUOTATION_ROWS", name: "Renglones", description: null, enabled: true, capabilities: ["REPEATABLE_ROWS"] },
      parameters: [], parameter_groups: [], created_at: "2026-08-26T00:00:00Z", updated_at: "2026-08-26T00:00:00Z",
    },
    columns: [{
      key: "part_number", label, column_type: "FIELD", source_field: "product.part_number", source_parameter: null,
      formula_definition: null, data_type: "string", format_type: "text", display_order: 0, visible: true, width: null,
    }],
    parameter_groups: [{
      name: "items", label: "Productos", resolver_key: "products_by_price_list", context_parameter: "price_list_id",
      min_items: 1, max_items: null, display_order: 0,
      fields: [{
        name: "product_id", label: "Producto", data_type: "integer", input_type: "select", required: true, default_value: null,
        display_order: 0, configuration_json: { options_source: "products_by_price_list", context_parameter: "price_list_id" },
      }],
    }],
    excel_layout: { ...emptyExcelLayout(), sheet_name: "Cotización", totals: [] },
  };
}

const BUILDER = builderFor("COTIZACION", "SKU");

beforeEach(() => {
  vi.clearAllMocks();
  getReportBuilder.mockResolvedValue(BUILDER);
  getReportFieldCatalog.mockResolvedValue(FIELDS);
});

async function loaded(code: string | null = "COTIZACION") {
  const hook = renderHook(({ current }) => useReportBuilderDraft(current), { initialProps: { current: code } });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await waitFor(() => expect(hook.result.current.fields).not.toBeNull());
  return hook;
}

describe("useReportBuilderDraft", () => {
  it("loads an existing report's builder and field catalog once, with draft == persisted", async () => {
    const { result } = await loaded();
    expect(getReportBuilder).toHaveBeenCalledTimes(1);
    expect(getReportBuilder).toHaveBeenCalledWith("COTIZACION", expect.anything());
    expect(getReportFieldCatalog).toHaveBeenCalledTimes(1);
    expect(result.current.persisted).toBe(BUILDER);
    expect(result.current.draft).toEqual(builderFormFromDefinition(BUILDER));
    expect(result.current.fields).toEqual(FIELDS);
    expect(result.current.dirty).toBe(false);
    // A copy, never the backend's own objects.
    expect(result.current.draft!.columns[0]).not.toBe(BUILDER.columns[0]);
    expect(result.current.draft!.parameterGroups[0]).not.toBe(BUILDER.parameter_groups[0]);
  });

  it("starts a new report from an empty builder without asking the backend", () => {
    const { result } = renderHook(() => useReportBuilderDraft(null));
    expect(getReportBuilder).not.toHaveBeenCalled();
    expect(getReportFieldCatalog).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ loading: false, persisted: null, fields: [], dirty: false, loadError: null });
    expect(result.current.draft).toEqual(emptyBuilderForm());
  });

  it("edits the draft — columns, groups and layout — without touching persisted", async () => {
    const { result } = await loaded();
    act(() => result.current.updateDraft((draft) => ({
      columns: draft.columns.map((column) => ({ ...column, label: "Código" })),
      parameterGroups: draft.parameterGroups.map((group) => ({ ...group, label: "Artículos" })),
      layout: { ...draft.layout, sheet_name: "Hoja" },
    })));

    expect(result.current.dirty).toBe(true);
    expect(result.current.draft!.columns[0].label).toBe("Código");
    expect(result.current.draft!.parameterGroups[0].label).toBe("Artículos");
    expect(result.current.draft!.layout.sheet_name).toBe("Hoja");
    expect(result.current.persisted).toBe(BUILDER);
    expect(BUILDER.columns[0].label).toBe("SKU");
    expect(BUILDER.parameter_groups[0].label).toBe("Productos");
    expect(BUILDER.excel_layout!.sheet_name).toBe("Cotización");
  });

  it("saves the draft with the current payload and re-seeds both copies from the response", async () => {
    const saved = builderFor("COTIZACION", "Código");
    saveReportBuilder.mockResolvedValue(saved);
    const { result } = await loaded();
    act(() => result.current.updateDraft((draft) => ({ ...draft, columns: draft.columns.map((column) => ({ ...column, label: "Código" })) })));
    const expectedRequest = toBuilderRequest(result.current.draft!);

    let confirmed: ReportBuilderDefinition | null = null;
    await act(async () => { confirmed = await result.current.save(); });

    expect(saveReportBuilder).toHaveBeenCalledWith("COTIZACION", expectedRequest);
    expect(confirmed).toBe(saved);
    expect(result.current.persisted).toBe(saved);
    expect(result.current.draft).toEqual(builderFormFromDefinition(saved));
    expect(result.current.dirty).toBe(false);
    expect(result.current.saving).toBe(false);
  });

  it("keeps the draft and the last persisted builder when saving fails", async () => {
    saveReportBuilder.mockRejectedValue(new ApiError(422, "La columna 'x' está duplicada."));
    const { result } = await loaded();
    act(() => result.current.updateDraft((draft) => ({ ...draft, columns: draft.columns.map((column) => ({ ...column, label: "Código" })) })));

    let failure: unknown;
    await act(async () => { await result.current.save().catch((error: unknown) => { failure = error; }); });

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).message).toBe("La columna 'x' está duplicada.");
    expect(result.current.persisted).toBe(BUILDER);
    expect(result.current.draft!.columns[0].label).toBe("Código");
    expect(result.current.dirty).toBe(true);
    expect(result.current.saving).toBe(false);
  });

  it("never sends a second PUT while one is running", async () => {
    let resolveSave: ((builder: ReportBuilderDefinition) => void) | undefined;
    saveReportBuilder.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    const { result } = await loaded();

    let first: Promise<ReportBuilderDefinition | null> | undefined;
    let second: ReportBuilderDefinition | null | undefined;
    await act(async () => {
      first = result.current.save();
      second = await result.current.save();
    });
    expect(second).toBeNull();
    expect(saveReportBuilder).toHaveBeenCalledTimes(1);
    await act(async () => { resolveSave?.(BUILDER); await first; });
  });

  it("reload re-reads the backend and replaces both copies, discarding the draft", async () => {
    const { result } = await loaded();
    act(() => result.current.updateDraft((draft) => ({ ...draft, columns: [] })));
    const fresh = builderFor("COTIZACION", "Desde backend");
    getReportBuilder.mockResolvedValue(fresh);

    act(() => result.current.reload());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.persisted).toBe(fresh));

    expect(getReportBuilder).toHaveBeenCalledTimes(2);
    expect(getReportFieldCatalog).toHaveBeenCalledTimes(2);
    expect(result.current.draft).toEqual(builderFormFromDefinition(fresh));
    expect(result.current.dirty).toBe(false);
  });

  it("falls back to an empty draft and reports the error when the builder cannot be loaded", async () => {
    getReportBuilder.mockRejectedValue(new ApiError(500, "Backend caído."));
    getReportFieldCatalog.mockRejectedValue(new ApiError(503, "Catálogo caído."));
    const { result } = await loaded();
    expect(result.current).toMatchObject({ persisted: null, loadError: "Backend caído.", catalogError: "Catálogo caído.", fields: [] });
    expect(result.current.draft).toEqual(emptyBuilderForm());
  });

  it("starts over when the wizard switches to another report", async () => {
    const other = builderFor("OTRO", "Otro reporte");
    const hook = await loaded();
    act(() => hook.result.current.updateDraft((draft) => ({ ...draft, columns: [] })));

    getReportBuilder.mockResolvedValue(other);
    hook.rerender({ current: "OTRO" });
    // Nothing of COTIZACION survives, not even its unsaved draft.
    expect(hook.result.current).toMatchObject({ code: "OTRO", loading: true, draft: null, persisted: null, fields: null, dirty: false });
    await waitFor(() => expect(hook.result.current.persisted).toBe(other));
    expect(getReportBuilder).toHaveBeenLastCalledWith("OTRO", expect.anything());
    expect(hook.result.current.draft).toEqual(builderFormFromDefinition(other));
  });
});
