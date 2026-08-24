import { describe, expect, it } from "vitest";
import {
  ALL_STATUSES,
  COMPARISON_STATUS_FILTERS,
  COMPARISON_STATUS_LABELS,
  COMPARISON_STATUS_ORDER,
  DISTINCT_LISTS_MESSAGE,
  EMPTY_VALUE,
  SELECT_BOTH_LISTS_MESSAGE,
  describeComparisonList,
  describePriceList,
  filterComparisonItems,
  formatComparisonRow,
  getChangeTone,
  getStatusFilterLabel,
  paginateItems,
  validateComparisonSelection,
} from "./comparison";
import type { ComparisonStatus, PriceList, PriceListComparisonItem } from "@/types/api";

function makeItem(overrides: Partial<PriceListComparisonItem> & { status: ComparisonStatus }): PriceListComparisonItem {
  return {
    product_id: 1,
    part_number: "P1",
    item_number: null,
    description: null,
    price_a_cents: null,
    price_a: null,
    price_b_cents: null,
    price_b: null,
    absolute_change_cents: null,
    absolute_change: null,
    percentage_change: null,
    classification_a: null,
    classification_b: null,
    ...overrides,
  };
}

const DATASET: PriceListComparisonItem[] = [
  makeItem({ product_id: 1, status: "INCREASED", price_a: "100.00", price_b: "110.00", absolute_change: "10.00", percentage_change: "10.00" }),
  makeItem({ product_id: 2, status: "DECREASED", price_a: "100.00", price_b: "90.00", absolute_change: "-10.00", percentage_change: "-10.00" }),
  makeItem({ product_id: 3, status: "UNCHANGED", price_a: "100.00", price_b: "100.00", absolute_change: "0.00", percentage_change: "0.00" }),
  makeItem({ product_id: 4, status: "NEW", price_b: "50.00" }),
  makeItem({ product_id: 5, status: "REMOVED", price_a: "50.00" }),
];

describe("status mapping", () => {
  it("labels the five backend statuses in Spanish", () => {
    expect(COMPARISON_STATUS_ORDER).toEqual(["INCREASED", "DECREASED", "UNCHANGED", "NEW", "REMOVED"]);
    expect(COMPARISON_STATUS_LABELS).toEqual({
      INCREASED: "Aumentó",
      DECREASED: "Disminuyó",
      UNCHANGED: "Sin cambio",
      NEW: "Nuevo",
      REMOVED: "Retirado",
    });
  });

  it("offers a Todos filter ahead of one filter per status", () => {
    expect(COMPARISON_STATUS_FILTERS).toEqual([ALL_STATUSES, ...COMPARISON_STATUS_ORDER]);
    expect(COMPARISON_STATUS_FILTERS.map(getStatusFilterLabel)).toEqual([
      "Todos",
      "Aumentaron",
      "Disminuyeron",
      "Sin cambio",
      "Nuevos",
      "Retirados",
    ]);
  });
});

describe("filterComparisonItems", () => {
  it("returns the untouched dataset for Todos", () => {
    expect(filterComparisonItems(DATASET, ALL_STATUSES)).toBe(DATASET);
  });

  it("keeps only the rows of the selected status", () => {
    for (const status of COMPARISON_STATUS_ORDER) {
      const filtered = filterComparisonItems(DATASET, status);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.status).toBe(status);
    }
  });

  it("yields an empty list when no row matches", () => {
    expect(filterComparisonItems([DATASET[0]], "REMOVED")).toEqual([]);
  });
});

describe("paginateItems", () => {
  const items = Array.from({ length: 125 }, (_, index) => index);

  it("slices the dataset and reports a 1-based range", () => {
    expect(paginateItems(items, 1, 50)).toMatchObject({ page: 1, totalPages: 3, totalItems: 125, from: 1, to: 50 });
    expect(paginateItems(items, 3, 50)).toMatchObject({ page: 3, from: 101, to: 125 });
    expect(paginateItems(items, 3, 50).items).toEqual(items.slice(100));
  });

  it("clamps a page that a stricter filter left out of range", () => {
    expect(paginateItems(items.slice(0, 10), 3, 50)).toMatchObject({ page: 1, totalPages: 1, from: 1, to: 10 });
  });

  it("reports an empty range instead of a phantom first row", () => {
    expect(paginateItems([], 1, 50)).toMatchObject({ items: [], totalItems: 0, totalPages: 1, from: 0, to: 0 });
  });
});

