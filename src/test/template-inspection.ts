import type { ReportExcelTemplateInspection } from "@/types/api";

/**
 * A one-sheet inspection ("Cotización") whose column B carries one recognized
 * placeholder per row, starting at B2 — the shape `/inspect` answers with.
 */
export function inspectionWithPlaceholders(
  placeholders: string[],
  template: { version: number; checksum: string } = { version: 4, checksum: "abc" },
): ReportExcelTemplateInspection {
  return {
    template: { ...template, filename: "COTIZACION.xlsx" },
    sheets: [{
      name: "Cotización", index: 0, hidden: false, state: "visible", max_row: 20, max_column: 4, used_range: "A1:D20",
      merged_ranges: [], row_heights: {}, column_widths: {}, default_row_height: null, default_column_width: null,
      cells: placeholders.map((placeholder, index) => ({
        coordinate: `B${index + 2}`, row: index + 2, column: 2, value: `{{${placeholder}}}`, value_type: "text" as const,
        formula: null, placeholders: [`{{${placeholder}}}`], style_id: 0, number_format: "General",
        merged_range: null, merge_anchor: null,
      })),
      drawings: [],
    }],
    styles: {},
    truncated: false,
  };
}
