// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ReportsPage from "./page";

const api = vi.hoisted(() => ({
  listRuntimeReportDefinitions: vi.fn(),
}));

vi.mock("@/lib/api/report-catalog", () => api);
vi.mock("@/components/reports/report-catalog-cards", () => ({
  ReportCatalogCards: ({ reports }: { reports: Array<{ code: string; name: string }> }) => (
    <ul>{reports.map((report) => <li key={report.code}>{report.name}</li>)}</ul>
  ),
}));

const report = (code: string, enabled: boolean, ready: boolean) => ({
  code,
  name: code,
  description: null,
  category: null,
  enabled,
  ready,
});

describe("runtime report catalog", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("renders only enabled and ready reports with one catalog request", async () => {
    api.listRuntimeReportDefinitions.mockResolvedValue([
      report("REPORT_READY", true, true),
      report("REPORT_NO_TEMPLATE", true, true),
      report("REPORT_DEGRADED", true, false),
      report("REPORT_DISABLED", false, true),
    ]);

    render(await ReportsPage());

    expect(screen.getByText("REPORT_READY")).toBeTruthy();
    expect(screen.getByText("REPORT_NO_TEMPLATE")).toBeTruthy();
    expect(screen.queryByText("REPORT_DEGRADED")).toBeNull();
    expect(screen.queryByText("REPORT_DISABLED")).toBeNull();
    expect(api.listRuntimeReportDefinitions).toHaveBeenCalledTimes(1);
  });

  it("uses an operational empty state when no report is currently usable", async () => {
    api.listRuntimeReportDefinitions.mockResolvedValue([
      report("REPORT_DEGRADED", true, false),
      report("REPORT_DISABLED", false, true),
    ]);

    render(await ReportsPage());

    expect(screen.getByText("No hay reportes disponibles en este momento.")).toBeTruthy();
  });
});
