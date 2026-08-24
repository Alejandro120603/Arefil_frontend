import { afterEach, describe, expect, it, vi } from "vitest";
import { applyStimulsoftLicense, registerStimulsoftData } from "./stimulsoft-runtime";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("shared Stimulsoft runtime", () => {
  it("clears template connections and registers only controlled JSON data", () => {
    const clear = vi.fn();
    const readJson = vi.fn();
    const regData = vi.fn();
    const dataSetNames: string[] = [];
    class DataSet {
      constructor(name: string) {
        dataSetNames.push(name);
      }
      readJson(value: string) {
        readJson(value);
      }
    }
    const stimulsoft = {
      Base: { StiLicense: { key: "" } },
      System: { Data: { DataSet } },
    };
    const report = { dictionary: { databases: { clear } }, regData };
    const data = { report: [{ code: "PRICE_LIST_COMPARISON" }], items: [] };

    registerStimulsoftData(report, stimulsoft, data, "ArefilReportData");

    expect(dataSetNames).toEqual(["ArefilReportData"]);
    expect(clear).toHaveBeenCalledOnce();
    expect(readJson).toHaveBeenCalledWith(JSON.stringify(data));
    expect(regData).toHaveBeenCalledWith("ArefilReportData", "ArefilReportData", expect.anything());
  });

  it("applies only the explicitly public browser license", () => {
    vi.stubEnv("NEXT_PUBLIC_STIMULSOFT_LICENSE_KEY", "  public-key  ");
    const stimulsoft = {
      Base: { StiLicense: { key: "" } },
      System: { Data: { DataSet: class { readJson() {} } } },
    };

    applyStimulsoftLicense(stimulsoft);

    expect(stimulsoft.Base.StiLicense.key).toBe("public-key");
  });
});
