// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ReportsPage from "./page";

const api = vi.hoisted(() => ({
  listRuntimeReportDefinitions: vi.fn(),
}));

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/api/report-catalog", () => api);
vi.mock("@/lib/auth/server-session", () => session);
vi.mock("@/components/reports/report-catalog-cards", () => ({
  ReportCatalogCards: ({ reports }: { reports: Array<{ code: string; name: string }> }) => (
    <ul>{reports.map((report) => <li key={report.code}>{report.name}</li>)}</ul>
  ),
}));

const USER = { id: 2, username: "user1", role: "USER", is_active: true, permissions: ["catalog:read", "reports:run"] };
const ADMIN = {
  id: 1, username: "admin1", role: "ADMIN", is_active: true,
  permissions: ["catalog:read", "catalog:write", "reports:run", "reports:admin", "system:backup", "users:admin"],
};

const report = (code: string, enabled: boolean, ready: boolean) => ({
  code,
  name: code,
  description: null,
  category: null,
  enabled,
  ready,
});

describe("runtime report catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.getCurrentUser.mockResolvedValue(USER);
  });
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

  it("offers Nuevo reporte only with reports:admin", async () => {
    api.listRuntimeReportDefinitions.mockResolvedValue([report("REPORT_READY", true, true)]);
    render(await ReportsPage());
    expect(screen.queryByRole("button", { name: /Nuevo reporte/ })).toBeNull();
    expect(document.querySelector('a[href="/administracion/reportes/nuevo"]')).toBeNull();
    cleanup();

    session.getCurrentUser.mockResolvedValue(ADMIN);
    render(await ReportsPage());
    expect(screen.getByRole("button", { name: /Nuevo reporte/ }).getAttribute("href")).toBe("/administracion/reportes/nuevo");
  });
});
