// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenericReportRuntime } from "./generic-report-runtime";
import type { ReportDefinition } from "@/types/api";

vi.mock("@/components/reports/generic-report-viewer", () => ({
  GenericReportViewer: ({ parameters }: { parameters: Record<string, unknown> }) => (
    <div data-testid="generic-viewer">{JSON.stringify(parameters)}</div>
  ),
}));
vi.mock("@/lib/api/reports", () => ({
  getReportParameterOptions: vi.fn().mockResolvedValue([]),
  downloadReportData: vi.fn(),
}));

const REPORT: ReportDefinition = {
  code: "NO_PARAMETERS",
  name: "Sin parámetros",
  description: null,
  category: null,
  enabled: true,
  data_source_type: "SQL_QUERY",
  active_template_version: null,
  parameters: [],
  created_at: "2026-08-26T12:00:00Z",
  updated_at: "2026-08-26T12:00:00Z",
};

afterEach(cleanup);

describe("GenericReportRuntime", () => {
  it("executes a parameterless report and exposes direct backend downloads", async () => {
    const user = userEvent.setup();
    render(<GenericReportRuntime report={REPORT} />);
    expect(screen.getByText("Este reporte no requiere parámetros.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Descargar XLSX" }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole("button", { name: "Generar reporte" }));
    expect(screen.getByTestId("generic-viewer").textContent).toBe("{}");
  });

  it("blocks invalid required values and A/B with the same list", () => {
    const report: ReportDefinition = {
      ...REPORT,
      code: "PRICE_LIST_COMPARISON",
      data_source_type: "HANDLER",
      parameters: [
        { name: "price_list_a_id", label: "Lista A", input_type: "select", data_type: "integer", required: true, default_value: 7, display_order: 0, configuration_json: { options_source: "price_lists" } },
        { name: "price_list_b_id", label: "Lista B", input_type: "select", data_type: "integer", required: true, default_value: 7, display_order: 1, configuration_json: { options_source: "price_lists" } },
      ],
    };
    render(<GenericReportRuntime report={report} />);
    expect(screen.getByText("Selecciona dos listas distintas.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Generar reporte" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
