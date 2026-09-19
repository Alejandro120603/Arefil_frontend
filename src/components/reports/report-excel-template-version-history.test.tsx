// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportExcelTemplateVersionHistory } from "./report-excel-template-version-history";
import { ApiError } from "@/lib/api/errors";
import type { ReportExcelTemplate, ReportExcelTemplateValidationResult } from "@/types/api";

const { listReportExcelTemplateVersions, downloadReportExcelTemplateVersion, restoreReportExcelTemplateVersion, triggerBrowserDownload } = vi.hoisted(() => ({
  listReportExcelTemplateVersions: vi.fn(),
  downloadReportExcelTemplateVersion: vi.fn(),
  restoreReportExcelTemplateVersion: vi.fn(),
  triggerBrowserDownload: vi.fn(),
}));
vi.mock("@/lib/api/reports", () => ({
  listReportExcelTemplateVersions, downloadReportExcelTemplateVersion, restoreReportExcelTemplateVersion,
}));
vi.mock("@/lib/download", () => ({ triggerBrowserDownload }));

function version(overrides: Partial<ReportExcelTemplate> = {}): ReportExcelTemplate {
  return {
    report_code: "COTIZACION", original_filename: "COTIZACION.xlsx", size_bytes: 20_480,
    version: 5, checksum: "a".repeat(64), is_active: false,
    created_at: "2026-09-16T10:00:00Z", updated_at: "2026-09-16T10:00:00Z",
    ...overrides,
  };
}

const VALIDATION: ReportExcelTemplateValidationResult = {
  valid: true, placeholder_count: 3, repeatable_rows: 1, warnings: [], errors: [],
};

