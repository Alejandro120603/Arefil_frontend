import type { LetterheadAdmin } from "@/types/letterhead-admin";

/**
 * One freshness policy for the letterhead administration, on a single
 * monotonic clock, stamped per letterhead:
 *
 * - A **read** (GET) is stamped when it is *issued*. Its data is at least as
 *   new as that moment, never older.
 * - A **mutation** (PATCH, PUT) is stamped when its success is *confirmed*
 *   (the response arrived). A read issued before that moment — before the
 *   mutation started, or while it was still pending — may have been served
 *   the pre-mutation state, so it is older than the confirmed result and can
 *   never override it, whenever it answers. Only a read issued after the
 *   confirmation is newer, so later changes (another administrator's
 *   included) are picked up as soon as such a read answers.
 *
 * Failed mutations, optimistic guesses and restored cached data never get a
 * stamp.
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

/**
 * Records one letterhead returned by a successful mutation, stamped at its
 * confirmation (`confirmedAt`, never an optimistic value). Only data from a
 * read issued after that confirmation is kept instead.
 */
export function mergeConfirmedLetterhead(
  current: CatalogSnapshot | null,
  confirmed: LetterheadAdmin,
  confirmedAt: number,
): CatalogSnapshot | null {
  if (current == null) return current;
  const previousStamp = current.stamps[confirmed.id];
  if (previousStamp != null && previousStamp > confirmedAt) return current;
  return {
    items: current.items.map((item) => (item.id === confirmed.id ? confirmed : item)),
    stamps: { ...current.stamps, [confirmed.id]: confirmedAt },
  };
}
