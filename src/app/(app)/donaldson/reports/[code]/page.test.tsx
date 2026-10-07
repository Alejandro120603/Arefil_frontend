// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ReportOperationPage from "./page";
import type { ReportRuntimeDefinition } from "@/types/api";

const api = vi.hoisted(() => ({
  getRuntimeReportDefinition: vi.fn(),
  getReportBuilderDefinition: vi.fn(),
}));

vi.mock("@/lib/api/report-catalog", () => api);
vi.mock("@/components/reports/generic-report-runtime", () => ({
  GenericReportRuntime: ({ report }: { report: { code: string } }) => <div>runtime:{report.code}</div>,
}));

const REPORT: ReportRuntimeDefinition = {
  code: "REPORT_READY",
  name: "Reporte listo",
  description: "Operable",
  category: "Pruebas",
  filename_template: null,
  enabled: true,
  ready: true,
  data_source_id: 1,
  data_source: {
    id: 1,
    code: "TEST",
    name: "Fuente",
    description: null,
    enabled: true,
    capabilities: [],
  },
  parameters: [],
  parameter_groups: [],
  created_at: "2026-10-07T00:00:00",
  updated_at: "2026-10-07T00:00:00",
};

function renderPage(code = REPORT.code) {
  return ReportOperationPage({
    params: Promise.resolve({ code }),
    searchParams: Promise.resolve({}),
  }).then((page) => render(page));
}

describe("runtime report direct access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getReportBuilderDefinition.mockResolvedValue({ columns: [], excel_layout: null });
  });
  afterEach(cleanup);

  it("renders the runtime after rechecking an enabled and ready report", async () => {
    api.getRuntimeReportDefinition.mockResolvedValue(REPORT);

    await renderPage();

    expect(screen.getByText("runtime:REPORT_READY")).toBeTruthy();
    expect(api.getRuntimeReportDefinition).toHaveBeenCalledTimes(1);
    expect(api.getReportBuilderDefinition).toHaveBeenCalledTimes(1);
  });

  it("blocks a report that degraded after the catalog was loaded", async () => {
    api.getRuntimeReportDefinition.mockResolvedValue({ ...REPORT, ready: false });

    await renderPage();

    expect(screen.getByText("Reporte temporalmente no disponible")).toBeTruthy();
    expect(screen.getByText(/requiere atención antes de poder utilizarse/)).toBeTruthy();
    expect(screen.queryByText("runtime:REPORT_READY")).toBeNull();
    expect(api.getReportBuilderDefinition).not.toHaveBeenCalled();
  });

  it("blocks a disabled report without rendering its form", async () => {
    api.getRuntimeReportDefinition.mockResolvedValue({ ...REPORT, enabled: false });

    await renderPage();

    expect(screen.getByText("Reporte no disponible")).toBeTruthy();
    expect(screen.getByText(/está deshabilitado/)).toBeTruthy();
    expect(screen.queryByText("runtime:REPORT_READY")).toBeNull();
    expect(api.getReportBuilderDefinition).not.toHaveBeenCalled();
  });
});
