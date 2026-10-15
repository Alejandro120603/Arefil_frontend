// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { ReportColumn, ReportDefinition } from "@/types/api";
import type { FrozenLetterhead, ReportLetterheadOptions } from "@/types/letterhead-runtime";

const reportsApi = vi.hoisted(() => ({
  executeReport: vi.fn(),
  listAllReportParameterOptions: vi.fn(),
  searchReportProductOptions: vi.fn(),
  resolveReportProductOption: vi.fn(),
  downloadReportData: vi.fn(),
  downloadReportDocumentXlsx: vi.fn(),
}));
vi.mock("@/lib/api/reports", () => reportsApi);
const { getReportLetterheadOptions } = vi.hoisted(() => ({ getReportLetterheadOptions: vi.fn() }));
vi.mock("@/lib/api/letterhead-runtime", () => ({ getReportLetterheadOptions }));
const { fetchProtectedImage } = vi.hoisted(() => ({ fetchProtectedImage: vi.fn() }));
vi.mock("@/lib/api/protected-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/protected-image")>()),
  fetchProtectedImage,
}));
const { triggerBrowserDownload } = vi.hoisted(() => ({ triggerBrowserDownload: vi.fn() }));
vi.mock("@/lib/download", () => ({ triggerBrowserDownload }));

import { GenericReportRuntime } from "./generic-report-runtime";

const DATA_SOURCE = {
  id: 5, code: "QUOTATION_ROWS", name: "Renglones de cotización", description: null, enabled: true,
  capabilities: ["REPEATABLE_ROWS"],
};

function quotationReport(code: "PRUEBA_COTIZACION" | "PRUEBA_DESCUENTO"): ReportDefinition {
  const discount = code === "PRUEBA_DESCUENTO";
  return {
    code,
    name: discount ? "Prueba descuento" : "Prueba cotización",
    description: null,
    category: null,
    filename_template: null,
    enabled: true,
    data_source_id: 5,
    data_source: DATA_SOURCE,
    parameters: [{
      name: "price_list_id", label: "Lista de precios", input_type: "select", data_type: "integer", required: true,
      default_value: 7, display_order: 0, configuration_json: { options_source: "price_lists" },
    }],
    parameter_groups: [{
      name: "items", label: "Productos", resolver_key: "products_by_price_list", context_parameter: "price_list_id",
      min_items: 1, max_items: null, display_order: 0,
      fields: [
        { name: "product_id", label: "SKU", data_type: "integer", input_type: "select", required: true, default_value: null, display_order: 0, configuration_json: { options_source: "products_by_price_list", context_parameter: "price_list_id" } },
        { name: "quantity", label: "Cantidad", data_type: "integer", input_type: "number", required: true, default_value: 1, display_order: 1, configuration_json: { minimum: 0, exclusive_minimum: true } },
        ...(discount ? [{ name: "discount", label: "Descuento", data_type: "decimal" as const, input_type: "number" as const, required: true, default_value: "0", display_order: 2, configuration_json: { minimum: 0, maximum: 100 } }] : []),
      ],
    }],
    created_at: "2026-10-13T12:00:00Z",
    updated_at: "2026-10-13T12:00:00Z",
  };
}

const COLUMNS: ReportColumn[] = [
  { key: "part_number", label: "Número de parte", column_type: "FIELD", source_field: "product.part_number", source_parameter: null, formula_definition: null, data_type: "string", format_type: "text", display_order: 0, visible: true, width: null },
  { key: "unit_price", label: "Precio unitario", column_type: "FIELD", source_field: "price_list_item.unit_price", source_parameter: null, formula_definition: null, data_type: "decimal", format_type: "currency", display_order: 1, visible: true, width: null },
  { key: "quantity", label: "Cantidad", column_type: "PARAMETER", source_field: null, source_parameter: "items.quantity", formula_definition: null, data_type: "integer", format_type: "number", display_order: 2, visible: true, width: null },
  { key: "line_total", label: "Importe", column_type: "FORMULA", source_field: null, source_parameter: null, formula_definition: "ROUND(quantity * unit_price, 2)", data_type: "decimal", format_type: "currency", display_order: 3, visible: true, width: null },
];

const PRODUCT = {
  value: 101, label: "P550202 · Filtro", product_id: 101, part_number: "P550202", item_number: null,
  description: "Filtro", unit_price: "574.13", currency: "MXN", classification: null,
};

function options(code: string, overrides: Partial<ReportLetterheadOptions> = {}): ReportLetterheadOptions {
  return {
    report_code: code,
    supported: true,
    default_letterhead_version_id: null,
    options: [
      { letterhead_version_id: null, letterhead_id: null, label: "Sin membrete", is_default: true },
      {
        letterhead_version_id: 11, letterhead_id: 1, label: "Asistente de ventas", slug: "asistente-ventas",
        display_name: "Asistente de ventas", version: 2, display_order: 0, is_default: false,
        thumbnail_url: `/api/reports/${code}/letterheads/1/thumbnail`, thumbnail_checksum_sha256: "a".repeat(64),
        thumbnail_media_type: "image/png", thumbnail_width: 340, thumbnail_height: 440,
      },
      {
        letterhead_version_id: 21, letterhead_id: 2, label: "Olivia Banda", slug: "olivia-banda",
        display_name: "Olivia Banda", version: 1, display_order: 1, is_default: false,
        thumbnail_url: `/api/reports/${code}/letterheads/2/thumbnail`, thumbnail_checksum_sha256: "b".repeat(64),
        thumbnail_media_type: "image/png", thumbnail_width: 340, thumbnail_height: 440,
      },
    ],
    ...overrides,
  };
}