describe("validateComparisonSelection", () => {
  it("asks for both lists while either side is empty", () => {
    expect(validateComparisonSelection(null, null)).toBe(SELECT_BOTH_LISTS_MESSAGE);
    expect(validateComparisonSelection(1, null)).toBe(SELECT_BOTH_LISTS_MESSAGE);
    expect(validateComparisonSelection(null, 2)).toBe(SELECT_BOTH_LISTS_MESSAGE);
  });

  it("blocks comparing a list against itself", () => {
    expect(validateComparisonSelection(7, 7)).toBe(DISTINCT_LISTS_MESSAGE);
  });

  it("accepts two distinct lists", () => {
    expect(validateComparisonSelection(7, 8)).toBeNull();
  });
});

describe("price list labels", () => {
  const priceList: PriceList = {
    id: 3,
    supplier: "DONALDSON",
    import_id: 9,
    effective_date: "2026-01-15",
    currency: "MXN",
    source_filename: "donaldson_2026.xlsx",
    status: "ACTIVE",
    created_at: "2026-01-16T10:00:00Z",
  };

  it("identifies an option by date, supplier and currency", () => {
    expect(describePriceList(priceList)).toBe("15 ene 2026 · DONALDSON · MXN");
  });

  it("drops the supplier inside a comparison, where it is shown once", () => {
    expect(
      describeComparisonList({ id: 3, effective_date: "2025-10-20", currency: "MXN", source_filename: "x.xlsx" }),
    ).toBe("20 oct 2025 · MXN");
  });
});

describe("formatComparisonRow", () => {
  it("formats a compared row with its signed delta and percentage", () => {
    expect(formatComparisonRow(DATASET[0], "MXN")).toMatchObject({
      priceA: "$100.00",
      priceB: "$110.00",
      absoluteChange: "+$10.00",
      percentageChange: "+10.00%",
    });
    expect(formatComparisonRow(DATASET[1], "MXN")).toMatchObject({
      absoluteChange: "-$10.00",
      percentageChange: "-10.00%",
    });
  });

  it("renders NEW rows without a price A", () => {
    const values = formatComparisonRow(DATASET[3], "MXN");
    expect(values.priceA).toBe(EMPTY_VALUE);
    expect(values.priceB).toBe("$50.00");
    expect(values.absoluteChange).toBe(EMPTY_VALUE);
    expect(values.percentageChange).toBe(EMPTY_VALUE);
  });

  it("renders REMOVED rows without a price B", () => {
    const values = formatComparisonRow(DATASET[4], "MXN");
    expect(values.priceA).toBe("$50.00");
    expect(values.priceB).toBe(EMPTY_VALUE);
    expect(values.absoluteChange).toBe(EMPTY_VALUE);
    expect(values.percentageChange).toBe(EMPTY_VALUE);
  });

  it("omits the percentage when price A was zero, keeping the absolute delta", () => {
    const item = makeItem({
      status: "INCREASED",
      price_a: "0.00",
      price_b: "25.00",
      absolute_change: "25.00",
      percentage_change: null,
    });
    expect(formatComparisonRow(item, "MXN")).toMatchObject({
      priceA: "$0.00",
      absoluteChange: "+$25.00",
      percentageChange: EMPTY_VALUE,
    });
  });

  it("never leaks null, NaN or Infinity for any status", () => {
    const rendered = DATASET.flatMap((item) => Object.values(formatComparisonRow(item, "MXN")));
    for (const value of rendered) {
      expect(value).not.toMatch(/null|undefined|NaN|Infinity/);
    }
  });

  it("shows the classification transition only when it changes", () => {
    expect(formatComparisonRow(makeItem({ status: "UNCHANGED", classification_a: "A", classification_b: "A" }), "MXN").classification).toBe("A");
    expect(formatComparisonRow(makeItem({ status: "INCREASED", classification_a: "A", classification_b: "B" }), "MXN").classification).toBe("A → B");
    expect(formatComparisonRow(makeItem({ status: "NEW", classification_b: "B" }), "MXN").classification).toBe("— → B");
    expect(formatComparisonRow(makeItem({ status: "UNCHANGED" }), "MXN").classification).toBe(EMPTY_VALUE);
  });
});

describe("getChangeTone", () => {
  it("separates rises, drops and the absence of a delta", () => {
    expect(getChangeTone("10.00")).toBe("up");
    expect(getChangeTone("-10.00")).toBe("down");
    expect(getChangeTone("0.00")).toBe("none");
    expect(getChangeTone(null)).toBe("none");
  });
});
