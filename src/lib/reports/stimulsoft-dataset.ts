/**
 * Adapter from the Backend #9 contract to the dataset the Stimulsoft template
 * binds against.
 *
 * Nothing here recomputes the comparison: every status, count, delta and
 * percentage is copied verbatim from `PriceListComparisonResponse`. The only
 * work done is *presentation* — the same `formatComparisonRow` /
 * `formatCurrency` helpers the HTML table already uses — so that the PDF and
 * the on-screen table can never disagree, and so that `null`, `NaN` and
 * `Infinity` can never reach a report cell (they collapse to `EMPTY_VALUE`).
 *
 * `ArefilReportData` is the minimal technical wrapper Stimulsoft needs: its
 * `DataSet.readJson` turns every top-level key into a table, so the six
 * singleton objects of the response are wrapped in one-element arrays. Key
 * names, nesting and values are otherwise untouched.
 */
import type {
  ComparisonSupplier,
  PriceListComparisonItem,
  PriceListComparisonResponse,
} from "@/types/api";
import { formatDate, formatDateTime } from "@/lib/format/date";
import { formatSignedPercentage } from "@/lib/format/decimal";
import { COMPARISON_STATUS_LABELS, EMPTY_VALUE, formatComparisonRow } from "@/lib/reports/comparison";

/**
 * Name of the data source registered through `report.regData(...)`. The
 * template's data bands reference `items`, `summary`, ... under this database,
 * so changing it here means regenerating `price-list-comparison.mrt`.
 */
export const AREFIL_DATA_SOURCE_NAME = "ArefilReportData";

/** Compatibility reference only; runtime templates come from Backend #10. */
export const PRICE_LIST_COMPARISON_REFERENCE_URL = "/reports/price-list-comparison.mrt";

/** Report code of the only template this module knows about (Backend #9). */
export const PRICE_LIST_COMPARISON_REPORT_CODE = "PRICE_LIST_COMPARISON";

export interface ArefilReportMetaRow {
  code: string;
  generated_at: string;
  generated_at_display: string;
}

export interface ArefilReportListRow {
  id: number;
  effective_date: string;
  effective_date_display: string;
  currency: string;
  source_filename: string;
}

export interface ArefilReportSummaryRow {
  total_products: number;
  increased: number;
  decreased: number;
  unchanged: number;
  new: number;
  removed: number;
  average_percentage_change: string | null;
  average_percentage_change_display: string;
}

export interface ArefilReportItemRow extends PriceListComparisonItem {
  description_display: string;
  price_a_display: string;
  price_b_display: string;
  absolute_change_display: string;
  percentage_change_display: string;
  classification_display: string;
  status_label: string;
}

export interface ArefilReportData {
  report: [ArefilReportMetaRow];
  supplier: [ComparisonSupplier];
  list_a: [ArefilReportListRow];
  list_b: [ArefilReportListRow];
  summary: [ArefilReportSummaryRow];
  items: ArefilReportItemRow[];
}

function toListRow(list: PriceListComparisonResponse["list_a"]): ArefilReportListRow {
  return {
    id: list.id,
    effective_date: list.effective_date,
    effective_date_display: formatDate(list.effective_date),
    currency: list.currency,
    source_filename: list.source_filename,
  };
}

function toItemRow(item: PriceListComparisonItem, currency: string): ArefilReportItemRow {
  const row = formatComparisonRow(item, currency);
  return {
    ...item,
    // A blank cell reads as "the supplier left it empty"; the placeholder says
    // the catalogue has no description for this part at all.
    description_display: item.description ?? EMPTY_VALUE,
    price_a_display: row.priceA,
    price_b_display: row.priceB,
    absolute_change_display: row.absoluteChange,
    percentage_change_display: row.percentageChange,
    classification_display: row.classification,
    status_label: COMPARISON_STATUS_LABELS[item.status],
  };
}

/**
 * Builds the Stimulsoft dataset for one comparison. Prices are formatted with
 * list B's currency: the backend rejects mixed-currency pairs, so A and B always
 * agree and B is the newer of the two.
 */
export function toArefilReportData(comparison: PriceListComparisonResponse): ArefilReportData {
  const currency = comparison.list_b.currency;
  const summary = comparison.summary;
  return {
    report: [
      {
        code: comparison.report.code,
        generated_at: comparison.report.generated_at,
        generated_at_display: formatDateTime(comparison.report.generated_at),
      },
    ],
    supplier: [comparison.supplier],
    list_a: [toListRow(comparison.list_a)],
    list_b: [toListRow(comparison.list_b)],
    summary: [
      {
        total_products: summary.total_products,
        increased: summary.increased,
        decreased: summary.decreased,
        unchanged: summary.unchanged,
        new: summary.new,
        removed: summary.removed,
        average_percentage_change: summary.average_percentage_change,
        // Null when no row had a comparable percentage — never "0%".
        average_percentage_change_display:
          formatSignedPercentage(summary.average_percentage_change) ?? EMPTY_VALUE,
      },
    ],
    items: comparison.items.map((item) => toItemRow(item, currency)),
  };
}

/**
 * Every table/column the template binds to, in the order the report lays them
 * out. Kept next to the adapter so `price-list-comparison.mrt` and
 * `toArefilReportData` cannot drift apart unnoticed (see the test that walks
 * the committed template against this map).
 */
export const AREFIL_REPORT_BINDINGS = {
  report: ["code", "generated_at", "generated_at_display"],
  supplier: ["id", "code", "name"],
  list_a: ["id", "effective_date", "effective_date_display", "currency", "source_filename"],
  list_b: ["id", "effective_date", "effective_date_display", "currency", "source_filename"],
  summary: [
    "total_products",
    "increased",
    "decreased",
    "unchanged",
    "new",
    "removed",
    "average_percentage_change",
    "average_percentage_change_display",
  ],
  items: [
    "product_id",
    "part_number",
    "item_number",
    "description",
    "price_a_cents",
    "price_a",
    "price_b_cents",
    "price_b",
    "absolute_change_cents",
    "absolute_change",
    "percentage_change",
    "classification_a",
    "classification_b",
    "status",
    "description_display",
    "price_a_display",
    "price_b_display",
    "absolute_change_display",
    "percentage_change_display",
    "classification_display",
    "status_label",
  ],
} as const satisfies Record<keyof ArefilReportData, readonly string[]>;
