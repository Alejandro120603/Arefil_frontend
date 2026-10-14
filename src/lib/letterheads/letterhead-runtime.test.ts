import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { getReportLetterheadOptions } from "@/lib/api/letterhead-runtime";
import {
  frozenLetterhead,
  initialLetterheadSelection,
  isLetterheadSelectionError,
  letterheadChoices,
  presentationMatches,
  reconcileLetterheadSelection,
  withPresentation,
} from "./letterhead-runtime";
import type { ReportLetterheadOptions } from "@/types/letterhead-runtime";

afterEach(() => {
  vi.unstubAllGlobals();
});

const OPTIONS: ReportLetterheadOptions = {
  report_code: "PRUEBA_COTIZACION",
  supported: true,
  default_letterhead_version_id: 11,
  options: [
    { letterhead_version_id: null, letterhead_id: null, label: "Sin membrete", is_default: false },
    { letterhead_version_id: 11, letterhead_id: 1, label: "Asistente de ventas", version: 2, is_default: true },
    { letterhead_version_id: 21, letterhead_id: 2, label: "Olivia Banda", version: 1, is_default: false },
  ],
};

function builder(presentation: unknown) {
  return { columns: [], rows: [], totals: {}, row_count: 0, truncated: false, presentation };
}

describe("letterhead runtime rules", () => {
  it("starts on the backend default only while it is offered", () => {
    expect(initialLetterheadSelection(OPTIONS)).toBe(11);
    expect(initialLetterheadSelection({ ...OPTIONS, default_letterhead_version_id: null })).toBeNull();
    expect(initialLetterheadSelection({ ...OPTIONS, default_letterhead_version_id: 99 })).toBeNull();
  });

  it("keeps a still-offered choice and never swaps a vanished one for another", () => {
    expect(reconcileLetterheadSelection(21, OPTIONS)).toBe(21);
    expect(reconcileLetterheadSelection(null, OPTIONS)).toBeNull();
    expect(reconcileLetterheadSelection(12, OPTIONS)).toBeUndefined();
    expect(reconcileLetterheadSelection(undefined, OPTIONS)).toBeUndefined();
  });

  it("lists real letterheads only", () => {
    expect(letterheadChoices(OPTIONS).map((option) => option.letterhead_version_id)).toEqual([11, 21]);
  });

  it("adds presentation beside the parameters without touching them", () => {
    const parameters = { price_list_id: 7, items: [{ product_id: 1, quantity: 2, discount: "10" }] };
    const body = withPresentation(parameters, 11);
    expect(body).toEqual({ ...parameters, presentation: { letterhead_version_id: 11 } });
    expect(parameters).not.toHaveProperty("presentation");
    expect(withPresentation({}, null)).toEqual({ presentation: { letterhead_version_id: null } });
  });

  it("recognizes refusals of the selection, not of business parameters", () => {
    expect(isLetterheadSelectionError(new ApiError(422, { code: "LETTERHEAD_UNAVAILABLE", message: "x" }))).toBe(true);
    expect(isLetterheadSelectionError(new ApiError(409, { code: "LETTERHEAD_CONFLICT", message: "x" }))).toBe(true);
    expect(isLetterheadSelectionError(new ApiError(422, [{ loc: ["presentation", "letterhead_version_id"], msg: "x" }]))).toBe(true);
    expect(isLetterheadSelectionError(new ApiError(422, [{ loc: ["items", 0, "quantity"], msg: "x" }]))).toBe(false);
    expect(isLetterheadSelectionError(new ApiError(422, { code: "REPORT_NOT_READY", message: "x" }))).toBe(false);
    expect(isLetterheadSelectionError(new ApiError(500, { code: "LETTERHEAD_INTEGRITY", message: "x" }))).toBe(false);
    expect(isLetterheadSelectionError(new Error("x"))).toBe(false);
  });

  it("reads the frozen presentation from the execution itself", () => {
    expect(frozenLetterhead(builder({ letterhead: null }))).toBeNull();
    expect(frozenLetterhead(builder({ letterhead: { letterhead_version_id: 11 } }))).toEqual({ letterhead_version_id: 11 });
    expect(frozenLetterhead(builder(undefined))).toBeUndefined();
    expect(frozenLetterhead({ columns: ["a"], rows: [], row_count: 0 })).toBeUndefined();
    expect(presentationMatches(builder({ letterhead: { letterhead_version_id: 11 } }), 11)).toBe(true);
    expect(presentationMatches(builder({ letterhead: { letterhead_version_id: 11 } }), null)).toBe(false);
    expect(presentationMatches(builder({ letterhead: null }), 21)).toBe(false);
    expect(presentationMatches(builder(undefined), 21)).toBe(true);
  });
});

describe("letterhead runtime API", () => {
  it("reads the options of a report through the runtime endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(OPTIONS));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getReportLetterheadOptions("PRUEBA_DESCUENTO")).resolves.toEqual(OPTIONS);
    expect(fetchMock.mock.calls[0][0]).toBe("/backend-api/reports/PRUEBA_DESCUENTO/letterheads");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET", credentials: "same-origin" });
  });
});
