// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useReportTemplateInspection, type ActiveTemplateTarget } from "./use-report-template-inspection";
import { ApiError } from "@/lib/api/errors";
import { inspectionWithPlaceholders } from "@/test/template-inspection";

const { inspectReportExcelTemplate } = vi.hoisted(() => ({ inspectReportExcelTemplate: vi.fn() }));
vi.mock("@/lib/api/reports", () => ({ inspectReportExcelTemplate }));

afterEach(() => vi.clearAllMocks());

function renderInspection(code: string | null, target: ActiveTemplateTarget) {
  return renderHook(({ code: current, target: active }) => useReportTemplateInspection(current, active), {
    initialProps: { code, target },
  });
}

describe("useReportTemplateInspection", () => {
  it("does nothing for a new report, a missing template, or metadata still loading", () => {
    expect(renderInspection(null, "discover").result.current.status).toBe("idle");
    expect(renderInspection("COTIZACION", null).result.current.status).toBe("none");
    expect(renderInspection("COTIZACION", "pending").result.current.status).toBe("loading");
    expect(inspectReportExcelTemplate).not.toHaveBeenCalled();
  });

  it("inspects the given version once and exposes its dependencies", async () => {
    inspectReportExcelTemplate.mockResolvedValue(inspectionWithPlaceholders(["parameters.customer_name"]));
    const { result, rerender } = renderInspection("COTIZACION", { version: 4, checksum: "abc" });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.templateVersion).toBe(4);
    expect(result.current.templateChecksum).toBe("abc");
    expect(result.current.dependencies.parameters.get("customer_name")?.[0].cell).toBe("B2");

    rerender({ code: "COTIZACION", target: { version: 4, checksum: "abc" } });
    expect(inspectReportExcelTemplate).toHaveBeenCalledTimes(1);
  });

  it("maps 404 to no template and 422 to the workbook-limits state", async () => {
    inspectReportExcelTemplate.mockRejectedValueOnce(new ApiError(404, "sin plantilla"));
    const missing = renderInspection("COTIZACION", "discover");
    await waitFor(() => expect(missing.result.current.status).toBe("none"));

    inspectReportExcelTemplate.mockRejectedValueOnce(new ApiError(422, "Demasiadas celdas."));
    const limits = renderInspection("OTRO", "discover");
    await waitFor(() => expect(limits.result.current.status).toBe("limits"));
    expect(limits.result.current.error).toBe("Demasiadas celdas.");
    expect(limits.result.current.dependencies.parameters.size).toBe(0);
  });

  it("reload() inspects again; replace() adopts a response without a GET, even before the metadata catches up", async () => {
    inspectReportExcelTemplate.mockResolvedValue(inspectionWithPlaceholders(["rows.unit_price"]));
    const { result, rerender } = renderInspection("COTIZACION", { version: 4, checksum: "abc" });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.reload());
    await waitFor(() => expect(inspectReportExcelTemplate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.replace(inspectionWithPlaceholders([], { version: 5, checksum: "v5" })));
    expect(result.current.templateVersion).toBe(5);
    expect(result.current.dependencies.rows.size).toBe(0);
    rerender({ code: "COTIZACION", target: { version: 5, checksum: "v5" } });
    expect(result.current.status).toBe("ready");
    expect(inspectReportExcelTemplate).toHaveBeenCalledTimes(2);
  });

  it("forgets the inspection as soon as the template is deleted", async () => {
    inspectReportExcelTemplate.mockResolvedValue(inspectionWithPlaceholders(["rows.unit_price"]));
    const { result, rerender } = renderInspection("COTIZACION", { version: 4, checksum: "abc" });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    rerender({ code: "COTIZACION", target: null });
    expect(result.current.status).toBe("none");
    expect(result.current.inspection).toBeNull();
    expect(result.current.dependencies.rows.size).toBe(0);
  });
});