function frozen(versionId: number, displayName: string, version: number): FrozenLetterhead {
  const asset = { media_type: "image/png", width: 10, height: 10, size_bytes: 1, checksum_sha256: "c".repeat(64) };
  return {
    letterhead_id: versionId === 11 ? 1 : 2, letterhead_version_id: versionId, version, slug: "x", display_name: displayName,
    layout_schema_version: 1, layout_checksum_sha256: "d".repeat(64), source_checksum_sha256: "e".repeat(64),
    paper: "letter", orientation: "portrait",
    assets: { header: asset, watermark: asset, footer: asset, thumbnail: asset },
  };
}

function execution(executionId: string, letterhead: FrozenLetterhead | null) {
  return {
    execution_id: executionId,
    document_available: true,
    columns: [{ key: "part_number", label: "Número de parte", data_type: "string", format_type: "text" }],
    parameters: { price_list_id: 7 },
    rows: [{ part_number: "P550202" }],
    summary: {}, totals: {}, row_count: 1, truncated: false,
    presentation: { letterhead },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  reportsApi.listAllReportParameterOptions.mockResolvedValue([{ value: 7, label: "Donaldson · 2026-10-01" }]);
  reportsApi.searchReportProductOptions.mockResolvedValue([PRODUCT]);
  reportsApi.resolveReportProductOption.mockResolvedValue(PRODUCT);
  fetchProtectedImage.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  Object.assign(URL, { createObjectURL: vi.fn(() => "blob:thumb"), revokeObjectURL: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

type User = ReturnType<typeof userEvent.setup>;

async function fillLine(user: User, { quantity = "3", discount }: { quantity?: string; discount?: string } = {}) {
  await user.click(await screen.findByRole("combobox", { name: "SKU 1" }));
  await user.click(await screen.findByRole("option", { name: /P550202/ }));
  await user.clear(screen.getByLabelText("Cantidad * 1"));
  await user.type(screen.getByLabelText("Cantidad * 1"), quantity);
  if (discount != null) {
    await user.clear(screen.getByLabelText("Descuento (%) * 1"));
    await user.type(screen.getByLabelText("Descuento (%) * 1"), discount);
  }
}

function generateButton() {
  return screen.getByRole("button", { name: /^(Generar reporte|Regenerar reporte|Generando\.\.\.)$/ }) as HTMLButtonElement;
}

async function waitForReady() {
  await waitFor(() => expect(generateButton().disabled).toBe(false));
}

function radio(name: RegExp) {
  return screen.getByRole("radio", { name }) as HTMLInputElement;
}

function renderReport(code: "PRUEBA_COTIZACION" | "PRUEBA_DESCUENTO" = "PRUEBA_COTIZACION") {
  return render(<GenericReportRuntime report={quotationReport(code)} columns={COLUMNS} />);
}

describe("Presentación del documento — selection", () => {
  it("starts on «Sin membrete» when the default is null and sends null beside the business parameters", async () => {
    getReportLetterheadOptions.mockResolvedValue(options("PRUEBA_COTIZACION"));
    reportsApi.executeReport.mockResolvedValue(execution("e-none", null));
    const user = userEvent.setup();
    renderReport();
    expect(await screen.findByRole("group", { name: "Presentación del documento" })).toBeTruthy();
    expect(radio(/Sin membrete/).checked).toBe(true);
    expect(radio(/Asistente de ventas/).checked).toBe(false);
    await fillLine(user);
    await waitForReady();
    await user.click(generateButton());
    await waitFor(() => expect(reportsApi.executeReport).toHaveBeenCalledWith("PRUEBA_COTIZACION", {
      price_list_id: 7,
      items: [{ product_id: 101, quantity: 3 }],
      presentation: { letterhead_version_id: null },
    }, expect.anything()));
    expect(await screen.findByText("Sin membrete (formato actual)")).toBeTruthy();
    // The existing document button keeps working from the execution id.
    reportsApi.downloadReportDocumentXlsx.mockResolvedValue({ blob: new Blob(["xlsx"]), filename: "cotizacion.xlsx" });
    await user.click(screen.getByRole("button", { name: "Descargar documento Excel" }));
    await waitFor(() => expect(reportsApi.downloadReportDocumentXlsx).toHaveBeenCalledWith("PRUEBA_COTIZACION", "e-none", expect.anything()));
  });

  it("starts on the backend default and describes the execution with the frozen data, not the catalog", async () => {
    getReportLetterheadOptions.mockResolvedValue(options("PRUEBA_COTIZACION", {
      default_letterhead_version_id: 21,
      options: options("PRUEBA_COTIZACION").options.map((option) => ({ ...option, is_default: option.letterhead_version_id === 21 })),
    }));
    reportsApi.executeReport.mockResolvedValue(execution("e-21", frozen(21, "Olivia Banda (congelado)", 1)));
    const user = userEvent.setup();
    renderReport();
    await waitFor(() => expect(radio(/Olivia Banda/).checked).toBe(true));
    expect(within(radio(/Olivia Banda/).closest("label") as HTMLElement).getByText("Predeterminado")).toBeTruthy();
    await fillLine(user);
    await waitForReady();
    await user.click(generateButton());
    await waitFor(() => expect(reportsApi.executeReport).toHaveBeenCalledWith(
      "PRUEBA_COTIZACION", expect.objectContaining({ presentation: { letterhead_version_id: 21 } }), expect.anything(),
    ));
    expect(await screen.findByText("Olivia Banda (congelado) · versión 1")).toBeTruthy();
    reportsApi.downloadReportDocumentXlsx.mockResolvedValue({ blob: new Blob(["xlsx"]), filename: "membretado.xlsx" });
    await user.click(screen.getByRole("button", { name: "Descargar documento Excel" }));
    // Only the execution id: no commercial parameter is sent again.
    await waitFor(() => expect(reportsApi.downloadReportDocumentXlsx).toHaveBeenCalledWith("PRUEBA_COTIZACION", "e-21", expect.anything()));
  });

  it("lists the options in backend order with their protected thumbnails and versions", async () => {
    getReportLetterheadOptions.mockResolvedValue(options("PRUEBA_COTIZACION"));
    renderReport();
    await screen.findByRole("group", { name: "Presentación del documento" });
    expect(screen.getAllByRole("radio").map((input) => input.closest("label")?.querySelector(".font-medium")?.textContent))
      .toEqual(["Sin membrete", "Asistente de ventas", "Olivia Banda"]);
    expect(screen.getByText("Utilizar formato actual")).toBeTruthy();
    expect(screen.getByText("Versión 2")).toBeTruthy();
    await waitFor(() => expect(fetchProtectedImage).toHaveBeenCalledWith(
      "/reports/PRUEBA_COTIZACION/letterheads/1/thumbnail", expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
    await waitFor(() => expect(document.querySelectorAll('img[src="blob:thumb"]')).toHaveLength(2));
  });

  it("keeps an option selectable when its thumbnail fails", async () => {
    getReportLetterheadOptions.mockResolvedValue(options("PRUEBA_COTIZACION"));
    fetchProtectedImage.mockRejectedValue(new ApiError(404, { code: "letterhead_not_found", message: "x" }));
    const user = userEvent.setup();
    renderReport();
    expect(await screen.findAllByText("Miniatura no disponible")).toHaveLength(2);
    await user.click(radio(/Asistente de ventas/));
    expect(radio(/Asistente de ventas/).checked).toBe(true);
  });

  it("offers only «Sin membrete» when nothing is assigned, without fake options", async () => {
    getReportLetterheadOptions.mockResolvedValue(options("PRUEBA_COTIZACION", {
      options: [{ letterhead_version_id: null, letterhead_id: null, label: "Sin membrete", is_default: true }],
    }));
    reportsApi.executeReport.mockResolvedValue(execution("e-1", null));
    const user = userEvent.setup();
    renderReport();
    expect(await screen.findByText(/todavía no tiene membretes disponibles/)).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(1);
    await fillLine(user);
    await waitForReady();
    await user.click(generateButton());
    await waitFor(() => expect(reportsApi.executeReport).toHaveBeenCalledWith(
      "PRUEBA_COTIZACION", expect.objectContaining({ presentation: { letterhead_version_id: null } }), expect.anything(),
    ));
  });

  it("shows no selector and sends no presentation when the report does not support letterheads", async () => {
    getReportLetterheadOptions.mockResolvedValue(options("PRUEBA_COTIZACION", { supported: false, options: [options("x").options[0]] }));
    reportsApi.executeReport.mockResolvedValue(execution("e-legacy", null));
    const user = userEvent.setup();
    renderReport();
    await fillLine(user);
    await waitForReady();
    expect(screen.queryByText("Presentación del documento")).toBeNull();
    await user.click(generateButton());
    await waitFor(() => expect(reportsApi.executeReport).toHaveBeenCalledWith("PRUEBA_COTIZACION", {
      price_list_id: 7, items: [{ product_id: 101, quantity: 3 }],
    }, expect.anything()));
    expect(screen.queryByText(/Presentación de esta ejecución/)).toBeNull();
  });

  it("asks the backend about support even when the builder columns failed to load", async () => {
    // The report page renders a runnable report with `columns=[]` when its
    // separate builder request fails: that must not skip the admin's default.
    getReportLetterheadOptions.mockResolvedValue(options("PRUEBA_COTIZACION", { default_letterhead_version_id: 11 }));
    reportsApi.executeReport.mockResolvedValue(execution("e-nocols", frozen(11, "Asistente de ventas", 2)));
    const user = userEvent.setup();
    render(<GenericReportRuntime report={quotationReport("PRUEBA_COTIZACION")} />);
    await waitFor(() => expect(radio(/Asistente de ventas/).checked).toBe(true));
    await fillLine(user);
    await waitForReady();
    await user.click(generateButton());
    await waitFor(() => expect(reportsApi.executeReport).toHaveBeenCalledWith(
      "PRUEBA_COTIZACION", expect.objectContaining({ presentation: { letterhead_version_id: 11 } }), expect.anything(),
    ));
  });

  it("keeps a report the backend does not support exactly as before", async () => {
    getReportLetterheadOptions.mockResolvedValue({
      report_code: "SQL_REPORT", supported: false, default_letterhead_version_id: null,
      options: [{ letterhead_version_id: null, letterhead_id: null, label: "Sin membrete", is_default: true }],
    });
    reportsApi.executeReport.mockResolvedValue({ columns: [], rows: [], row_count: 0 });
    const report = { ...quotationReport("PRUEBA_COTIZACION"), code: "SQL_REPORT", parameters: [], parameter_groups: [] };
    const user = userEvent.setup();
    render(<GenericReportRuntime report={report} />);
    await waitForReady();
    expect(screen.queryByText("Presentación del documento")).toBeNull();
    await user.click(generateButton());
    await waitFor(() => expect(reportsApi.executeReport).toHaveBeenCalledWith("SQL_REPORT", {}, expect.anything()));
  });

  it("after a failed refresh keeps the loaded selection and does not promise a plain document", async () => {
    getReportLetterheadOptions
      .mockResolvedValueOnce(options("PRUEBA_COTIZACION"))
      .mockRejectedValueOnce(new ApiError(500, "Catálogo no disponible."));
    reportsApi.executeReport.mockResolvedValue(execution("e-kept", frozen(21, "Olivia Banda", 1)));
    const user = userEvent.setup();
    renderReport();
    await fillLine(user);
    await waitForReady();
    await user.click(radio(/Olivia Banda/));
    await user.click(screen.getByRole("button", { name: "Actualizar opciones" }));
    expect(await screen.findByText(/Se mantienen las opciones cargadas antes y la selección actual/)).toBeTruthy();
    expect(screen.queryByText(/el documento usará el formato actual/)).toBeNull();
    expect(radio(/Olivia Banda/).checked).toBe(true);
    await waitForReady();
    await user.click(generateButton());
    await waitFor(() => expect(reportsApi.executeReport).toHaveBeenCalledWith(
      "PRUEBA_COTIZACION", expect.objectContaining({ presentation: { letterhead_version_id: 21 } }), expect.anything(),
    ));
  });

  it("waits for the options before generating, so the backend default is never skipped", async () => {
    const pending = deferred<ReportLetterheadOptions>();
    getReportLetterheadOptions.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    renderReport();
    await fillLine(user);
    expect(screen.getByLabelText("Cargando opciones de membrete")).toBeTruthy();
    expect(generateButton().disabled).toBe(true);
    await act(async () => pending.resolve(options("PRUEBA_COTIZACION", { default_letterhead_version_id: 11 })));
    await waitForReady();
    expect(radio(/Asistente de ventas/).checked).toBe(true);
  });

  it("lets the user generate without a letterhead when the options cannot be loaded, and says so", async () => {
    getReportLetterheadOptions.mockRejectedValueOnce(new ApiError(500, "Error del catálogo."))
      .mockResolvedValueOnce(options("PRUEBA_COTIZACION"));
    reportsApi.executeReport.mockResolvedValue(execution("e-x", null));
    const user = userEvent.setup();
    renderReport();
    expect(await screen.findByText(/Si generas ahora, el documento usará el formato actual/)).toBeTruthy();
    await fillLine(user);
    await waitForReady();
    await user.click(generateButton());
    await waitFor(() => expect(reportsApi.executeReport).toHaveBeenCalledWith("PRUEBA_COTIZACION", {
      price_list_id: 7, items: [{ product_id: 101, quantity: 3 }],
    }, expect.anything()));
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("group", { name: "Presentación del documento" })).toBeTruthy();
  });

  it("refuses an execution whose frozen presentation is not the one requested", async () => {
    getReportLetterheadOptions.mockResolvedValue(options("PRUEBA_COTIZACION"));
    reportsApi.executeReport.mockResolvedValue(execution("e-wrong", frozen(21, "Olivia Banda", 1)));
    const user = userEvent.setup();
    renderReport();
    await fillLine(user);
    await waitForReady();
    await user.click(radio(/Asistente de ventas/));
    await user.click(generateButton());
    expect(await screen.findByText("La ejecución no corresponde a la presentación elegida. Genera el reporte de nuevo.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Descargar documento Excel" })).toBeNull();
  });
});

describe("Presentación del documento — invalidation and concurrency", () => {
  it("invalidates the execution when the letterhead changes, in both directions", async () => {
    getReportLetterheadOptions.mockResolvedValue(options("PRUEBA_COTIZACION"));
    reportsApi.executeReport
      .mockResolvedValueOnce(execution("e-a", null))
      .mockResolvedValueOnce(execution("e-b", frozen(11, "Asistente de ventas", 2)))
      .mockResolvedValueOnce(execution("e-c", null));
    const user = userEvent.setup();
    renderReport();
    await fillLine(user);
    await waitForReady();
    await user.click(generateButton());
    expect(await screen.findByRole("button", { name: "Descargar documento Excel" })).toBeTruthy();

    await user.click(radio(/Asistente de ventas/));
    expect(screen.queryByRole("button", { name: "Descargar documento Excel" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Descargar Excel de datos" })).toBeNull();
    expect(screen.queryByText("Vista previa del reporte")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Regenerar reporte" }));
    expect(await screen.findByText("Asistente de ventas · versión 2")).toBeTruthy();

    await user.click(radio(/Sin membrete/));
    expect(screen.queryByText("Asistente de ventas · versión 2")).toBeNull();
    expect(screen.queryByRole("button", { name: "Descargar documento Excel" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Regenerar reporte" }));
    expect(await screen.findByText("Sin membrete (formato actual)")).toBeTruthy();
    expect(reportsApi.executeReport.mock.calls.map(([, body]) => (body as { presentation: unknown }).presentation)).toEqual([
      { letterhead_version_id: null }, { letterhead_version_id: 11 }, { letterhead_version_id: null },
    ]);
  });

  it("aborts the generation in flight when the letterhead changes", async () => {
    getReportLetterheadOptions.mockResolvedValue(options("PRUEBA_COTIZACION"));
    let signal: AbortSignal | undefined;
    reportsApi.executeReport.mockImplementation((_code: string, _body: unknown, init: { signal: AbortSignal }) => {
      signal = init.signal;
      return new Promise(() => undefined);
    });
    const user = userEvent.setup();
    renderReport();
    await fillLine(user);
    await waitForReady();
    await user.click(generateButton());
    expect(screen.getByRole("button", { name: "Generando..." })).toBeTruthy();
    await user.click(radio(/Olivia Banda/));
    expect(signal?.aborted).toBe(true);
    expect(screen.getByRole("button", { name: "Generar reporte" })).toBeTruthy();
  });

  it("ignores a late response that ignored the abort", async () => {
    getReportLetterheadOptions.mockResolvedValue(options("PRUEBA_COTIZACION"));
    const late = deferred<unknown>();
    reportsApi.executeReport.mockReturnValueOnce(late.promise);
    const user = userEvent.setup();
    renderReport();
    await fillLine(user);
    await waitForReady();
    await user.click(generateButton());
    await user.click(radio(/Asistente de ventas/));
    // The old request answers anyway, with the old presentation.
    await act(async () => late.resolve(execution("e-old", null)));
    expect(screen.queryByText("Vista previa del reporte")).toBeNull();
    expect(screen.queryByRole("button", { name: "Descargar documento Excel" })).toBeNull();
    expect(radio(/Asistente de ventas/).checked).toBe(true);
  });

  it("cancels a document download of a discarded execution and never saves it", async () => {
    getReportLetterheadOptions.mockResolvedValue(options("PRUEBA_COTIZACION"));
    reportsApi.executeReport.mockResolvedValue(execution("e-doc", null));
    const download = deferred<{ blob: Blob; filename: string }>();
    let signal: AbortSignal | undefined;
    reportsApi.downloadReportDocumentXlsx.mockImplementation((_code: string, _id: string, init: { signal: AbortSignal }) => {
      signal = init.signal;
      return download.promise;
    });
    const user = userEvent.setup();
    renderReport();
    await fillLine(user);
    await waitForReady();
    await user.click(generateButton());
    await user.click(await screen.findByRole("button", { name: "Descargar documento Excel" }));
    await user.click(radio(/Olivia Banda/));
    expect(signal?.aborted).toBe(true);
    await act(async () => download.resolve({ blob: new Blob(["xlsx"]), filename: "obsoleto.xlsx" }));
    expect(triggerBrowserDownload).not.toHaveBeenCalled();
  });

  it("does not show stale generation errors after a letterhead change", async () => {
    getReportLetterheadOptions.mockResolvedValue(options("PRUEBA_COTIZACION"));
    reportsApi.executeReport.mockRejectedValueOnce(new ApiError(500, "Fallo temporal."));
    const user = userEvent.setup();
    renderReport();
    await fillLine(user);
    await waitForReady();
    await user.click(generateButton());
    expect(await screen.findByText("Fallo temporal.")).toBeTruthy();
    await user.click(radio(/Olivia Banda/));
    expect(screen.queryByText("Fallo temporal.")).toBeNull();
  });
});

describe("Presentación del documento — catalog changes", () => {
  it("on 422 LETTERHEAD_UNAVAILABLE refreshes the options and asks for a new choice without substituting one", async () => {
    getReportLetterheadOptions
      .mockResolvedValueOnce(options("PRUEBA_COTIZACION"))
      .mockResolvedValueOnce(options("PRUEBA_COTIZACION", {
        options: options("PRUEBA_COTIZACION").options.filter((option) => option.letterhead_version_id !== 21),
      }));
    reportsApi.executeReport
      .mockRejectedValueOnce(new ApiError(422, { code: "LETTERHEAD_UNAVAILABLE", message: "El membrete 'olivia-banda' está desactivado." }))
      .mockResolvedValueOnce(execution("e-ok", null));
    const user = userEvent.setup();
    renderReport();
    await fillLine(user);
    await waitForReady();
    await user.click(radio(/Olivia Banda/));
    await user.click(generateButton());

    expect(await screen.findByText(/El membrete 'olivia-banda' está desactivado\. Actualizamos las opciones/)).toBeTruthy();
    expect(await screen.findByText(/El membrete que elegiste ya no está disponible/)).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /Olivia Banda/ })).toBeNull();
    expect(screen.getAllByRole("radio").some((input) => (input as HTMLInputElement).checked)).toBe(false);
    expect(screen.getByText("Elige la presentación del documento.")).toBeTruthy();
    expect(generateButton().disabled).toBe(true);
    expect(screen.queryByText("Vista previa del reporte")).toBeNull();
    expect(reportsApi.executeReport).toHaveBeenCalledTimes(1);

    await user.click(radio(/Sin membrete/));
    await user.click(generateButton());
    await waitFor(() => expect(reportsApi.executeReport).toHaveBeenLastCalledWith(
      "PRUEBA_COTIZACION", expect.objectContaining({ presentation: { letterhead_version_id: null } }), expect.anything(),
    ));
  });

  it("on 409 keeps a selection that is still offered and lets the user retry by hand", async () => {
    getReportLetterheadOptions.mockResolvedValue(options("PRUEBA_COTIZACION"));
    reportsApi.executeReport.mockRejectedValueOnce(
      new ApiError(409, { code: "LETTERHEAD_CONFLICT", message: "El catálogo cambió al mismo tiempo." }),
    );
    const user = userEvent.setup();
    renderReport();
    await fillLine(user);
    await waitForReady();
    await user.click(radio(/Asistente de ventas/));
    await user.click(generateButton());
    expect(await screen.findByText(/El catálogo cambió al mismo tiempo\./)).toBeTruthy();
    await waitFor(() => expect(getReportLetterheadOptions).toHaveBeenCalledTimes(2));
    await waitForReady();
    expect(radio(/Asistente de ventas/).checked).toBe(true);
    expect(reportsApi.executeReport).toHaveBeenCalledTimes(1);
  });

  it("treats a new version uploaded meanwhile as a change the user must confirm", async () => {
    getReportLetterheadOptions
      .mockResolvedValueOnce(options("PRUEBA_COTIZACION", { default_letterhead_version_id: 11 }))
      .mockResolvedValueOnce(options("PRUEBA_COTIZACION", {
        default_letterhead_version_id: 12,
        options: options("PRUEBA_COTIZACION").options.map((option) =>
          option.letterhead_version_id === 11 ? { ...option, letterhead_version_id: 12, version: 3 } : option),
      }));
    const user = userEvent.setup();
    renderReport();
    await waitFor(() => expect(radio(/Asistente de ventas/).checked).toBe(true));
    await user.click(screen.getByRole("button", { name: "Actualizar opciones" }));
    expect(await screen.findByText(/ya no está disponible o cambió de versión/)).toBeTruthy();
    expect(radio(/Asistente de ventas/).checked).toBe(false);
    expect(screen.getByText("Versión 3")).toBeTruthy();
    await user.click(radio(/Asistente de ventas/));
    expect(screen.queryByText(/ya no está disponible o cambió de versión/)).toBeNull();
  });
});

describe("Presentación del documento — Descuento", () => {
  it("keeps quantities and discounts exactly as typed and adds only the presentation", async () => {
    getReportLetterheadOptions.mockResolvedValue(options("PRUEBA_DESCUENTO"));
    reportsApi.executeReport.mockResolvedValue(execution("e-desc", frozen(11, "Asistente de ventas", 2)));
    reportsApi.downloadReportData.mockResolvedValue({ blob: new Blob(["csv"]), filename: "datos.csv" });
    const user = userEvent.setup();
    renderReport("PRUEBA_DESCUENTO");
    await fillLine(user, { quantity: "4", discount: "12.5" });
    await waitForReady();
    await user.click(radio(/Asistente de ventas/));
    await user.click(generateButton());
    await waitFor(() => expect(reportsApi.executeReport).toHaveBeenCalledWith("PRUEBA_DESCUENTO", {
      price_list_id: 7,
      items: [{ product_id: 101, quantity: 4, discount: "12.5" }],
      presentation: { letterhead_version_id: 11 },
    }, expect.anything()));
    // Tabular exports still use only the execution id.
    await user.click(await screen.findByRole("button", { name: "Descargar CSV de datos" }));
    await waitFor(() => expect(reportsApi.downloadReportData).toHaveBeenCalledWith(
      "PRUEBA_DESCUENTO", "csv", { executionId: "e-desc" }, expect.anything(),
    ));
  });

  it("still validates discounts before generating", async () => {
    getReportLetterheadOptions.mockResolvedValue(options("PRUEBA_DESCUENTO"));
    const user = userEvent.setup();
    renderReport("PRUEBA_DESCUENTO");
    await fillLine(user, { discount: "150" });
    await screen.findByRole("group", { name: "Presentación del documento" });
    expect(generateButton().disabled).toBe(true);
    expect(reportsApi.executeReport).not.toHaveBeenCalled();
  });
});

describe("Presentación del documento — accessibility and layout", () => {
  it("is a labelled radio group operable with the keyboard, placed before «Generar reporte»", async () => {
    getReportLetterheadOptions.mockResolvedValue(options("PRUEBA_COTIZACION"));
    const user = userEvent.setup();
    renderReport();
    const group = await screen.findByRole("group", { name: "Presentación del documento" });
    const none = radio(/Sin membrete/);
    none.focus();
    await user.keyboard("{ArrowDown}");
    expect(radio(/Asistente de ventas/).checked).toBe(true);
    expect(document.activeElement).toBe(radio(/Asistente de ventas/));
    // The selected state is the native one; the visible check is not read twice.
    const indicator = within(radio(/Asistente de ventas/).closest("label") as HTMLElement).getByText("Seleccionado");
    expect(indicator.closest("[aria-hidden]")).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    // Order in the page: parameters, presentation, then the button.
    const button = generateButton();
    expect(group.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("link", { name: /miniatura/i })).toBeNull();
  });

  it("stacks options in one column on small screens without fixed widths", async () => {
    getReportLetterheadOptions.mockResolvedValue(options("PRUEBA_COTIZACION"));
    renderReport();
    const group = await screen.findByRole("group", { name: "Presentación del documento" });
    const grid = group.querySelector(".grid") as HTMLElement;
    expect(grid.className).toBe("grid gap-3 sm:grid-cols-2 lg:grid-cols-3");
    for (const label of group.querySelectorAll("label")) expect(label.className).toContain("min-w-0");
  });
});

describe("Presentación del documento — navigation between reports in a mounted runtime", () => {
  const withDefault = (code: string, versionId: number | null) => {
    const base = options(code);
    return {
      ...base,
      default_letterhead_version_id: versionId,
      options: base.options.map((option) => ({ ...option, is_default: option.letterhead_version_id === versionId })),
    };
  };
  function optionsByCode(byCode: Record<string, ReportLetterheadOptions | Promise<ReportLetterheadOptions>>) {
    getReportLetterheadOptions.mockImplementation((code: string) => Promise.resolve(byCode[code]));
  }
  function view(code: "PRUEBA_COTIZACION" | "PRUEBA_DESCUENTO") {
    return <GenericReportRuntime report={quotationReport(code)} columns={COLUMNS} />;
  }

  it("Cotización → Descuento: applies only the new report's default, even when both offer the chosen version", async () => {
    optionsByCode({ PRUEBA_COTIZACION: withDefault("PRUEBA_COTIZACION", 11), PRUEBA_DESCUENTO: withDefault("PRUEBA_DESCUENTO", null) });
    reportsApi.executeReport.mockResolvedValue(execution("e-desc", null));
    const user = userEvent.setup();
    const { rerender } = render(view("PRUEBA_COTIZACION"));
    await waitFor(() => expect(radio(/Asistente de ventas/).checked).toBe(true));
    await user.click(radio(/Olivia Banda/));
    rerender(view("PRUEBA_DESCUENTO"));
    // Same render: nothing from Cotización can be sent while Descuento loads.
    expect(screen.queryByRole("group", { name: "Presentación del documento" })).toBeNull();
    expect(generateButton().disabled).toBe(true);
    await waitFor(() => expect(radio(/Sin membrete/).checked).toBe(true));
    expect(radio(/Olivia Banda/).checked).toBe(false);
    // The commercial form is Descuento's own, fresh.
    expect(screen.getByLabelText("Descuento (%) * 1")).toBeTruthy();
    await fillLine(user, { discount: "5" });
    await waitForReady();
    await user.click(generateButton());
    await waitFor(() => expect(reportsApi.executeReport).toHaveBeenCalledWith("PRUEBA_DESCUENTO", {
      price_list_id: 7,
      items: [{ product_id: 101, quantity: 3, discount: "5" }],
      presentation: { letterhead_version_id: null },
    }, expect.anything()));
  });

  it("Descuento → Cotización: different defaults per report, manual choice still possible afterwards", async () => {
    optionsByCode({ PRUEBA_COTIZACION: withDefault("PRUEBA_COTIZACION", 11), PRUEBA_DESCUENTO: withDefault("PRUEBA_DESCUENTO", 21) });
    const user = userEvent.setup();
    const { rerender } = render(view("PRUEBA_DESCUENTO"));
    await waitFor(() => expect(radio(/Olivia Banda/).checked).toBe(true));
    rerender(view("PRUEBA_COTIZACION"));
    await waitFor(() => expect(radio(/Asistente de ventas/).checked).toBe(true));
    expect(radio(/Olivia Banda/).checked).toBe(false);
    expect(screen.queryByLabelText("Descuento (%) * 1")).toBeNull();
    await user.click(radio(/Sin membrete/));
    expect(radio(/Sin membrete/).checked).toBe(true);
  });

  it("hides the selector for a new report the backend does not support", async () => {
    const unsupported = { ...options("PRUEBA_DESCUENTO"), supported: false, options: [options("x").options[0]] };
    optionsByCode({ PRUEBA_COTIZACION: withDefault("PRUEBA_COTIZACION", 11), PRUEBA_DESCUENTO: unsupported });
    reportsApi.executeReport.mockResolvedValue(execution("e-u", null));
    const user = userEvent.setup();
    const { rerender } = render(view("PRUEBA_COTIZACION"));
    await waitFor(() => expect(radio(/Asistente de ventas/).checked).toBe(true));
    rerender(view("PRUEBA_DESCUENTO"));
    await fillLine(user);
    await waitForReady();
    expect(screen.queryByText("Presentación del documento")).toBeNull();
    await user.click(generateButton());
    await waitFor(() => expect(reportsApi.executeReport).toHaveBeenCalledWith("PRUEBA_DESCUENTO", {
      price_list_id: 7, items: [{ product_id: 101, quantity: 3, discount: "0" }],
    }, expect.anything()));
  });

  it("ignores a late options answer of the previous report and blocks generation until the new one loads", async () => {
    const lateCotizacion = deferred<ReportLetterheadOptions>();
    const descuento = deferred<ReportLetterheadOptions>();
    optionsByCode({ PRUEBA_COTIZACION: lateCotizacion.promise, PRUEBA_DESCUENTO: descuento.promise });
    const user = userEvent.setup();
    const { rerender } = render(view("PRUEBA_COTIZACION"));
    rerender(view("PRUEBA_DESCUENTO"));
    await fillLine(user);
    await act(async () => lateCotizacion.resolve(withDefault("PRUEBA_COTIZACION", 11)));
    expect(screen.queryByRole("radio")).toBeNull();
    expect(generateButton().disabled).toBe(true);
    await act(async () => descuento.resolve(withDefault("PRUEBA_DESCUENTO", 21)));
    await waitForReady();
    expect(radio(/Olivia Banda/).checked).toBe(true);
    expect(radio(/Asistente de ventas/).checked).toBe(false);
  });

  it("aborts the previous report's generation and never shows its late result", async () => {
    optionsByCode({ PRUEBA_COTIZACION: withDefault("PRUEBA_COTIZACION", 11), PRUEBA_DESCUENTO: withDefault("PRUEBA_DESCUENTO", null) });
    const late = deferred<unknown>();
    let signal: AbortSignal | undefined;
    reportsApi.executeReport.mockImplementationOnce((_code: string, _body: unknown, init: { signal: AbortSignal }) => {
      signal = init.signal;
      return late.promise;
    });
    const user = userEvent.setup();
    const { rerender } = render(view("PRUEBA_COTIZACION"));
    await fillLine(user);
    await waitForReady();
    await user.click(generateButton());
    rerender(view("PRUEBA_DESCUENTO"));
    expect(signal?.aborted).toBe(true);
    await act(async () => late.resolve(execution("e-cot", frozen(11, "Asistente de ventas", 2))));
    expect(screen.queryByText("Vista previa del reporte")).toBeNull();
    expect(screen.queryByText(/Presentación de esta ejecución/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Descargar/ })).toBeNull();
  });

  it("cancels a document download of the previous report's execution", async () => {
    optionsByCode({ PRUEBA_COTIZACION: withDefault("PRUEBA_COTIZACION", 11), PRUEBA_DESCUENTO: withDefault("PRUEBA_DESCUENTO", null) });
    reportsApi.executeReport.mockResolvedValue(execution("e-cot", frozen(11, "Asistente de ventas", 2)));
    const download = deferred<{ blob: Blob; filename: string }>();
    let signal: AbortSignal | undefined;
    reportsApi.downloadReportDocumentXlsx.mockImplementation((_code: string, _id: string, init: { signal: AbortSignal }) => {
      signal = init.signal;
      return download.promise;
    });
    const user = userEvent.setup();
    const { rerender } = render(view("PRUEBA_COTIZACION"));
    await fillLine(user);
    await waitForReady();
    await user.click(generateButton());
    await user.click(await screen.findByRole("button", { name: "Descargar documento Excel" }));
    rerender(view("PRUEBA_DESCUENTO"));
    expect(signal?.aborted).toBe(true);
    await act(async () => download.resolve({ blob: new Blob(["xlsx"]), filename: "cotizacion.xlsx" }));
    expect(triggerBrowserDownload).not.toHaveBeenCalled();
    expect(reportsApi.downloadReportDocumentXlsx).toHaveBeenCalledTimes(1);
    expect(reportsApi.downloadReportDocumentXlsx).toHaveBeenCalledWith("PRUEBA_COTIZACION", "e-cot", expect.anything());
  });
});
