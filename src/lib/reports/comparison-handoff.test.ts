import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMPARISON_HANDOFF_KEY,
  VIEWER_ROUTE,
  buildViewerHref,
  clearComparisonHandoff,
  parseViewerSelection,
  readComparisonHandoff,
  storeComparisonHandoff,
} from "./comparison-handoff";
import type { PriceListComparisonResponse } from "@/types/api";

const COMPARISON: PriceListComparisonResponse = {
  report: { code: "PRICE_LIST_COMPARISON", generated_at: "2026-08-24T16:30:00Z" },
  supplier: { id: 1, code: "DONALDSON", name: "Donaldson" },
  list_a: { id: 7, effective_date: "2025-10-20", currency: "MXN", source_filename: "a.xlsx" },
  list_b: { id: 9, effective_date: "2026-01-15", currency: "MXN", source_filename: "b.xlsx" },
  summary: {
    total_products: 1,
    increased: 1,
    decreased: 0,
    unchanged: 0,
    new: 0,
    removed: 0,
    average_percentage_change: "10.00",
  },
  items: [],
};

const SELECTION = { priceListAId: 7, priceListBId: 9 };

/** Minimal in-memory `sessionStorage`; the test environment is `node`. */
function useMemoryStorage(overrides: Partial<Storage> = {}) {
  const entries = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => void entries.delete(key),
    setItem: (key, value) => void entries.set(key, value),
    ...overrides,
  };
  vi.stubGlobal("sessionStorage", storage);
  return entries;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildViewerHref", () => {
  it("puts only the two ids in the URL", () => {
    expect(buildViewerHref(7, 9)).toBe(`${VIEWER_ROUTE}?a=7&b=9`);
  });
});

describe("parseViewerSelection", () => {
  it("reads a well-formed pair", () => {
    expect(parseViewerSelection({ a: "7", b: "9" })).toEqual(SELECTION);
  });

  it("takes the first value when a param repeats", () => {
    expect(parseViewerSelection({ a: ["7", "8"], b: "9" })).toEqual(SELECTION);
  });

  it.each([
    ["a missing id", { b: "9" }],
    ["a non-numeric id", { a: "abc", b: "9" }],
    ["a fractional id", { a: "7.5", b: "9" }],
    ["a zero id", { a: "0", b: "9" }],
    ["a negative id", { a: "-7", b: "9" }],
    // A == B is a 422 at the backend and has no report to draw either way.
    ["the same list twice", { a: "7", b: "7" }],
  ])("rejects %s", (_label, params) => {
    expect(parseViewerSelection(params)).toBeNull();
  });
});

describe("session hand-off", () => {
  it("round-trips a comparison for the pair it was stored under", () => {
    useMemoryStorage();
    expect(storeComparisonHandoff({ ...SELECTION, comparison: COMPARISON })).toBe(true);
    expect(readComparisonHandoff(SELECTION)).toEqual(COMPARISON);
  });

  it("stores under a single well-known key", () => {
    const entries = useMemoryStorage();
    storeComparisonHandoff({ ...SELECTION, comparison: COMPARISON });
    expect([...entries.keys()]).toEqual([COMPARISON_HANDOFF_KEY]);
  });

  it("ignores a cached comparison generated for a different pair", () => {
    useMemoryStorage();
    storeComparisonHandoff({ priceListAId: 1, priceListBId: 2, comparison: COMPARISON });
    expect(readComparisonHandoff(SELECTION)).toBeNull();
  });

  it("returns null when nothing was stored", () => {
    useMemoryStorage();
    expect(readComparisonHandoff(SELECTION)).toBeNull();
  });

  it("returns null on corrupted or foreign content instead of throwing", () => {
    const entries = useMemoryStorage();
    entries.set(COMPARISON_HANDOFF_KEY, "{not json");
    expect(readComparisonHandoff(SELECTION)).toBeNull();
    entries.set(COMPARISON_HANDOFF_KEY, JSON.stringify({ priceListAId: 7, priceListBId: 9 }));
    expect(readComparisonHandoff(SELECTION)).toBeNull();
  });

  it("reports a failed write so the caller knows the viewer will re-fetch", () => {
    useMemoryStorage({
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    });
    expect(storeComparisonHandoff({ ...SELECTION, comparison: COMPARISON })).toBe(false);
  });

  it("degrades to a miss when storage is unavailable altogether", () => {
    vi.stubGlobal("sessionStorage", undefined);
    expect(storeComparisonHandoff({ ...SELECTION, comparison: COMPARISON })).toBe(false);
    expect(readComparisonHandoff(SELECTION)).toBeNull();
    expect(() => clearComparisonHandoff()).not.toThrow();
  });

  it("clears the cached comparison", () => {
    useMemoryStorage();
    storeComparisonHandoff({ ...SELECTION, comparison: COMPARISON });
    clearComparisonHandoff();
    expect(readComparisonHandoff(SELECTION)).toBeNull();
  });
});