async function openHistory(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Historial de versiones/ }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReportExcelTemplateVersionHistory", () => {
  it("lists versions newest-first with the active one clearly identified", async () => {
    listReportExcelTemplateVersions.mockResolvedValue([
      version({ version: 6, is_active: true, created_at: "2026-09-17T10:00:00Z" }),
      version({ version: 5, is_active: false }),
    ]);
    const user = userEvent.setup();
    render(<ReportExcelTemplateVersionHistory code="COTIZACION" />);

    await openHistory(user);
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("v6")).toBeTruthy();
    expect(within(items[0]).getByText("Activa")).toBeTruthy();
    expect(within(items[1]).getByText("v5")).toBeTruthy();
    expect(within(items[1]).queryByText("Activa")).toBeNull();
  });

  it("shows an empty-history message when the report has no template versions at all", async () => {
    listReportExcelTemplateVersions.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<ReportExcelTemplateVersionHistory code="COTIZACION" />);

    await openHistory(user);
    expect(await screen.findByText("Este reporte no tiene versiones de plantilla en su historial.")).toBeTruthy();
  });

  it("shows a backend error instead of the list when it fails to load", async () => {
    listReportExcelTemplateVersions.mockRejectedValue(new ApiError(500, "Error inesperado."));
    const user = userEvent.setup();
    render(<ReportExcelTemplateVersionHistory code="COTIZACION" />);

    await openHistory(user);
    expect(await screen.findByText("No se pudo cargar el historial")).toBeTruthy();
  });

  it("downloads a historical version using the backend's filename", async () => {
    listReportExcelTemplateVersions.mockResolvedValue([version({ version: 5 })]);
    downloadReportExcelTemplateVersion.mockResolvedValue({ blob: new Blob(["x"]), filename: "COTIZACION-v5.xlsx" });
    const user = userEvent.setup();
    render(<ReportExcelTemplateVersionHistory code="COTIZACION" />);

    await openHistory(user);
    await user.click(await screen.findByRole("button", { name: /Descargar/ }));

    await waitFor(() => expect(downloadReportExcelTemplateVersion).toHaveBeenCalledWith("COTIZACION", 5));
    expect(triggerBrowserDownload).toHaveBeenCalledWith(
      { blob: expect.anything(), filename: "COTIZACION-v5.xlsx" },
      expect.any(String),
    );
  });

  it("never offers to restore the version that is already active", async () => {
    listReportExcelTemplateVersions.mockResolvedValue([version({ version: 6, is_active: true })]);
    const user = userEvent.setup();
    render(<ReportExcelTemplateVersionHistory code="COTIZACION" />);

    await openHistory(user);
    await screen.findByText("v6");
    expect(screen.queryByRole("button", { name: /Restaurar esta versión/ })).toBeNull();
  });

  it("asks for a clear confirmation before restoring, naming the version and that nothing is deleted", async () => {
    listReportExcelTemplateVersions.mockResolvedValue([
      version({ version: 6, is_active: true }),
      version({ version: 3, is_active: false }),
    ]);
    const user = userEvent.setup();
    render(<ReportExcelTemplateVersionHistory code="COTIZACION" />);

    await openHistory(user);
    await user.click(await screen.findByRole("button", { name: /Restaurar esta versión/ }));

    expect(screen.getByText("Restaurar versión v3")).toBeTruthy();
    expect(screen.getByText(/Se creará una nueva versión activa basada en la v3\. La versión actual no se eliminará\./)).toBeTruthy();
    expect(restoreReportExcelTemplateVersion).not.toHaveBeenCalled();
  });

  it("restores successfully, sends the loaded active version as the base, and refreshes the list", async () => {
    listReportExcelTemplateVersions
      .mockResolvedValueOnce([version({ version: 6, is_active: true, checksum: "b".repeat(64) }), version({ version: 3 })])
      .mockResolvedValueOnce([version({ version: 7, is_active: true }), version({ version: 6 }), version({ version: 3 })]);
    restoreReportExcelTemplateVersion.mockResolvedValue({
      report_code: "COTIZACION", original_filename: "COTIZACION.xlsx", size_bytes: 100, version: 7, checksum: "c".repeat(64),
      is_active: true, created_at: "2026-09-17T12:00:00Z", updated_at: "2026-09-17T12:00:00Z", validation: VALIDATION,
    });
    const onRestored = vi.fn();
    const user = userEvent.setup();
    render(<ReportExcelTemplateVersionHistory code="COTIZACION" onRestored={onRestored} />);

    await openHistory(user);
    await user.click(await screen.findByRole("button", { name: /Restaurar esta versión/ }));
    await user.click(screen.getByRole("button", { name: "Confirmar restauración" }));

    await waitFor(() => expect(restoreReportExcelTemplateVersion).toHaveBeenCalledWith(
      "COTIZACION", 3, { base_version: 6, base_checksum: "b".repeat(64) },
    ));
    expect(await screen.findByText("Se restauró la v3 como nueva v7 activa.")).toBeTruthy();
    expect(onRestored).toHaveBeenCalledWith(expect.objectContaining({ version: 7 }));
    expect(await screen.findByText("v7")).toBeTruthy();
    expect(screen.queryByText("Restaurar versión v3")).toBeNull();
  });

  it("shows the stale-history message on a 409 without retrying automatically", async () => {
    listReportExcelTemplateVersions.mockResolvedValue([version({ version: 6, is_active: true }), version({ version: 3 })]);
    restoreReportExcelTemplateVersion.mockRejectedValue(new ApiError(409, "El estado de la plantilla cambió."));
    const user = userEvent.setup();
    render(<ReportExcelTemplateVersionHistory code="COTIZACION" />);

    await openHistory(user);
    await user.click(await screen.findByRole("button", { name: /Restaurar esta versión/ }));
    await user.click(screen.getByRole("button", { name: "Confirmar restauración" }));

    expect(await screen.findByText("La plantilla cambió desde que cargaste el historial. Actualiza la lista antes de restaurar.")).toBeTruthy();
    expect(restoreReportExcelTemplateVersion).toHaveBeenCalledTimes(1);
  });

  it("shows structured diagnostics for an incompatible historical version, and says it was not activated", async () => {
    listReportExcelTemplateVersions.mockResolvedValue([version({ version: 6, is_active: true }), version({ version: 3 })]);
    restoreReportExcelTemplateVersion.mockRejectedValue(new ApiError(422, {
      valid: false, placeholder_count: 2, repeatable_rows: 0, warnings: [],
      errors: [{ code: "unknown_placeholder", message: "Placeholder desconocido.", sheet: "Cotización", cell: "B4", placeholder: "{{rows.old}}", range: null }],
    }));
    const user = userEvent.setup();
    render(<ReportExcelTemplateVersionHistory code="COTIZACION" />);

    await openHistory(user);
    await user.click(await screen.findByRole("button", { name: /Restaurar esta versión/ }));
    await user.click(screen.getByRole("button", { name: "Confirmar restauración" }));

    expect(await screen.findByText(/Placeholder desconocido\./)).toBeTruthy();
    expect(screen.getByText("Esta versión no fue activada; la plantilla actual sigue intacta.")).toBeTruthy();
  });

  it("surfaces a generic backend error without losing the confirmation context", async () => {
    listReportExcelTemplateVersions.mockResolvedValue([version({ version: 6, is_active: true }), version({ version: 3 })]);
    restoreReportExcelTemplateVersion.mockRejectedValue(new ApiError(500, "Error inesperado."));
    const user = userEvent.setup();
    render(<ReportExcelTemplateVersionHistory code="COTIZACION" />);

    await openHistory(user);
    await user.click(await screen.findByRole("button", { name: /Restaurar esta versión/ }));
    await user.click(screen.getByRole("button", { name: "Confirmar restauración" }));

    expect(await screen.findByText("No se pudo restaurar")).toBeTruthy();
    expect(screen.getByText("Error inesperado.")).toBeTruthy();
  });

  it("blocks restoring while the editor has unsaved mappings, with the given reason", async () => {
    listReportExcelTemplateVersions.mockResolvedValue([version({ version: 6, is_active: true }), version({ version: 3 })]);
    const user = userEvent.setup();
    render(<ReportExcelTemplateVersionHistory code="COTIZACION" disabledReason="Guarda o descarta tus cambios antes de restaurar otra versión." />);

    await openHistory(user);
    await screen.findByText("v3");
    expect(screen.getByText("Guarda o descarta tus cambios antes de restaurar otra versión.")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Restaurar esta versión/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
