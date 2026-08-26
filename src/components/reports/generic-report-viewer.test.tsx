// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenericReportViewer } from "./generic-report-viewer";
import type { ReportDefinition } from "@/types/api";

const { executeReport, getReportTemplate, viewerProps } = vi.hoisted(() => ({
  executeReport: vi.fn(),
  getReportTemplate: vi.fn(),
  viewerProps: vi.fn(),
}));

vi.mock("next/dynamic", () => ({
  default: () => function Viewer(props: unknown) {
    viewerProps(props);
    return <div>Viewer Stimulsoft</div>;
  },
}));
vi.mock("@/lib/api/reports", () => ({ executeReport, getReportTemplate }));

const REPORT: ReportDefinition = {
  code: "PRODUCT_CATALOG",
  name: "Productos",
  description: null,
  category: null,
  enabled: true,
  data_source_type: "SQL_QUERY",
  active_template_version: 2,
  parameters: [],
  created_at: "2026-08-26T12:00:00Z",
  updated_at: "2026-08-26T12:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GenericReportViewer", () => {
  it("loads generic data and template, adapts them, and mounts the client Viewer", async () => {
    executeReport.mockResolvedValue({ columns: ["id"], rows: [{ id: 1 }], row_count: 1 });
    getReportTemplate.mockResolvedValue("{template}");
    render(<GenericReportViewer report={REPORT} parameters={{ supplier_id: 8 }} />);
    expect(await screen.findByText("Viewer Stimulsoft")).toBeTruthy();
    expect(executeReport).toHaveBeenCalledWith("PRODUCT_CATALOG", { supplier_id: 8 }, expect.anything());
    expect(getReportTemplate).toHaveBeenCalledWith("PRODUCT_CATALOG", expect.anything());
    expect(viewerProps).toHaveBeenCalledWith(expect.objectContaining({
      template: "{template}",
      dataSourceName: "ArefilReportData",
      data: expect.objectContaining({ rows: [{ id: 1 }], parameters: [{ supplier_id: 8 }] }),
    }));
  });

  it("executes without requesting a template and shows SQL data when design is pending", async () => {
    executeReport.mockResolvedValue({ columns: ["id"], rows: [], row_count: 0 });
    render(<GenericReportViewer report={{ ...REPORT, active_template_version: null }} parameters={{}} />);
    expect(await screen.findByText("Datos disponibles · Diseño pendiente")).toBeTruthy();
    expect(screen.getByText("El reporte se ejecutó correctamente, pero el dataset no contiene filas.")).toBeTruthy();
    expect(screen.getByText("Vista previa de los datos disponibles")).toBeTruthy();
    expect(getReportTemplate).not.toHaveBeenCalled();
    await waitFor(() => expect(executeReport).toHaveBeenCalledTimes(1));
  });
});
