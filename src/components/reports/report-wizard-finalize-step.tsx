"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, CircleAlert, CircleX, Loader2, RefreshCw } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReportReadinessState } from "@/hooks/use-report-readiness";
import { updateReport } from "@/lib/api/reports";
import {
  readinessSections,
  reportOperationalStatus,
  type ReadinessSection,
} from "@/lib/reports/report-readiness";
import { reportSaveFailure } from "@/lib/reports/report-save-errors";
import type { ReportWizardStepId } from "@/lib/reports/report-wizard";
import type { ReportAdminDefinition } from "@/types/api";

const STATUS_BADGE = {
  success: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  warning: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  destructive: "border-destructive/40 text-destructive",
  neutral: "",
} as const;

/**
 * Step 7 — Finalizar (Frontend #33, rebuilt on Backend #38 in #44). The
 * backend's readiness is the only authority on whether the report can be
 * enabled: this screen groups its issues by section, links each to the step
 * that fixes it, and enables or disables the report with the existing PATCH.
 * It never evaluates the configuration itself.
 */
export function ReportWizardFinalizeStep({
  report,
  readiness,
  onReportChange,
  onGoTo,
}: {
  report: ReportAdminDefinition;
  /** The wizard's readiness (`useReportReadiness`), requested while this step is visible. */
  readiness: ReportReadinessState;
  onReportChange: (report: ReportAdminDefinition) => void;
  onGoTo?: (step: ReportWizardStepId) => void;
}) {
  const [saving, setSaving] = useState<"enable" | "disable" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const answer = readiness.status === "ready" ? readiness.readiness : null;
  const status = reportOperationalStatus(
    report.enabled,
    answer,
    readiness.status === "ready" ? "ready" : readiness.status === "error" ? "error" : "loading",
  );

  async function setEnabled(enabled: boolean) {
    if (saving) return;
    setSaving(enabled ? "enable" : "disable");
    setActionError(null);
    try {
      // Only `enabled` travels: a disable must work even when the rest of the
      // definition has degraded (e.g. its source was disabled meanwhile).
      onReportChange(await updateReport(report.code, { enabled }));
    } catch (error) {
      const failure = reportSaveFailure(
        error,
        enabled ? "No se pudo habilitar el reporte." : "No se pudo deshabilitar el reporte.",
      );
      // A REPORT_NOT_READY carries the backend's evaluation of the same
      // transaction: it becomes the shown readiness, `report.enabled` untouched.
      if (failure.kind === "not-ready") readiness.adoptNotReady(failure.issues);
      setActionError(failure.message);
    } finally {
      setSaving(null);
    }
  }

  const canEnable = !report.enabled && answer?.ready === true;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">Estado del reporte</h3>
        <Badge variant="outline" className={STATUS_BADGE[status.tone]}>{status.label}</Badge>
      </div>

      {readiness.status === "loading" && (
        <div className="flex flex-col gap-2" aria-label="Comprobando estado">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {readiness.status === "error" && (
        <Alert variant="destructive">
          <AlertTitle>No se pudo comprobar si el reporte está listo.</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>{readiness.error}</span>
            <Button type="button" size="sm" variant="outline" onClick={readiness.reload}>
              <RefreshCw /> Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {answer != null && (
        <>
          <ul className="flex flex-col gap-3">
            {readinessSections(answer).map((section) => (
              <ReadinessSectionItem key={section.step ?? "other"} section={section} onGoTo={onGoTo} />
            ))}
          </ul>
          <div>
            <Button type="button" variant="ghost" size="sm" onClick={readiness.reload}>
              <RefreshCw /> Actualizar estado
            </Button>
          </div>
        </>
      )}

      {actionError && (
        <ErrorAlert
          title={report.enabled ? "No se pudo deshabilitar el reporte" : "No se pudo habilitar el reporte"}
          message={actionError}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        {report.enabled ? (
          <>
            {/* Never gated by readiness: a broken report must be switchable off. */}
            <Button type="button" variant="outline" disabled={saving != null} onClick={() => void setEnabled(false)}>
              {saving === "disable" && <Loader2 className="animate-spin" />}
              {saving === "disable" ? "Deshabilitando..." : "Deshabilitar reporte"}
            </Button>
            <Button type="button" nativeButton={false} render={<Link href="/administracion/reportes" />}>
              Guardar y finalizar
            </Button>
          </>
        ) : (
          <Button type="button" disabled={!canEnable || saving != null} onClick={() => void setEnabled(true)}>
            {saving === "enable" && <Loader2 className="animate-spin" />}
            {saving === "enable" ? "Habilitando..." : "Habilitar reporte"}
          </Button>
        )}
        {!report.enabled && answer != null && !answer.ready && (
          <p className="text-sm text-muted-foreground">Resuelve los pendientes marcados para poder habilitarlo.</p>
        )}
      </div>
    </div>
  );
}

function ReadinessSectionItem({
  section,
  onGoTo,
}: {
  section: ReadinessSection;
  onGoTo?: (step: ReportWizardStepId) => void;
}) {
  const Icon = section.severity === "blocker" ? CircleX : section.severity === "warning" ? CircleAlert : Check;
  const tone = section.severity === "blocker"
    ? "text-destructive"
    : section.severity === "warning"
      ? "text-amber-600 dark:text-amber-400"
      : "text-emerald-600 dark:text-emerald-400";
  const destination = section.destination;
  return (
    <li className="flex items-start gap-2 text-sm" data-severity={section.severity ?? "ok"}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <p className="font-medium">
          {section.title}
          {section.severity === "blocker" && <span className="sr-only"> — pendiente</span>}
          {section.severity === "warning" && <span className="sr-only"> — advertencia</span>}
        </p>
        {section.issues.map((issue) => (
          <p key={`${issue.code}:${issue.message}`} className={issue.severity === "blocker" ? "text-destructive" : "text-muted-foreground"}>
            {issue.message}
          </p>
        ))}
        {section.severity != null && destination != null && onGoTo && (
          <div>
            <Button type="button" size="sm" variant="outline" onClick={() => onGoTo(destination)}>
              Ir a {section.title}
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}
