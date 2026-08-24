/**
 * Hand-off of an already-generated comparison from `/donaldson/reports` to the
 * Stimulsoft viewer route.
 *
 * The viewer lives on its own page (the toolbar and canvas need the whole
 * screen), so the React state holding the comparison is unmounted by the
 * navigation. Putting a 2 MiB dataset in the URL is not an option, so the two
 * list ids travel in the query string — which also makes the viewer URL
 * shareable and reload-safe — and the payload itself travels through
 * `sessionStorage`.
 *
 * The store is a cache, never the source of truth: `sessionStorage` can be
 * unavailable (private mode, storage disabled) or refuse a 2 MiB write, and a
 * pasted link has no entry at all. Every failure path here returns
 * null/false so the viewer falls back to asking Backend #9 again for the very
 * same pair of ids.
 */
import type { PriceListComparisonResponse } from "@/types/api";

export const COMPARISON_HANDOFF_KEY = "arefil.price-list-comparison";

export const VIEWER_ROUTE = "/donaldson/reports/price-list-comparison/view";

export interface ComparisonHandoff {
  priceListAId: number;
  priceListBId: number;
  comparison: PriceListComparisonResponse;
}

export function buildViewerHref(priceListAId: number, priceListBId: number): string {
  return `${VIEWER_ROUTE}?a=${priceListAId}&b=${priceListBId}`;
}

/** `id` is a positive integer in the backend; anything else is a bad link. */
function parseId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw == null) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export interface ViewerSelection {
  priceListAId: number;
  priceListBId: number;
}

/**
 * Reads `?a=&b=` off the viewer route. Returns null when either id is missing
 * or malformed, or when both point at the same list - the comparison endpoint
 * answers 422 for A == B, and there is no report to draw either way.
 */
export function parseViewerSelection(
  params: Record<string, string | string[] | undefined>,
): ViewerSelection | null {
  const priceListAId = parseId(params.a);
  const priceListBId = parseId(params.b);
  if (priceListAId == null || priceListBId == null) return null;
  if (priceListAId === priceListBId) return null;
  return { priceListAId, priceListBId };
}

function getSessionStorage(): Storage | null {
  try {
    // Accessing `sessionStorage` itself throws when site data is blocked, so
    // the guard has to be inside the try, not a `typeof window` check.
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Caches a comparison for the viewer route. Returns whether the write landed -
 * callers should navigate either way, since the viewer re-fetches on a miss.
 */
export function storeComparisonHandoff(handoff: ComparisonHandoff): boolean {
  const storage = getSessionStorage();
  if (storage == null) return false;
  try {
    storage.setItem(COMPARISON_HANDOFF_KEY, JSON.stringify(handoff));
    return true;
  } catch {
    // Quota exceeded on a very large comparison, most likely.
    return false;
  }
}

/**
 * Returns the cached comparison only when it is the one the URL asks for.
 * A stale entry (the user edited the query string, or opened a second tab) must
 * never be shown under the wrong pair of ids.
 */
export function readComparisonHandoff(selection: ViewerSelection): PriceListComparisonResponse | null {
  const storage = getSessionStorage();
  if (storage == null) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(COMPARISON_HANDOFF_KEY);
  } catch {
    return null;
  }
  if (raw == null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isComparisonHandoff(parsed)) return null;
  if (parsed.priceListAId !== selection.priceListAId) return null;
  if (parsed.priceListBId !== selection.priceListBId) return null;
  return parsed.comparison;
}

export function clearComparisonHandoff(): void {
  const storage = getSessionStorage();
  if (storage == null) return;
  try {
    storage.removeItem(COMPARISON_HANDOFF_KEY);
  } catch {
    // Nothing to do - the cache is best-effort by design.
  }
}

/**
 * Structural check on data that outlived a page load. Only the fields this
 * module compares against the URL plus the shape the report actually reads are
 * verified; a deeper validation would just duplicate the backend contract.
 */
function isComparisonHandoff(value: unknown): value is ComparisonHandoff {
  if (value == null || typeof value !== "object") return false;
  const candidate = value as Partial<ComparisonHandoff>;
  if (typeof candidate.priceListAId !== "number") return false;
  if (typeof candidate.priceListBId !== "number") return false;
  const comparison = candidate.comparison as PriceListComparisonResponse | undefined;
  if (comparison == null || typeof comparison !== "object") return false;
  return Array.isArray(comparison.items) && comparison.summary != null && comparison.report != null;
}
