interface SaveableReport {
  saveToJsonString(): string;
}

interface DesignerEventArgs<TReport> {
  async: boolean;
  preventDefault: boolean;
  report: TReport;
}

/** Intercepts Stimulsoft's file save and finishes its async event exactly once. */
export function handleDesignerSave<TReport extends SaveableReport>(
  args: DesignerEventArgs<TReport>,
  callback: () => void,
  save: (template: string) => Promise<void>,
  onUnexpectedError: (error: unknown) => void,
): void {
  args.async = true;
  args.preventDefault = true;
  void (async () => {
    try {
      await save(args.report.saveToJsonString());
    } catch (error) {
      onUnexpectedError(error);
    } finally {
      callback();
    }
  })();
}

/** Delays the built-in preview until controlled report data has been attached. */
export function handleDesignerPreview<TReport, TData>(
  args: DesignerEventArgs<TReport>,
  callback: () => void,
  loadData: () => Promise<TData>,
  registerData: (report: TReport, data: TData) => void,
  onError: (error: unknown) => void,
): void {
  args.async = true;
  void (async () => {
    try {
      registerData(args.report, await loadData());
    } catch (error) {
      // Do not open a misleading empty preview when parameters or the backend
      // failed. Stimulsoft reads this flag when the async callback resumes.
      args.preventDefault = true;
      onError(error);
    } finally {
      callback();
    }
  })();
}
