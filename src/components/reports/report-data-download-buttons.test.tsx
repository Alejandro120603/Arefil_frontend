// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportDataDownloadButtons } from "./report-data-download-buttons";
import { ApiError } from "@/lib/api/errors";

const { downloadReportData, triggerBrowserDownload } = vi.hoisted(() => ({
  downloadReportData: vi.fn(),
  triggerBrowserDownload: vi.fn(),
}));
vi.mock("@/lib/api/reports", () => ({ downloadReportData }));
vi.mock("@/lib/download", () => ({ triggerBrowserDownload }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReportDataDownloadButtons", () => {
  it("exports the snapshot on screen by its execution id, never by parameters", async () => {
    const user = userEvent.setup();
    downloadReportData.mockResolvedValue({ blob: new Blob(["csv"]), filename: "cotizacion.csv" });
    render(<ReportDataDownloadButtons code="COTIZACION" executionId="exec-1" parameters={{ price_list_id: 7 }} />);

    await user.click(screen.getByRole("button", { name: "Descargar CSV de datos" }));
    await user.click(screen.getByRole("button", { name: "Descargar Excel de datos" }));

    await waitFor(() => expect(downloadReportData).toHaveBeenCalledTimes(2));
    expect(downloadReportData.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ["COTIZACION", "csv", { executionId: "exec-1" }],
      ["COTIZACION", "xlsx", { executionId: "exec-1" }],
    ]);
  });

  it("falls back to parameters only for a result without snapshot", async () => {
    const user = userEvent.setup();
    downloadReportData.mockResolvedValue({ blob: new Blob(["csv"]), filename: "r.csv" });
    render(<ReportDataDownloadButtons code="RAW" parameters={{ supplier_id: 1 }} />);
    await user.click(screen.getByRole("button", { name: "Descargar CSV de datos" }));
    await waitFor(() => expect(downloadReportData).toHaveBeenCalledWith("RAW", "csv", { parameters: { supplier_id: 1 } }, expect.anything()));
  });

  it("explains a truncated snapshot instead of a generic error", async () => {
    const user = userEvent.setup();
    downloadReportData.mockRejectedValue(new ApiError(409, {
      code: "EXECUTION_TRUNCATED", message: "La ejecución es una vista previa truncada.", execution_id: "exec-1",
    }));
    render(<ReportDataDownloadButtons code="COTIZACION" executionId="exec-1" parameters={{}} />);
    await user.click(screen.getByRole("button", { name: "Descargar CSV de datos" }));
    expect(await screen.findByText(/solo las primeras filas/)).toBeTruthy();
  });

  it("uses the stable report-code fallback for an XLSX export", async () => {
    const user = userEvent.setup();
    downloadReportData.mockResolvedValue({
      blob: new Blob(["PK"]),
      filename: "COTIZACION_PRODUCTOS-datos.xlsx",
    });
    render(<ReportDataDownloadButtons code="COTIZACION_PRODUCTOS" parameters={{}} />);

    await user.click(screen.getByRole("button", { name: "Descargar Excel de datos" }));

    await waitFor(() => expect(triggerBrowserDownload).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "COTIZACION_PRODUCTOS-datos.xlsx" }),
      "COTIZACION_PRODUCTOS-datos.xlsx",
    ));
  });

  it("rejects an empty backend export instead of saving a misleading file", async () => {
    const user = userEvent.setup();
    downloadReportData.mockResolvedValue({ blob: new Blob([]), filename: "empty.csv" });
    render(<ReportDataDownloadButtons code="REPORT" parameters={{ id: 1 }} />);
    await user.click(screen.getByRole("button", { name: "Descargar CSV de datos" }));
    expect(await screen.findByText(/archivo vacío/)).toBeTruthy();
    expect(triggerBrowserDownload).not.toHaveBeenCalled();
  });

  it("lets the user abort an in-flight export without reporting a backend error", async () => {
    const user = userEvent.setup();
    let requestSignal: AbortSignal | undefined;
    downloadReportData.mockImplementation((_code, _format, _parameters, options) => {
      requestSignal = options?.signal;
      return new Promise((_resolve, reject) => {
        requestSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });
    render(<ReportDataDownloadButtons code="REPORT" parameters={{}} />);
    await user.click(screen.getByRole("button", { name: "Descargar Excel de datos" }));
    await user.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(requestSignal?.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull());
    expect(screen.queryByText(/No se pudieron/)).toBeNull();
  });
});
