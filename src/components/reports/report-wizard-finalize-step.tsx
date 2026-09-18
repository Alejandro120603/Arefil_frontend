"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Circle, Loader2, RefreshCw } from "lucide-react";
import { ErrorAlert } from "@/components/donaldson/error-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { getReportBuilder, getReportExcelTemplate, inspectReportExcelTemplate, updateReport } from "@/lib/api/reports";
import { reportFormFromDefinition, toReportUpdate } from "@/lib/reports/report-form";
import { buildReportWizardChecklist, reportWizardChecklistComplete } from "@/lib/reports/report-wizard";
import type {
  ReportAdminDefinition,
  ReportBuilderDefinition,
  ReportExcelTemplate,
  ReportExcelTemplateInspection,
} from "@/types/api";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; builder: ReportBuilderDefinition; template: ReportExcelTemplate | null; inspection: ReportExcelTemplateInspection | null };

/**
 * Step 7 — Finalizar (Frontend #33). Never trusts "the user visited this
 * screen" as a completion signal: every checklist item but the preview one
 * (a session fact the backend never persists) is read fresh here, every time
 * this step mounts or the admin asks to refresh it.
 */
export function ReportWizardFinalizeStep({
  report,
  previewGeneratedThisSession,
  onReportChange,
}: {
  report: ReportAdminDefinition;
  previewGeneratedThisSession: boolean;
  onReportChange: (report: ReportAdminDefinition) => void;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [refreshToken, setRefreshToken] = useState(0);
  const [enabling, setEnabling] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) =>
      getReportBuilder(report.code, { signal })
        .then(async (builder) => {
          const template = await getReportExcelTemplate(report.code, { signal }).catch((error: unknown) => {
            if (error instanceof ApiError && error.status === 404) return null;
            throw error;
          });
          if (signal?.aborted) return;
          const inspection = template
            ? await inspectReportExcelTemplate(report.code, { signal }).catch(() => null)
            : null;
          if (signal?.aborted) return;
          setState({ status: "ready", builder, template, inspection });
        })
        .catch((error: unknown) => {
          if (signal?.aborted) return;
          setState({ status: "error", message: getUserErrorMessage(error, "No se pudo calcular el estado del reporte.") });
        }),
    [report.code],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refreshToken]);

  function handleRefresh() {
    setState({ status: "loading" });
    setRefreshToken((token) => token + 1);
  }

  async function handleEnable() {
    if (enabling || report.enabled) return;
    setEnabling(true);
    setEnableError(null);
    try {
      const updated = await updateReport(report.code, toReportUpdate({ ...reportFormFromDefinition(report), enabled: true }));
      onReportChange(updated);
    } catch (error) {
      setEnableError(getUserErrorMessage(error, "No se pudo habilitar el reporte."));
    } finally {
      setEnabling(false);
    }
  }

  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col gap-3">
        <ErrorAlert title="No se pudo cargar el estado del reporte" message={state.message} />
        <div>
          <Button type="button" variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw /> Reintentar
          </Button>
        </div>
      </div>
    );
  }

  const checklist = buildReportWizardChecklist({
    report,
    builder: state.builder,
    template: state.template,
    inspection: state.inspection,
    previewGeneratedThisSession,
  });
  const ready = reportWizardChecklistComplete(checklist);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Este es el estado real del reporte, verificado contra el backend en este momento — no una puntuación.
      </p>
      <ul className="flex flex-col gap-2">
        {checklist.map((item) => (
          <li key={item.key} className="flex items-center gap-2 text-sm">
            {item.done ? (
              <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span className={item.done ? "" : "text-muted-foreground"}>{item.label}</span>
            {!item.done && <Badge variant="outline">Pendiente</Badge>}
          </li>
        ))}
      </ul>

      <div>
        <Button type="button" variant="ghost" size="sm" onClick={handleRefresh}>
          <RefreshCw /> Actualizar estado
        </Button>
      </div>

      {!ready && !report.enabled && (
        <p className="text-sm text-muted-foreground">
          Puedes habilitar el reporte con pendientes: seguirá funcionando para lo que ya esté configurado.
        </p>
      )}
      {enableError && <ErrorAlert title="No se pudo habilitar el reporte" message={enableError} />}

      <div className="flex flex-wrap items-center gap-3">
        {report.enabled ? (
          <>
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
              Reporte habilitado
            </Badge>
            <Button type="button" nativeButton={false} render={<Link href="/administracion/reportes" />}>
              Guardar y finalizar
            </Button>
          </>
        ) : (
          <Button type="button" disabled={enabling} onClick={() => void handleEnable()}>
            {enabling && <Loader2 className="animate-spin" />} {enabling ? "Habilitando..." : "Habilitar reporte"}
          </Button>
        )}
      </div>
    </div>
  );
}
