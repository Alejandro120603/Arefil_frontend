// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportDesignerWorkspace } from "./report-designer-workspace";
import type { PriceListComparisonResponse, ReportDefinition } from "@/types/api";

const { designerProps, executeReport, getReportParameterOptions, getReportTemplate, previewReport, saveReportTemplate } = vi.hoisted(() => ({
  designerProps: vi.fn(),
  executeReport: vi.fn(),
  getReportParameterOptions: vi.fn(),
  getReportTemplate: vi.fn(),
  previewReport: vi.fn(),
  saveReportTemplate: vi.fn(),
}));

vi.mock("next/dynamic", () => ({
  default: () => function Designer(props: unknown) {
    designerProps(props);
    return <div>Designer Stimulsoft</div>;
  },
}));
vi.mock("@/lib/api/reports", () => ({
  executeReport,
  getReportParameterOptions,
  getReportTemplate,
  previewReport,
  saveReportTemplate,
}));

const BASE: ReportDefinition = {
  code: "PRODUCT_CATALOG",
  name: "Productos",
  description: null,
  category: null,
  enabled: true,
  data_source_type: "SQL_QUERY",
  active_template_version: 1,
  parameters: [],
  parameter_groups: [],
  created_at: "2026-08-26T12:00:00Z",
  updated_at: "2026-08-26T12:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function previewLoader(): Promise<() => Promise<unknown>> {
  await waitFor(() => expect(designerProps).toHaveBeenCalled());
  return designerProps.mock.calls.at(-1)?.[0].loadPreviewData;
}

describe("ReportDesignerWorkspace generic preview", () => {
  it("adapts SQL preview data to the same report/parameters/rows convention as runtime", async () => {
    getReportTemplate.mockResolvedValue("{template}");
    previewReport.mockResolvedValue({ columns: ["id"], rows: [{ id: 1 }], row_count: 1, truncated: false });
    render(<ReportDesignerWorkspace reportDefinition={BASE} />);
    const loadPreviewData = await previewLoader();
    await expect(loadPreviewData()).resolves.toMatchObject({
      report: [{ code: "PRODUCT_CATALOG" }],
      parameters: [{}],
      rows: [{ id: 1 }],
    });
    expect(previewReport).toHaveBeenCalledWith("PRODUCT_CATALOG", {});
    expect(executeReport).not.toHaveBeenCalled();
  });

  it("uses generic /data and the allow-listed adapter for handler preview", async () => {
    const comparison: PriceListComparisonResponse = {
      report: { code: "PRICE_LIST_COMPARISON", generated_at: "2026-08-26T12:00:00Z" },
      supplier: { id: 1, code: "DONALDSON", name: "Donaldson" },
      list_a: { id: 1, effective_date: "2026-01-01", currency: "MXN", source_filename: "a.xlsx" },
      list_b: { id: 2, effective_date: "2026-02-01", currency: "MXN", source_filename: "b.xlsx" },
      summary: { total_products: 0, increased: 0, decreased: 0, unchanged: 0, new: 0, removed: 0, average_percentage_change: null },
      items: [],
    };
    const handler: ReportDefinition = {
      ...BASE,
      code: "PRICE_LIST_COMPARISON",
      data_source_type: "HANDLER",
      parameters: [
        { name: "price_list_a_id", label: "Lista A", input_type: "select", data_type: "integer", required: true, default_value: 1, display_order: 0, configuration_json: { options_source: "price_lists" } },
        { name: "price_list_b_id", label: "Lista B", input_type: "select", data_type: "integer", required: true, default_value: 2, display_order: 1, configuration_json: { options_source: "price_lists" } },
      ],
    };
    getReportTemplate.mockResolvedValue("{template}");
    getReportParameterOptions.mockResolvedValue([{ value: 1, label: "A" }, { value: 2, label: "B" }]);
    executeReport.mockResolvedValue(comparison);
    render(<ReportDesignerWorkspace reportDefinition={handler} />);
    const loadPreviewData = await previewLoader();
    await expect(loadPreviewData()).resolves.toMatchObject({ report: [{ code: "PRICE_LIST_COMPARISON" }], items: [] });
    expect(executeReport).toHaveBeenCalledWith("PRICE_LIST_COMPARISON", { price_list_a_id: 1, price_list_b_id: 2 });
  });
});
