/** Shared browser-side setup used by both Stimulsoft entry points. */

interface StimulsoftDataSetLike {
  readJson(value: string): void;
}

interface StimulsoftRuntimeLike {
  Base: { StiLicense: { key: string } };
  System: { Data: { DataSet: new (name: string) => StimulsoftDataSetLike } };
}

export interface StimulsoftReportLike {
  dictionary: { databases: { clear(): void } };
  regData(name: string, alias: string, dataSet: StimulsoftDataSetLike): void;
}

export function applyStimulsoftLicense(stimulsoft: StimulsoftRuntimeLike): void {
  const key = process.env.NEXT_PUBLIC_STIMULSOFT_LICENSE_KEY?.trim();
  if (key) stimulsoft.Base.StiLicense.key = key;
}

export function registerStimulsoftData(
  report: StimulsoftReportLike,
  stimulsoft: StimulsoftRuntimeLike,
  data: unknown,
  dataSourceName: string,
): void {
  // Templates are presentation only. Never retain a connection embedded in an
  // uploaded .mrt; all runtime data comes from the allow-listed Arefil API.
  report.dictionary.databases.clear();
  const dataSet = new stimulsoft.System.Data.DataSet(dataSourceName);
  dataSet.readJson(JSON.stringify(data));
  report.regData(dataSourceName, dataSourceName, dataSet);
}
