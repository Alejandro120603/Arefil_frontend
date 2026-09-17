// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportDocumentDownloadButton } from "./report-document-download-button";
import { ApiError } from "@/lib/api/errors";

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
  it("renders the quotation from the execution snapshot alone", async () => {
    downloadReportDocumentXlsx.mockResolvedValue({ blob: new Blob(["PK"]), filename: "cotizacion-bonatti.xlsx" });
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButton code="COTIZACION" executionId={EXECUTION_ID} />);

    await user.click(screen.getByRole("button", { name: "Descargar cotización Excel" }));
    await waitFor(() => expect(downloadReportDocumentXlsx).toHaveBeenCalledWith(
      "COTIZACION", EXECUTION_ID, expect.anything(),
    ));
    // `triggerBrowserDownload` prefers the backend's Content-Disposition name;
    // this is only the fallback it falls back to.
    expect(triggerBrowserDownload).toHaveBeenCalledWith(expect.anything(), "cotizacion-document.xlsx");
  });

  it("cannot be used without an execution id", async () => {
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButton code="COTIZACION" executionId={null} />);

    const button = screen.getByRole("button", { name: "Descargar cotización Excel" }) as HTMLButtonElement;
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

    await user.click(screen.getByRole("button", { name: "Descargar cotización Excel" }));
    expect(await screen.findByText(/Regenera el reporte para continuar/)).toBeTruthy();
    const button = screen.getByRole("button", { name: "Descargar cotización Excel" }) as HTMLButtonElement;
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

    await user.click(screen.getByRole("button", { name: "Descargar cotización Excel" }));
    expect(await screen.findByText(/Regenera el reporte para continuar/)).toBeTruthy();
    expect(triggerBrowserDownload).not.toHaveBeenCalled();
  });

  it("explains a report with no Excel template without turning it into a crash", async () => {
    downloadReportDocumentXlsx.mockRejectedValue(new ApiError(404, "El reporte no tiene plantilla activa."));
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButton code="COTIZACION" executionId={EXECUTION_ID} />);

    await user.click(screen.getByRole("button", { name: "Descargar cotización Excel" }));
    expect(await screen.findByText(/todavía no tiene una plantilla Excel configurada/)).toBeTruthy();
    expect(triggerBrowserDownload).not.toHaveBeenCalled();
    // A missing template is a configuration state, not a stale snapshot: the
    // same execution stays downloadable once the administrator uploads one.
    expect((screen.getByRole("button", { name: "Descargar cotización Excel" }) as HTMLButtonElement).disabled)
      .toBe(false);
  });

  it("surfaces a render failure and stays usable for a retry", async () => {
    downloadReportDocumentXlsx
      .mockRejectedValueOnce(new ApiError(500, "Falló el render."))
      .mockResolvedValueOnce({ blob: new Blob(["PK"]), filename: null });
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButton code="COTIZACION" executionId={EXECUTION_ID} />);

    await user.click(screen.getByRole("button", { name: "Descargar cotización Excel" }));
    expect(await screen.findByText("Falló el render.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Descargar cotización Excel" }));
    await waitFor(() => expect(triggerBrowserDownload).toHaveBeenCalledWith(expect.anything(), "cotizacion-document.xlsx"));
    expect(screen.queryByText("Falló el render.")).toBeNull();
  });

  it("refuses to save an empty document", async () => {
    downloadReportDocumentXlsx.mockResolvedValue({ blob: new Blob([]), filename: null });
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButton code="COTIZACION" executionId={EXECUTION_ID} />);

    await user.click(screen.getByRole("button", { name: "Descargar cotización Excel" }));
    expect(await screen.findByText("El backend devolvió un documento vacío.")).toBeTruthy();
    expect(triggerBrowserDownload).not.toHaveBeenCalled();
  });
});
