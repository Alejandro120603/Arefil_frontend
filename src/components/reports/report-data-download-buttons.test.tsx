// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportDataDownloadButtons } from "./report-data-download-buttons";

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
  it("rejects an empty backend export instead of saving a misleading file", async () => {
    const user = userEvent.setup();
    downloadReportData.mockResolvedValue({ blob: new Blob([]), filename: "empty.csv" });
    render(<ReportDataDownloadButtons code="REPORT" parameters={{ id: 1 }} />);
    await user.click(screen.getByRole("button", { name: "Descargar CSV" }));
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
    await user.click(screen.getByRole("button", { name: "Descargar Excel" }));
    await user.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(requestSignal?.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull());
    expect(screen.queryByText(/No se pudieron/)).toBeNull();
  });
});
