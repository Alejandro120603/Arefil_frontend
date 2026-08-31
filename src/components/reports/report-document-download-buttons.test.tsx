// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportDocumentDownloadButtons } from "./report-document-download-buttons";
import { ApiError } from "@/lib/api/errors";

const { downloadReportDocument, triggerBrowserDownload } = vi.hoisted(() => ({
  downloadReportDocument: vi.fn(), triggerBrowserDownload: vi.fn(),
}));
vi.mock("@/lib/api/reports", () => ({ downloadReportDocument }));
vi.mock("@/lib/download", () => ({ triggerBrowserDownload }));

const PARAMETERS = { price_list_id: 7, customer_name: "BONATTI MÉXICO", items: [{ product_id: 101, quantity: 4 }] };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReportDocumentDownloadButtons", () => {
  it("renders the document with exactly the parameters of the execution", async () => {
    downloadReportDocument.mockResolvedValue({ blob: new Blob(["%PDF"]), filename: "cotizacion.pdf" });
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButtons code="COTIZACION" parameters={PARAMETERS} />);

    await user.click(screen.getByRole("button", { name: "Descargar PDF" }));
    await waitFor(() => expect(downloadReportDocument).toHaveBeenCalledWith(
      "COTIZACION", "pdf", PARAMETERS, expect.anything(),
    ));
    expect(triggerBrowserDownload).toHaveBeenCalledWith(expect.anything(), "cotizacion.pdf");
  });

  it("explains a missing template without turning it into a crash", async () => {
    downloadReportDocument.mockRejectedValue(new ApiError(409, "El reporte no tiene template activo."));
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButtons code="COTIZACION" parameters={PARAMETERS} />);

    await user.click(screen.getByRole("button", { name: "Descargar PDF" }));
    expect(await screen.findByText(/todavía no tiene un template documental/)).toBeTruthy();
    expect(triggerBrowserDownload).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Descargar Excel" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps one format's failure out of the other", async () => {
    downloadReportDocument
      .mockRejectedValueOnce(new ApiError(500, "Falló el render."))
      .mockResolvedValueOnce({ blob: new Blob(["xlsx"]), filename: null });
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButtons code="COTIZACION" parameters={PARAMETERS} />);

    await user.click(screen.getByRole("button", { name: "Descargar PDF" }));
    expect(await screen.findByText("PDF: Falló el render.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Descargar Excel" }));
    await waitFor(() => expect(triggerBrowserDownload).toHaveBeenCalledWith(expect.anything(), "cotizacion.xlsx"));
    // The PDF error stays visible; the Excel download never inherited it.
    expect(screen.getByText("PDF: Falló el render.")).toBeTruthy();
    expect(screen.queryByText(/^Excel:/)).toBeNull();
  });

  it("reports an unsupported documental format from the backend", async () => {
    downloadReportDocument.mockRejectedValue(new ApiError(501, "No implementado."));
    const user = userEvent.setup();
    render(<ReportDocumentDownloadButtons code="COTIZACION" parameters={PARAMETERS} formats={["xlsx"]} />);

    expect(screen.queryByRole("button", { name: "Descargar PDF" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Descargar Excel" }));
    expect(await screen.findByText(/no genera este formato documental/)).toBeTruthy();
  });
});
