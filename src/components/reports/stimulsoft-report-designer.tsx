"use client";

/**
 * Browser-only Stimulsoft Designer boundary. The surrounding workspace owns
 * network and UX state; this module owns only the third-party lifecycle.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Designer, Stimulsoft } from "stimulsoft-reports-js-react/designer";
import {
  handleDesignerPreview,
  handleDesignerSave,
} from "@/lib/reports/stimulsoft-designer-events";
import {
  applyStimulsoftLicense,
  registerStimulsoftData,
} from "@/lib/reports/stimulsoft-runtime";
import { AREFIL_DATA_SOURCE_NAME } from "@/lib/reports/stimulsoft-dataset";

export interface StimulsoftReportDesignerProps {
  template: string | null;
  designerId: string;
  onSaveTemplate: (template: string) => Promise<void>;
  loadPreviewData: () => Promise<unknown>;
  onEventError: (error: unknown) => void;
}

function createDesignerOptions() {
  const options = new Stimulsoft.Designer.StiDesignerOptions();
  options.width = "100%";
  options.height = "100%";
  options.appearance.fullScreenMode = false;
  options.appearance.showSaveDialog = false;

  options.toolbar.showSaveButton = true;
  options.toolbar.showPreviewButton = true;
  options.toolbar.showPublishButton = false;
  options.toolbar.showAboutButton = false;
  options.toolbar.showFileMenu = false;
  options.toolbar.showFileMenuNew = false;
  options.toolbar.showFileMenuNewReport = false;
  options.toolbar.showFileMenuNewDashboard = false;
  options.toolbar.showFileMenuOpen = false;
  options.toolbar.showFileMenuSave = true;
  options.toolbar.showFileMenuSaveAs = false;

  // The Designer edits presentation, never the backend data contract. Existing
  // fields remain visible and usable, while connections and schema are locked.
  const permissions = Stimulsoft.Designer.StiDesignerPermissions;
  options.dictionary.dataConnectionsPermissions = permissions.None;
  options.dictionary.dataSourcesPermissions = permissions.View;
  options.dictionary.dataTransformationsPermissions = permissions.None;
  options.dictionary.dataColumnsPermissions = permissions.View;
  options.dictionary.dataRelationsPermissions = permissions.View;
  options.dictionary.businessObjectsPermissions = permissions.None;
  options.dictionary.variablesPermissions = permissions.ModifyView;
  options.dictionary.resourcesPermissions = permissions.All;

  options.viewerOptions.toolbar.showOpenButton = false;
  options.viewerOptions.toolbar.showDesignButton = false;
  options.viewerOptions.toolbar.showAboutButton = false;
  return options;
}

export default function StimulsoftReportDesigner({
  template,
  designerId,
  onSaveTemplate,
  loadPreviewData,
  onEventError,
}: StimulsoftReportDesignerProps) {
  // The package wrapper binds handlers only when it creates the designer. Refs
  // keep its stable callbacks pointed at the latest selector/workspace state.
  const saveRef = useRef(onSaveTemplate);
  const previewRef = useRef(loadPreviewData);
  const errorRef = useRef(onEventError);
  useEffect(() => {
    saveRef.current = onSaveTemplate;
    previewRef.current = loadPreviewData;
    errorRef.current = onEventError;
  }, [loadPreviewData, onEventError, onSaveTemplate]);

  const built = useMemo(() => {
    try {
      applyStimulsoftLicense(Stimulsoft);
      const nextReport = template == null
        ? Stimulsoft.Report.StiReport.createNewReport()
        : new Stimulsoft.Report.StiReport();
      if (template != null) nextReport.load(template);
      // Discard any connection persisted in a template before it reaches either
      // Designer preview or a subsequent save.
      nextReport.dictionary.databases.clear();
      return { report: nextReport, error: null };
    } catch (error) {
      return { report: null, error };
    }
  }, [template]);
  const options = useMemo(() => createDesignerOptions(), []);

  useEffect(() => {
    if (built.error != null) errorRef.current(built.error);
  }, [built]);

  const handleSave = useCallback(
    (args: Stimulsoft.Designer.SaveReportArgs, callback: () => void) => {
      handleDesignerSave(args, callback, (content) => saveRef.current(content), (error) => errorRef.current(error));
    },
    [],
  );

  const handlePreview = useCallback(
    (args: Stimulsoft.Designer.PreviewReportArgs, callback: () => void) => {
      handleDesignerPreview(
        args,
        callback,
        () => previewRef.current(),
        (currentReport, data) => {
          registerStimulsoftData(currentReport, Stimulsoft, data, AREFIL_DATA_SOURCE_NAME);
        },
        (error) => errorRef.current(error),
      );
    },
    [],
  );

  const handleBlockedReportAction = useCallback(
    (
      args: Stimulsoft.Designer.OpenReportArgs | Stimulsoft.Designer.CreateReportArgs,
      callback: () => void,
    ) => {
      args.preventDefault = true;
      callback();
    },
    [],
  );

  if (built.report == null) return null;
  return (
    <Designer
      id={designerId}
      report={built.report}
      options={options}
      onSaveReport={handleSave}
      onSaveAsReport={handleSave}
      onPreviewReport={handlePreview}
      onOpenReport={handleBlockedReportAction}
      onCreateReport={handleBlockedReportAction}
    />
  );
}
