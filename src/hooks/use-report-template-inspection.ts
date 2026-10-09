"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, getUserErrorMessage } from "@/lib/api/errors";
import { inspectReportExcelTemplate } from "@/lib/api/reports";
import {
  templatePlaceholderDependencies,
  type TemplateDependencies,
} from "@/lib/reports/report-template-dependencies";
import type { ReportExcelTemplate, ReportExcelTemplateInspection } from "@/types/api";

/**
 * Which active template the inspection must describe:
 * - a template's metadata — inspect exactly that `version`/`checksum`, once;
 * - `null` — there is no active template: nothing to inspect, no request;
 * - `"pending"` — the caller does not know yet (the wizard waits for the
 *   template card's first answer instead of racing it);
 * - `"discover"` — standalone surfaces with no metadata: inspect once per code.
 */
export type ActiveTemplateTarget = Pick<ReportExcelTemplate, "version" | "checksum"> | null | "pending" | "discover";

export type ReportTemplateInspectionStatus = "idle" | "loading" | "ready" | "none" | "limits" | "error";

export interface ReportTemplateInspection {
  status: ReportTemplateInspectionStatus;
  /** The inspected workbook; `null` unless `status === "ready"`. */
  inspection: ReportExcelTemplateInspection | null;
  /** The backend's message for `limits`/`error`. */
  error: string | null;
  templateVersion: number | null;
  templateChecksum: string | null;
  /** What the active template uses — empty without a ready inspection. */
  dependencies: TemplateDependencies;
  /** Inspects again now, whatever the cached version. */
  reload: () => void;
  /** Adopts an inspection the backend already returned (the mappings save response), with no extra GET. */
  replace: (inspection: ReportExcelTemplateInspection) => void;
}

interface LoadedState {
  code: string;
  /** The `reload()` generation this result satisfies. */
  generation: number;
  /** The target this result answered (`"discover"` or a `version:checksum`). */
  answered: string;
  status: "ready" | "none" | "limits" | "error";
  inspection: ReportExcelTemplateInspection | null;
  error: string | null;
}

function targetKey(target: Pick<ReportExcelTemplate, "version" | "checksum">): string {
  return `${target.version}:${target.checksum}`;
}

export function useReportTemplateInspection(code: string | null, target: ActiveTemplateTarget): ReportTemplateInspection {
  const [state, setState] = useState<LoadedState | null>(null);
  const [generation, setGeneration] = useState(0);

  const wanted = code == null || target === null || target === "pending"
    ? null
    : target === "discover" ? "discover" : targetKey(target);
  const current = state != null && state.code === code ? state : null;
  // A result answers the target it was requested for — even when the server
  // was already one version ahead — or any target its own version matches
  // (an inspection adopted from a mappings response).
  const satisfied = current != null
    && current.generation === generation
    && (current.answered === wanted
      || (current.inspection != null && targetKey(current.inspection.template) === wanted));

  useEffect(() => {
    if (code == null || wanted == null || satisfied) return;
    const controller = new AbortController();
    const settle = (result: Omit<LoadedState, "code" | "generation" | "answered">) => {
      if (!controller.signal.aborted) setState({ code, generation, answered: wanted, ...result });
    };
    inspectReportExcelTemplate(code, { signal: controller.signal })
      .then((inspection) => settle({ status: "ready", inspection, error: null }))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) {
          settle({ status: "none", inspection: null, error: null });
        } else if (error instanceof ApiError && error.status === 422) {
          settle({ status: "limits", inspection: null, error: error.message });
        } else {
          settle({ status: "error", inspection: null, error: getUserErrorMessage(error, "No se pudo inspeccionar la plantilla Excel.") });
        }
      });
    return () => controller.abort();
  }, [code, wanted, generation, satisfied]);

  const reload = useCallback(() => setGeneration((value) => value + 1), []);
  const replace = useCallback((inspection: ReportExcelTemplateInspection) => {
    if (code == null) return;
    // It answers the current target too: the caller's metadata may still
    // name the previous version until its own refresh lands.
    setState({ code, generation, answered: wanted ?? targetKey(inspection.template), status: "ready", inspection, error: null });
  }, [code, generation, wanted]);

  let status: ReportTemplateInspectionStatus;
  if (code == null) status = "idle";
  else if (target === null) status = "none";
  else if (!satisfied || current == null) status = "loading";
  else status = current.status;

  const inspection = status === "ready" ? current?.inspection ?? null : null;
  const dependencies = useMemo(() => templatePlaceholderDependencies(inspection), [inspection]);

  return {
    status,
    inspection,
    error: status === "limits" || status === "error" ? current?.error ?? null : null,
    templateVersion: inspection?.template.version ?? null,
    templateChecksum: inspection?.template.checksum ?? null,
    dependencies,
    reload,
    replace,
  };
}
