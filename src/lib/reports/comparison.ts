/**
 * Pure presentation logic for the A-vs-B price list comparison report.
 *
 * Nothing here touches React or the network: filtering, paging and label
 * mapping live in one testable place shared by the native comparison preview.
 */
import type {
  ComparisonPriceList,
  ComparisonStatus,
  PriceList,
  PriceListComparisonItem,
} from "@/types/api";
import { formatDate } from "@/lib/format/date";
import {
  formatCurrency,
  formatSignedCurrency,
  formatSignedPercentage,
  parseDecimal,
} from "@/lib/format/decimal";

export const COMPARISON_STATUS_LABELS: Record<ComparisonStatus, string> = {
  INCREASED: "Aumentó",
  DECREASED: "Disminuyó",
  UNCHANGED: "Sin cambio",
  NEW: "Nuevo",
  REMOVED: "Retirado",
};

/** Plural headings for the summary tiles and the status filter chips. */
export const COMPARISON_STATUS_PLURAL_LABELS: Record<ComparisonStatus, string> = {
  INCREASED: "Aumentaron",
  DECREASED: "Disminuyeron",
  UNCHANGED: "Sin cambio",
  NEW: "Nuevos",
  REMOVED: "Retirados",
};

export const COMPARISON_STATUS_ORDER: ComparisonStatus[] = [
  "INCREASED",
  "DECREASED",
  "UNCHANGED",
  "NEW",
  "REMOVED",
];

export const ALL_STATUSES = "ALL" as const;
export type ComparisonStatusFilter = typeof ALL_STATUSES | ComparisonStatus;

export const COMPARISON_STATUS_FILTERS: ComparisonStatusFilter[] = [ALL_STATUSES, ...COMPARISON_STATUS_ORDER];

export function getStatusFilterLabel(filter: ComparisonStatusFilter): string {
  return filter === ALL_STATUSES ? "Todos" : COMPARISON_STATUS_PLURAL_LABELS[filter];
}

/**
 * Client-side filtering is deliberate: Backend #9 returns the whole dataset in
 * a single ~1.58 MiB payload for 5,000 products, so re-querying per status
 * would cost a full round trip to reproduce a `filter()` the browser already
 * has the data for. See `codex/output/reporting-comparison-frontend.md`.
 */
export function filterComparisonItems(
  items: PriceListComparisonItem[],
  filter: ComparisonStatusFilter,
): PriceListComparisonItem[] {
  if (filter === ALL_STATUSES) return items;
  return items.filter((item) => item.status === filter);
}

export const PAGE_SIZE_OPTIONS = [50, 100] as const;
export const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

export interface ClientPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  /** 1-based inclusive range of the rendered slice; both 0 when empty. */
  from: number;
  to: number;
}

/**
 * Slices an already-filtered dataset. `page` is clamped instead of trusted so
 * that shrinking the result set (a stricter filter, a smaller page size) can
 * never leave the table rendering an out-of-range empty slice.
 */
export function paginateItems<T>(items: T[], page: number, pageSize: number): ClientPage<T> {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const start = (safePage - 1) * safePageSize;
  const slice = items.slice(start, start + safePageSize);
  return {
    items: slice,
    page: safePage,
    pageSize: safePageSize,
    totalItems,
    totalPages,
    from: totalItems === 0 ? 0 : start + 1,
    to: totalItems === 0 ? 0 : start + slice.length,
  };
}

/**
 * Label for a price list option, e.g. "20 oct 2025 · DONALDSON · MXN".
 * The filename is intentionally left out of the label and shown as secondary
 * text by the picker - it is long enough to drown the parts that identify the list.
 */
export function describePriceList(priceList: PriceList): string {
  return `${formatDate(priceList.effective_date)} · ${priceList.supplier} · ${priceList.currency}`;
}

/**
 * Same label for a list inside a generated comparison. The response carries a
 * single shared supplier (the backend rejects mixed-supplier pairs), so the
 * supplier is shown once in the report heading instead of on every line.
 */
export function describeComparisonList(priceList: ComparisonPriceList): string {
  return `${formatDate(priceList.effective_date)} · ${priceList.currency}`;
}

export const SELECT_BOTH_LISTS_MESSAGE = "Selecciona dos listas de precios para comenzar.";
export const DISTINCT_LISTS_MESSAGE = "Selecciona dos listas distintas.";

/**
 * Returns the reason the comparison cannot run, or `null` when the selection
 * is valid. Drives both the disabled `Comparar` button and the inline hint, so
 * an invalid pair can never reach the generic report endpoint.
 */
export function validateComparisonSelection(
  priceListAId: number | null,
  priceListBId: number | null,
): string | null {
  if (priceListAId == null || priceListBId == null) return SELECT_BOTH_LISTS_MESSAGE;
  if (priceListAId === priceListBId) return DISTINCT_LISTS_MESSAGE;
  return null;
}

/** The single placeholder for "this row has no value here". */
export const EMPTY_VALUE = "—";

export interface ComparisonRowValues {
  priceA: string;
  priceB: string;
  absoluteChange: string;
  percentageChange: string;
  classification: string;
}

/**
 * Renders one comparison row's text. Every branch that can be absent collapses
 * to `EMPTY_VALUE`:
 *  - `NEW` has no `price_a`, `REMOVED` has no `price_b`;
 *  - neither carries an absolute or percentage delta;
 *  - a compared row still has a null percentage when the A price was exactly 0
 *    (the backend refuses to divide by zero).
 * No caller may substitute "$0"/"0%" for any of those - that would claim the
 * price held steady when in fact there is nothing to compare. `null`,
 * `undefined`, `NaN`, `Infinity` and `$null` are unreachable by construction:
 * the format helpers already return null for non-finite input.
 */
export function formatComparisonRow(item: PriceListComparisonItem, currency: string): ComparisonRowValues {
  return {
    priceA: item.price_a == null ? EMPTY_VALUE : formatCurrency(item.price_a, currency),
    priceB: item.price_b == null ? EMPTY_VALUE : formatCurrency(item.price_b, currency),
    absoluteChange: formatSignedCurrency(item.absolute_change, currency) ?? EMPTY_VALUE,
    percentageChange: formatSignedPercentage(item.percentage_change) ?? EMPTY_VALUE,
    classification: formatClassification(item),
  };
}

/** Single column for both classifications: "A → B" only when they actually differ. */
function formatClassification(item: PriceListComparisonItem): string {
  const { classification_a: a, classification_b: b } = item;
  if (a === b) return a ?? EMPTY_VALUE;
  return `${a ?? EMPTY_VALUE} → ${b ?? EMPTY_VALUE}`;
}

export type ChangeTone = "up" | "down" | "none";

/** `none` covers both "no delta at all" and an exact zero delta. */
export function getChangeTone(absoluteChange: string | null): ChangeTone {
  const parsed = parseDecimal(absoluteChange);
  if (parsed == null || parsed === 0) return "none";
  return parsed > 0 ? "up" : "down";
}
