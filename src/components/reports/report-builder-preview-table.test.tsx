// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReportBuilderPreviewResponse } from "@/types/api";
import { ReportBuilderPreviewTable } from "./report-builder-preview-table";

afterEach(cleanup);

const LONG = "STACK PIPE, STRAIGHT 5 IN (127 MM) OD X 48 IN (1219 MM) CHROME";

function preview(): ReportBuilderPreviewResponse {
  return {
    columns: [
      { key: "quantity", label: "Cantidad", data_type: "integer", format_type: "number" },
      { key: "description", label: "Descripción", data_type: "string", format_type: "text" },
      { key: "discount", label: "Descuento (%)", data_type: "decimal", format_type: "number" },
      { key: "line_total", label: "Importe", data_type: "decimal", format_type: "currency" },
    ],
    rows: [
      { quantity: 3, description: LONG, discount: "12.5", line_total: "12304.68" },
      { quantity: 1, description: "AIR CLEANER KIT", discount: "33.333", line_total: "1.00" },
    ],
    row_count: 2,
    truncated: false,
    totals: {},
    summary: {},
  } as unknown as ReportBuilderPreviewResponse;
}

describe("ReportBuilderPreviewTable", () => {
  it("shows decimal quantities such as discounts with two to four decimals (D11)", () => {
    render(<ReportBuilderPreviewTable preview={preview()} />);
    expect(screen.getByText("12.50")).toBeTruthy();
    expect(screen.getByText("33.333")).toBeTruthy();
    // Integers stay integers.
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("wraps long descriptions and keeps amounts on one right-aligned line (D8)", () => {
    render(<ReportBuilderPreviewTable preview={preview()} />);
    const description = screen.getByText(LONG);
    expect(description.className).toMatch(/whitespace-normal/);
    const amount = screen.getByText("$12,304.68");
    expect(amount.className).toMatch(/text-right/);
    expect(amount.className).not.toMatch(/whitespace-normal/);
  });
});

describe("ReportBuilderPreviewTable — review fixes", () => {
  it("gives decimal percentages, rows and summaries alike, two to four decimals", () => {
    const data = {
      columns: [{ key: "rate", label: "Tasa", data_type: "decimal", format_type: "percent" }],
      rows: [{ rate: "12.5" }],
      row_count: 1,
      truncated: false,
      totals: {},
      summary: { average: "5" },
    } as unknown as ReportBuilderPreviewResponse;
    render(
      <ReportBuilderPreviewTable
        preview={data}
        summaries={[{ key: "average", label: "Promedio", operation: "FORMULA", format_type: "percent" } as never]}
      />,
    );
    expect(screen.getByText("12.50%")).toBeTruthy();
    expect(screen.getByText("5.00%")).toBeTruthy();
  });

  it("right-aligns a legacy totals row under its numeric column", () => {
    const data = {
      columns: [
        { key: "description", label: "Descripción", data_type: "string", format_type: "text" },
        { key: "line_total", label: "Importe", data_type: "decimal", format_type: "currency" },
      ],
      rows: [{ description: "FILTRO", line_total: "10.00" }],
      row_count: 1,
      truncated: false,
      totals: { line_total: "10.00" },
    } as unknown as ReportBuilderPreviewResponse;
    render(<ReportBuilderPreviewTable preview={data} />);
    const [, total] = screen.getAllByText("$10.00");
    expect(total.className).toMatch(/text-right/);
    expect(total.className).toMatch(/font-medium/);
  });
});
