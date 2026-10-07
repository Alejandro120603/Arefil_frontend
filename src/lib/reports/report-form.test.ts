import { describe, expect, it } from "vitest";
import { emptyReportForm, toReportInputsUpdate, toReportRequest } from "@/lib/reports/report-form";

describe("report form and publishing (#44)", () => {
  it("M: a new report form does not ask to publish the report", () => {
    expect(emptyReportForm().enabled).toBe(false);
    expect(toReportRequest({ ...emptyReportForm(), code: "nuevo", name: "Nuevo", data_source_id: 1 }).enabled).toBe(false);
  });

  it("an inputs update never carries `enabled`, so it cannot undo Finalizar", () => {
    const request = toReportInputsUpdate(
      { ...emptyReportForm(), code: "R", name: "R", data_source_id: 1, enabled: true },
      [],
    );
    expect(request).not.toHaveProperty("enabled");
    expect(request).toMatchObject({ name: "R", data_source_id: 1, parameters: [], parameter_groups: [] });
  });
});
