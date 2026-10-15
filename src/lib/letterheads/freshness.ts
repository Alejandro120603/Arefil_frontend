import type { LetterheadAdmin } from "@/types/letterhead-admin";

/**
 * One freshness policy for the letterhead administration: every piece of
 * confirmed data is stamped with the moment its request was *issued*, on a
 * single monotonic clock. Data from a request issued later is newer, even if
 * an older request answers after it — so a GET started before a PATCH can
 * never override the PATCH's confirmed result. Restoring cached data or an
 * optimistic guess never gets a new stamp.
 */
export function freshnessClock(): number {
  return performance.now();
}

/** The catalog plus, per letterhead, when the data shown for it was requested. */
export interface CatalogSnapshot {
  items: LetterheadAdmin[];
  stamps: Record<number, number>;
}

/** Merges a catalog read issued at `issuedAt`: an entry already confirmed by a later request is kept. */
export function mergeCatalogRead(
  current: CatalogSnapshot | null,
  items: LetterheadAdmin[],
  issuedAt: number,
): CatalogSnapshot {
  const stamps: Record<number, number> = {};
  const merged = items.map((item) => {
    const previousStamp = current?.stamps[item.id];
    const previous = current?.items.find((candidate) => candidate.id === item.id);
    if (previous != null && previousStamp != null && previousStamp > issuedAt) {
      stamps[item.id] = previousStamp;
      return previous;
    }
    stamps[item.id] = issuedAt;
    return item;
  });
  return { items: merged, stamps };
}

/** Records one letterhead confirmed by a mutation issued at `issuedAt` (never an optimistic value). */
export function mergeConfirmedLetterhead(
  current: CatalogSnapshot | null,
  confirmed: LetterheadAdmin,
  issuedAt: number,
): CatalogSnapshot | null {
  if (current == null) return current;
  const previousStamp = current.stamps[confirmed.id];
  if (previousStamp != null && previousStamp > issuedAt) return current;
  return {
    items: current.items.map((item) => (item.id === confirmed.id ? confirmed : item)),
    stamps: { ...current.stamps, [confirmed.id]: issuedAt },
  };
}
