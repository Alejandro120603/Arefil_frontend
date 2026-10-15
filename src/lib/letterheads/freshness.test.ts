import { describe, expect, it } from "vitest";
import { mergeCatalogRead, mergeConfirmedLetterhead } from "./freshness";
import type { LetterheadAdmin } from "@/types/letterhead-admin";

const item = (id: number, is_active: boolean) => ({ id, is_active, display_name: `L${id}` }) as LetterheadAdmin;

describe("letterhead freshness", () => {
  it("a read never overrides an entry confirmed by a later request", () => {
    const first = mergeCatalogRead(null, [item(1, true), item(2, true)], 10);
    const patched = mergeConfirmedLetterhead(first, item(1, false), 20);
    const stale = mergeCatalogRead(patched, [item(1, true), item(2, false)], 15);
    expect(stale.items.map((entry) => [entry.id, entry.is_active])).toEqual([[1, false], [2, false]]);
    expect(stale.stamps).toEqual({ 1: 20, 2: 15 });
    const fresh = mergeCatalogRead(stale, [item(1, true), item(2, true)], 30);
    expect(fresh.items.map((entry) => entry.is_active)).toEqual([true, true]);
  });

  it("an older confirmation does not replace a newer one", () => {
    const base = mergeCatalogRead(null, [item(1, true)], 40);
    expect(mergeConfirmedLetterhead(base, item(1, false), 30)).toBe(base);
    expect(mergeConfirmedLetterhead(null, item(1, false), 50)).toBeNull();
  });

  it("a mutation confirmed after a concurrent read wins over that read, a later read wins over it", () => {
    const base = mergeCatalogRead(null, [item(1, false)], 10);
    // PATCH issued at 20; a read issued at 25 (while pending) answers with the old state.
    const concurrent = mergeCatalogRead(base, [item(1, false)], 25);
    // The PATCH is confirmed at 30: stamped at confirmation, it wins.
    const confirmed = mergeConfirmedLetterhead(concurrent, item(1, true), 30);
    expect(confirmed?.items[0].is_active).toBe(true);
    // The same concurrent read answering again (late) cannot undo it…
    expect(mergeCatalogRead(confirmed, [item(1, false)], 25).items[0].is_active).toBe(true);
    // …but a read issued after the confirmation is newer (another admin's change).
    expect(mergeCatalogRead(confirmed, [item(1, false)], 40).items[0].is_active).toBe(false);
  });
});
