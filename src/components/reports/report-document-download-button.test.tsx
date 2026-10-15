// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportDocumentDownloadButton } from "./report-document-download-button";
import { ApiError } from "@/lib/api/errors";
import { XLSX_MEDIA_TYPE } from "@/lib/reports/report-excel-template";

const { downloadReportDocumentXlsx, triggerBrowserDownload } = vi.hoisted(() => ({
  downloadReportDocumentXlsx: vi.fn(), triggerBrowserDownload: vi.fn(),
}));
vi.mock("@/lib/api/reports", () => ({ downloadReportDocumentXlsx }));
vi.mock("@/lib/download", () => ({ triggerBrowserDownload }));

const EXECUTION_ID = "10d693fd-ecc3-4759-aec7-d3d7cb086eb7";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReportDocumentDownloadButton", () => {
  it("never offers a truncated preview snapshot for download", () => {
    render(<ReportDocumentDownloadButton code="COTIZACION" executionId={EXECUTION_ID} truncated />);
    expect((screen.getByRole("button", { name: "Descargar documento Excel" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/solo las primeras filas/)).toBeTruthy();
    expect(downloadReportDocumentXlsx).not.toHaveBeenCalled();
  });

  it("locks the button when the backend refuses a truncated snapshot", async () => {
    downloadReportDocumentXlsx.mockRejectedValue(new ApiError(409, {
      code: "EXECUTION_TRUNCATED", message: "La ejecución es una vista previa truncada.", execution_id: EXECUTION_ID,
    }));
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButton code="COTIZACION" executionId={EXECUTION_ID} />);
    await user.click(screen.getByRole("button", { name: "Descargar documento Excel" }));
    expect(await screen.findByText(/solo las primeras filas/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Descargar documento Excel" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the backend filename and uses the report code only as fallback", async () => {
    downloadReportDocumentXlsx.mockResolvedValue({
      blob: new Blob(["PK"], { type: XLSX_MEDIA_TYPE }),
      filename: "COTIZACION_PRODUCTOS-documento.xlsx",
    });
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButton code="COTIZACION_PRODUCTOS" executionId={EXECUTION_ID} />);

    await user.click(screen.getByRole("button", { name: "Descargar documento Excel" }));
    await waitFor(() => expect(downloadReportDocumentXlsx).toHaveBeenCalledWith(
      "COTIZACION_PRODUCTOS", EXECUTION_ID, expect.anything(),
    ));
    expect(triggerBrowserDownload).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "COTIZACION_PRODUCTOS-documento.xlsx" }),
      "COTIZACION_PRODUCTOS-documento.xlsx",
    );
  });

  it("cannot be used without an execution id", async () => {
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButton code="COTIZACION" executionId={null} />);

    const button = screen.getByRole("button", { name: "Descargar documento Excel" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/Regenera el reporte para continuar/)).toBeTruthy();
    await user.click(button);
    expect(downloadReportDocumentXlsx).not.toHaveBeenCalled();
  });

  it("blocks retries once the backend reports the snapshot as expired", async () => {
    downloadReportDocumentXlsx.mockRejectedValue(
      new ApiError(404, `La ejecución '${EXECUTION_ID}' expiró; genera un preview nuevo.`),
    );
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButton code="COTIZACION" executionId={EXECUTION_ID} />);

    await user.click(screen.getByRole("button", { name: "Descargar documento Excel" }));
    expect(await screen.findByText(/Regenera el reporte para continuar/)).toBeTruthy();
    const button = screen.getByRole("button", { name: "Descargar documento Excel" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await user.click(button);
    expect(downloadReportDocumentXlsx).toHaveBeenCalledTimes(1);
    expect(triggerBrowserDownload).not.toHaveBeenCalled();
  });

  it("treats a snapshot of another report as stale too", async () => {
    downloadReportDocumentXlsx.mockRejectedValue(
      new ApiError(409, `La ejecución '${EXECUTION_ID}' no pertenece al reporte COTIZACION.`),
    );
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButton code="COTIZACION" executionId={EXECUTION_ID} />);

    await user.click(screen.getByRole("button", { name: "Descargar documento Excel" }));
    expect(await screen.findByText(/Regenera el reporte para continuar/)).toBeTruthy();
    expect(triggerBrowserDownload).not.toHaveBeenCalled();
  });

  it("explains a report with no Excel template without turning it into a crash", async () => {
    downloadReportDocumentXlsx.mockRejectedValue(new ApiError(404, "El reporte no tiene plantilla activa."));
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButton code="COTIZACION" executionId={EXECUTION_ID} />);

    await user.click(screen.getByRole("button", { name: "Descargar documento Excel" }));
    expect(await screen.findByText(/todavía no tiene una plantilla Excel configurada/)).toBeTruthy();
    expect(triggerBrowserDownload).not.toHaveBeenCalled();
    // The backend remains authoritative if the response signal and a later
    // download disagree; this low-level control keeps a recoverable error.
    expect((screen.getByRole("button", { name: "Descargar documento Excel" }) as HTMLButtonElement).disabled)
      .toBe(false);
  });

  it("surfaces a render failure and stays usable for a retry", async () => {
    downloadReportDocumentXlsx
      .mockRejectedValueOnce(new ApiError(500, "Falló el render."))
      .mockResolvedValueOnce({ blob: new Blob(["PK"], { type: XLSX_MEDIA_TYPE }), filename: null });
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButton code="COTIZACION" executionId={EXECUTION_ID} />);

    await user.click(screen.getByRole("button", { name: "Descargar documento Excel" }));
    expect(await screen.findByText("Falló el render.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Descargar documento Excel" }));
    await waitFor(() => expect(triggerBrowserDownload).toHaveBeenCalledWith(
      expect.objectContaining({ filename: null }),
      "COTIZACION-documento.xlsx",
    ));
    expect(screen.queryByText("Falló el render.")).toBeNull();
  });

  it("refuses to save an empty document", async () => {
    downloadReportDocumentXlsx.mockResolvedValue({ blob: new Blob([]), filename: null });
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButton code="COTIZACION" executionId={EXECUTION_ID} />);

    await user.click(screen.getByRole("button", { name: "Descargar documento Excel" }));
    expect(await screen.findByText("El backend devolvió un documento vacío.")).toBeTruthy();
    expect(triggerBrowserDownload).not.toHaveBeenCalled();
  });

  it("shows the letterhead document's own refusal instead of the missing-template hint", async () => {
    downloadReportDocumentXlsx
      .mockRejectedValueOnce(new ApiError(409, { code: "LETTERHEAD_INTEGRITY", message: "El membrete guardado no supera la verificación de integridad." }))
      .mockRejectedValueOnce(new ApiError(422, { code: "LETTERHEAD_DOCUMENT_LIMIT", message: "El documento excede 100 páginas.", limit: "pages" }));
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButton code="PRUEBA_COTIZACION" executionId={EXECUTION_ID} />);

    await user.click(screen.getByRole("button", { name: "Descargar documento Excel" }));
    expect(await screen.findByText("El membrete guardado no supera la verificación de integridad.")).toBeTruthy();
    expect(screen.queryByText(/plantilla Excel configurada/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Descargar documento Excel" }));
    expect(await screen.findByText("El documento excede 100 páginas.")).toBeTruthy();
    expect(triggerBrowserDownload).not.toHaveBeenCalled();
  });

  it("never saves a response that is not an XLSX file, and accepts the XLSX media type with parameters", async () => {
    downloadReportDocumentXlsx
      .mockResolvedValueOnce({ blob: new Blob(["<html>"], { type: "text/html" }), filename: "COTIZACION-documento.xlsx" })
      .mockResolvedValueOnce({ blob: new Blob(["PK"]), filename: "COTIZACION-documento.xlsx" })
      .mockResolvedValueOnce({ blob: new Blob(["PK"], { type: `${XLSX_MEDIA_TYPE}; charset=binary` }), filename: "COTIZACION-documento.xlsx" });
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButton code="COTIZACION" executionId={EXECUTION_ID} />);
    const button = () => screen.getByRole("button", { name: "Descargar documento Excel" }) as HTMLButtonElement;

    await user.click(button());
    expect(await screen.findByText(/no devolvió un documento Excel válido/)).toBeTruthy();
    await waitFor(() => expect(button().disabled).toBe(false));
    await user.click(button());
    await waitFor(() => expect(downloadReportDocumentXlsx).toHaveBeenCalledTimes(2));
    expect(triggerBrowserDownload).not.toHaveBeenCalled();

    await waitFor(() => expect(button().disabled).toBe(false));
    await user.click(button());
    await waitFor(() => expect(triggerBrowserDownload).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/no devolvió un documento Excel válido/)).toBeNull();
  });

  it("lets the user cancel a slow document: nothing is saved, no error, and it can be downloaded again", async () => {
    let resolveFirst!: (value: { blob: Blob; filename: string }) => void;
    let signal: AbortSignal | undefined;
    downloadReportDocumentXlsx
      .mockImplementationOnce((_code: string, _id: string, init: { signal: AbortSignal }) => {
        signal = init.signal;
        return new Promise((resolve) => { resolveFirst = resolve; });
      })
      .mockResolvedValueOnce({ blob: new Blob(["PK"], { type: XLSX_MEDIA_TYPE }), filename: "COTIZACION-documento.xlsx" });
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButton code="COTIZACION" executionId={EXECUTION_ID} />);

    await user.click(screen.getByRole("button", { name: "Descargar documento Excel" }));
    expect(screen.getByRole("button", { name: "Generando..." })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
    // A response that ignored the abort is still never saved.
    await act(async () => resolveFirst({ blob: new Blob(["PK"], { type: XLSX_MEDIA_TYPE }), filename: "tarde.xlsx" }));
    expect(triggerBrowserDownload).not.toHaveBeenCalled();
    expect(screen.queryByText(/No se pudo|vacío|válido/)).toBeNull();

    const button = screen.getByRole("button", { name: "Descargar documento Excel" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    await user.click(button);
    await waitFor(() => expect(triggerBrowserDownload).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "COTIZACION-documento.xlsx" }), "COTIZACION-documento.xlsx",
    ));
  });
});
