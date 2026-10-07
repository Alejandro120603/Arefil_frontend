// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { ReportDefinition } from "@/types/api";
import { AdminReportRow } from "./admin-report-row";

const mocks = vi.hoisted(() => ({
  deleteReport: vi.fn(),
  getReportReadiness: vi.fn(),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/api/reports", () => ({ deleteReport: mocks.deleteReport, getReportReadiness: mocks.getReportReadiness }));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

const REPORT: ReportDefinition = {
  code: "SALES_REPORT",
  name: "Ventas mensuales",
  description: "Resumen por mes",
  category: "Ventas",
  filename_template: null,
  enabled: true,
  data_source_id: 7,
  data_source: {
    id: 7,
    code: "SHARED_SALES",
    name: "Ventas compartidas",
    description: null,
    enabled: true,
    capabilities: [],
  },
  parameters: [],
  parameter_groups: [],
  created_at: "2026-09-01T12:00:00Z",
  updated_at: "2026-09-01T12:00:00Z",
};

function renderRow(report: ReportDefinition = REPORT) {
  return render(
    <table>
      <tbody>
        <AdminReportRow report={report} />
      </tbody>
    </table>,
  );
}

beforeEach(() => {
  mocks.getReportReadiness.mockResolvedValue({ report_code: REPORT.code, enabled: true, ready: true, issues: [] });
});

async function openConfirmation() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: `Acciones de ${REPORT.name}` }));
  await user.click(await screen.findByRole("menuitem", { name: /Eliminar/ }));
  return user;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AdminReportRow", () => {
  it("shows Configurar and the destructive Eliminar action", async () => {
    renderRow();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: `Acciones de ${REPORT.name}` }));

    expect(await screen.findByRole("menuitem", { name: /Configurar/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Eliminar/ }).getAttribute("data-variant")).toBe(
      "destructive",
    );
    expect(mocks.deleteReport).not.toHaveBeenCalled();
  });

  it("opens without deleting and Cancelar leaves the row intact", async () => {
    renderRow();
    const user = await openConfirmation();

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText(/Ventas mensuales/)).toBeTruthy();
    expect(mocks.deleteReport).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(mocks.deleteReport).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText(REPORT.code)).toBeTruthy();
  });

  it("disables confirmation while deleting and removes the row after success", async () => {
    let resolveDelete: (() => void) | undefined;
    mocks.deleteReport.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveDelete = resolve;
      }),
    );
    renderRow();
    const user = await openConfirmation();

    await user.click(screen.getByRole("button", { name: "Eliminar reporte" }));

    const busyButton = screen.getByRole("button", { name: "Eliminando..." }) as HTMLButtonElement;
    expect(busyButton.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(mocks.deleteReport).toHaveBeenCalledWith(REPORT.code);
    expect(mocks.deleteReport).toHaveBeenCalledTimes(1);

    resolveDelete?.();
    await waitFor(() => expect(screen.queryByText(REPORT.code)).toBeNull());

    expect(mocks.toastSuccess).toHaveBeenCalledWith("Reporte eliminado correctamente");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps the row and dialog on error and shows the backend message", async () => {
    mocks.deleteReport.mockRejectedValueOnce(new ApiError(409, "El reporte está en uso."));
    renderRow();
    const user = await openConfirmation();

    await user.click(screen.getByRole("button", { name: "Eliminar reporte" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("El reporte está en uso."));
    expect(screen.getByText(REPORT.code)).toBeTruthy();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Eliminar reporte" }) as HTMLButtonElement).disabled).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("AdminReportRow — operational status (#44)", () => {
  const BLOCKER = { code: "BUILDER_MISSING", severity: "blocker", step: "data", message: "Configura las columnas de los datos del reporte." };

  it.each([
    [true, true, "Habilitado · Listo"],
    [true, false, "Habilitado · Requiere atención"],
    [false, true, "Listo para habilitar"],
    [false, false, "Configuración pendiente"],
  ])("enabled=%s ready=%s reads %s", async (enabled, ready, label) => {
    mocks.getReportReadiness.mockResolvedValue({
      report_code: REPORT.code, enabled, ready, issues: ready ? [] : [BLOCKER],
    });
    renderRow({ ...REPORT, enabled });

    expect(await screen.findByText(label)).toBeTruthy();
    expect(mocks.getReportReadiness).toHaveBeenCalledTimes(1);
    expect(mocks.getReportReadiness).toHaveBeenCalledWith(REPORT.code, expect.anything());
  });

  it("shows a discreet loading state, then an unknown status if readiness fails — never 'not ready'", async () => {
    mocks.getReportReadiness.mockRejectedValue(new ApiError(500, "Error interno"));
    renderRow({ ...REPORT, enabled: false });

    expect(screen.getByText("Comprobando estado…")).toBeTruthy();
    expect(await screen.findByText("Estado no disponible")).toBeTruthy();
    expect(screen.queryByText("Configuración pendiente")).toBeNull();
    expect(screen.getByRole("button", { name: `Acciones de ${REPORT.name}` })).toBeTruthy();
  });
});
