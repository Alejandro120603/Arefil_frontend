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

const PARAMETERS = { price_list_id: 7, customer_name: "BONATTI MÉXICO", items: [{ product_id: 101, quantity: 4 }] };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReportDocumentDownloadButton", () => {
  it("renders the quotation with exactly the parameters of the execution", async () => {
    downloadReportDocumentXlsx.mockResolvedValue({ blob: new Blob(["PK"]), filename: "cotizacion-bonatti.xlsx" });
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButton code="COTIZACION" parameters={PARAMETERS} />);

    await user.click(screen.getByRole("button", { name: "Descargar cotización Excel" }));
    await waitFor(() => expect(downloadReportDocumentXlsx).toHaveBeenCalledWith(
      "COTIZACION", PARAMETERS, expect.anything(),
    ));
    // `triggerBrowserDownload` prefers the backend's Content-Disposition name;
    // this is only the fallback it falls back to.
    expect(triggerBrowserDownload).toHaveBeenCalledWith(expect.anything(), "cotizacion-document.xlsx");
  });

  it("explains a report with no Excel template without turning it into a crash", async () => {
    downloadReportDocumentXlsx.mockRejectedValue(new ApiError(404, "El reporte no tiene plantilla activa."));
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButton code="COTIZACION" parameters={PARAMETERS} />);

    await user.click(screen.getByRole("button", { name: "Descargar cotización Excel" }));
    expect(await screen.findByText(/todavía no tiene una plantilla Excel configurada/)).toBeTruthy();
    expect(triggerBrowserDownload).not.toHaveBeenCalled();
  });

  it("surfaces a render failure and stays usable for a retry", async () => {
    downloadReportDocumentXlsx
      .mockRejectedValueOnce(new ApiError(500, "Falló el render."))
      .mockResolvedValueOnce({ blob: new Blob(["PK"]), filename: null });
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButton code="COTIZACION" parameters={PARAMETERS} />);

    await user.click(screen.getByRole("button", { name: "Descargar cotización Excel" }));
    expect(await screen.findByText("Falló el render.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Descargar cotización Excel" }));
    await waitFor(() => expect(triggerBrowserDownload).toHaveBeenCalledWith(expect.anything(), "cotizacion-document.xlsx"));
    expect(screen.queryByText("Falló el render.")).toBeNull();
  });

  it("refuses to save an empty document", async () => {
    downloadReportDocumentXlsx.mockResolvedValue({ blob: new Blob([]), filename: null });
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButton code="COTIZACION" parameters={PARAMETERS} />);

    await user.click(screen.getByRole("button", { name: "Descargar cotización Excel" }));
    expect(await screen.findByText("El backend devolvió un documento vacío.")).toBeTruthy();
    expect(triggerBrowserDownload).not.toHaveBeenCalled();
  });
});
