"use client";

/**
 * Browser-only Viewer entry point. Designer uses its own package entry point;
 * both share setup through `stimulsoft-runtime.ts`.
 *
 * `stimulsoft-reports-js-react/viewer` pulls in the engine, chart, export,
 * xlsx and maps bundles (~14 MB of JavaScript) and its `StiViewer` writes the
 * whole toolbar/canvas into a DOM node, so it must never be part of a Server
 * Component graph. Callers must therefore reach this file through
 * `next/dynamic(..., { ssr: false })` - see `price-list-comparison-report.tsx`,
 * which is the only importer.
 *
 * The Designer bundle is deliberately not imported here so users of the Viewer
 * do not download the editing UI.
 */
import { useEffect, useMemo } from "react";
import { Stimulsoft, Viewer } from "stimulsoft-reports-js-react/viewer";
import { applyStimulsoftLicense, registerStimulsoftData } from "@/lib/reports/stimulsoft-runtime";

export interface StimulsoftReportViewerProps {
  /** Raw `.mrt` contents (JSON), already fetched by the caller. */
  template: string;
  /** Dataset registered under `dataSourceName`; see `stimulsoft-dataset.ts`. */
  data: unknown;
  dataSourceName: string;
  /**
   * Called if the template or the dataset cannot be handed to Stimulsoft. Must
   * be referentially stable (`useCallback`), it is an effect dependency.
   */
  onError: (error: unknown) => void;
}

/**
 * Stimulsoft reads its license from a module-level static, so it has to be set
 * before the first report is created. Reports.JS runs entirely in the browser:
 * whatever key it uses is downloaded by every visitor and is readable in
 * devtools. `NEXT_PUBLIC_STIMULSOFT_LICENSE_KEY` states that plainly instead of
 * pretending a server-only variable could protect it (see the deliverable, §12).
 * Unset means trial mode: fully functional, with a TRIAL banner on every page.
 */
function createReport(template: string, data: unknown, dataSourceName: string) {
  applyStimulsoftLicense(Stimulsoft);
  const report = new Stimulsoft.Report.StiReport();
  // `load` takes the already-fetched text; `loadFile` would issue its own
  // request and give us no way to report a 404 to the user.
  report.load(template);
  // The committed template ships without a data connection, but clearing is
  // what makes re-registering idempotent if that ever changes.
  registerStimulsoftData(report, Stimulsoft, data, dataSourceName);
  return report;
}

function createViewerOptions() {
  const options = new Stimulsoft.Viewer.StiViewerOptions();
  options.appearance.scrollbarsMode = true;
  options.appearance.fullScreenMode = false;
  // Opening an arbitrary .mrt and handing the report to the Designer are both
  // out of scope; PDF/Excel/print stay on, they are the point of the report.
  options.toolbar.showOpenButton = false;
  options.toolbar.showDesignButton = false;
  options.toolbar.showAboutButton = false;
  options.exports.showExportToDocument = false;
  return options;
}

export default function StimulsoftReportViewer({
  template,
  data,
  dataSourceName,
  onError,
}: StimulsoftReportViewerProps) {
  // Building the report is pure computation over props (no DOM), so it belongs
  // in render rather than in an effect that would setState a second time.
  const built = useMemo(() => {
    try {
      return { report: createReport(template, data, dataSourceName), error: null };
    } catch (error) {
      return { report: null, error };
    }
  }, [template, data, dataSourceName]);

  const options = useMemo(() => createViewerOptions(), []);

  useEffect(() => {
    if (built.error != null) onError(built.error);
  }, [built, onError]);

  if (built.report == null) return null;
  return <Viewer report={built.report} options={options} />;
}
