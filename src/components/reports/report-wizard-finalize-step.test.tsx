// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportWizardFinalizeStep } from "./report-wizard-finalize-step";
import { useReportReadiness } from "@/hooks/use-report-readiness";
import { ApiError } from "@/lib/api/errors";
import type { ReportAdminDefinition, ReportReadiness, ReportReadinessIssue } from "@/types/api";

const { getReportReadiness, updateReport } = vi.hoisted(() => ({
  getReportReadiness: vi.fn(),
  updateReport: vi.fn(),
}));
vi.mock("@/lib/api/reports", () => ({ getReportReadiness, updateReport }));

const REPORT: ReportAdminDefinition = {
  code: "COTIZACION", name: "Cotización", description: null, category: null, filename_template: null,
  enabled: false, data_source_id: 1,
  data_source: { id: 1, code: "quotes", name: "Cotizaciones", description: null, enabled: true, capabilities: [] },
  parameters: [], parameter_groups: [], created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

const TEMPLATE_MISSING: ReportReadinessIssue = {
  code: "TEMPLATE_MISSING", severity: "warning", step: "template",
  message: "No hay plantilla Excel activa. El reporte podrá generar datos, pero no un documento personalizado.",
};
const BUILDER_MISSING: ReportReadinessIssue = {
  code: "BUILDER_MISSING", severity: "blocker", step: "data",
  message: "Configura las columnas de los datos del reporte.",
};

function readiness(issues: ReportReadinessIssue[], enabled = false): ReportReadiness {
  return {
    report_code: "COTIZACION", enabled,
    ready: !issues.some((issue) => issue.severity === "blocker"),
    issues,
  };
}

/** Like the wizard: the step reads the readiness hook and owns the report state above it. */
function Harness({ report = REPORT, onGoTo = vi.fn() }: { report?: ReportAdminDefinition; onGoTo?: (step: string) => void }) {
  const [current, setCurrent] = useState(report);
  const state = useReportReadiness(current.code, { active: true });
  return (
    <>
      <ReportWizardFinalizeStep report={current} readiness={state} onReportChange={setCurrent} onGoTo={onGoTo} />
      <p data-testid="enabled">{String(current.enabled)}</p>
    </>
  );
}

const enableButton = () => screen.getByRole("button", { name: "Habilitar reporte" }) as HTMLButtonElement;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ReportWizardFinalizeStep — backend readiness", () => {
  it("A: keeps Habilitar unavailable until readiness is known", async () => {
    let resolve: (value: ReportReadiness) => void = () => undefined;
    getReportReadiness.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<Harness />);

    expect(screen.getByText("Comprobando estado…")).toBeTruthy();
    expect(enableButton().disabled).toBe(true);
    resolve(readiness([]));
    await waitFor(() => expect(enableButton().disabled).toBe(false));
    expect(getReportReadiness).toHaveBeenCalledWith("COTIZACION", expect.anything());
  });

  it("B/G: a ready report without warnings is ready to enable, every section ✓", async () => {
    getReportReadiness.mockResolvedValue(readiness([]));
    render(<Harness />);

    expect(await screen.findByText("Listo para habilitar")).toBeTruthy();
    expect(enableButton().disabled).toBe(false);
    expect(screen.getByText("Fuente y entradas").closest("li")?.getAttribute("data-severity")).toBe("ok");
    expect(screen.queryByRole("button", { name: /^Ir a/ })).toBeNull();
  });

  it("C: warnings inform without blocking, with a way to the step", async () => {
    const onGoTo = vi.fn();
    getReportReadiness.mockResolvedValue(readiness([TEMPLATE_MISSING]));
    const user = userEvent.setup();
    render(<Harness onGoTo={onGoTo} />);

    expect(await screen.findByText(TEMPLATE_MISSING.message)).toBeTruthy();
    expect(screen.getByText("Listo para habilitar")).toBeTruthy();
    expect(enableButton().disabled).toBe(false);
    await user.click(screen.getByRole("button", { name: "Ir a Plantilla Excel" }));
    expect(onGoTo).toHaveBeenCalledWith("template");
  });

  it("D/E/H: blockers disable Habilitar and link to the step that fixes them", async () => {
    const onGoTo = vi.fn();
    getReportReadiness.mockResolvedValue(readiness([BUILDER_MISSING, TEMPLATE_MISSING]));
    const user = userEvent.setup();
    render(<Harness onGoTo={onGoTo} />);

    expect(await screen.findByText("Configuración pendiente")).toBeTruthy();
    expect(screen.getByText(BUILDER_MISSING.message)).toBeTruthy();
    expect(screen.getByText("Datos del reporte").closest("li")?.getAttribute("data-severity")).toBe("blocker");
    expect(enableButton().disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Ir a Datos del reporte" }));
    expect(onGoTo).toHaveBeenCalledWith("data");
    expect(updateReport).not.toHaveBeenCalled();
  });

  it("F: an issue with an unknown step and code still shows its message, without navigation", async () => {
    getReportReadiness.mockResolvedValue(readiness([
      { code: "SOMETHING_NEW", severity: "blocker", step: "billing", message: "Falta algo nuevo." },
    ]));
    render(<Harness />);

    expect(await screen.findByText("Falta algo nuevo.")).toBeTruthy();
    expect(screen.getByText("Otros")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Ir a Otros" })).toBeNull();
    expect(enableButton().disabled).toBe(true);
  });

  it("enables with a PATCH that only carries `enabled`, adopting the backend's answer", async () => {
    getReportReadiness.mockResolvedValue(readiness([TEMPLATE_MISSING]));
    updateReport.mockResolvedValue({ ...REPORT, enabled: true });
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(await screen.findByRole("button", { name: "Habilitar reporte" }));

    await waitFor(() => expect(screen.getByTestId("enabled").textContent).toBe("true"));
    expect(updateReport).toHaveBeenCalledWith("COTIZACION", { enabled: true });
    expect(screen.getByText("Habilitado · Listo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deshabilitar reporte" })).toBeTruthy();
  });

  it("I: an enabled, ready report reads Habilitado · Listo", async () => {
    getReportReadiness.mockResolvedValue(readiness([], true));
    render(<Harness report={{ ...REPORT, enabled: true }} />);
    expect(await screen.findByText("Habilitado · Listo")).toBeTruthy();
  });

  it("J/K: an enabled report that degraded asks for attention and can still be disabled", async () => {
    getReportReadiness.mockResolvedValue(readiness([BUILDER_MISSING], true));
    updateReport.mockResolvedValue({ ...REPORT, enabled: false });
    const user = userEvent.setup();
    render(<Harness report={{ ...REPORT, enabled: true }} />);

    expect(await screen.findByText("Habilitado · Requiere atención")).toBeTruthy();
    const disable = screen.getByRole("button", { name: "Deshabilitar reporte" }) as HTMLButtonElement;
    expect(disable.disabled).toBe(false);
    await user.click(disable);

    await waitFor(() => expect(screen.getByTestId("enabled").textContent).toBe("false"));
    expect(updateReport).toHaveBeenCalledWith("COTIZACION", { enabled: false });
    expect(screen.getByText("Configuración pendiente")).toBeTruthy();
  });

  it("REPORT_NOT_READY on enable: stays disabled and shows the backend's issues, not a generic error", async () => {
    getReportReadiness.mockResolvedValue(readiness([]));
    updateReport.mockRejectedValue(new ApiError(422, {
      code: "REPORT_NOT_READY",
      message: "El reporte todavía tiene configuraciones pendientes.",
      issues: [BUILDER_MISSING, TEMPLATE_MISSING],
    }));
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(await screen.findByRole("button", { name: "Habilitar reporte" }));

    expect(await screen.findByText(BUILDER_MISSING.message)).toBeTruthy();
    expect(screen.getByText("El reporte todavía tiene configuraciones pendientes.")).toBeTruthy();
    expect(screen.getByText("Configuración pendiente")).toBeTruthy();
    expect(screen.getByTestId("enabled").textContent).toBe("false");
    expect(enableButton().disabled).toBe(true);
    expect(getReportReadiness).toHaveBeenCalledTimes(1);
  });

  it("a readiness failure never enables blindly and offers a retry", async () => {
    getReportReadiness.mockRejectedValueOnce(new ApiError(500, "Error interno")).mockResolvedValueOnce(readiness([]));
    const user = userEvent.setup();
    render(<Harness />);

    expect(await screen.findByText("No se pudo comprobar si el reporte está listo.")).toBeTruthy();
    expect(screen.getByText("Estado no disponible")).toBeTruthy();
    expect(enableButton().disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: /Reintentar/ }));
    await waitFor(() => expect(enableButton().disabled).toBe(false));
  });

  it("a readiness failure keeps Deshabilitar available for an enabled report", async () => {
    getReportReadiness.mockRejectedValue(new ApiError(500, "Error interno"));
    render(<Harness report={{ ...REPORT, enabled: true }} />);

    expect(await screen.findByText("Habilitado · Estado no disponible")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Deshabilitar reporte" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
