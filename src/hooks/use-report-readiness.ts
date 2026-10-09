"use client";

import { useCallback, useEffect, useState } from "react";
import { getUserErrorMessage } from "@/lib/api/errors";
import { getReportReadiness } from "@/lib/api/reports";
import type { ReportReadiness, ReportReadinessIssue } from "@/types/api";

export type ReportReadinessStatus = "idle" | "loading" | "ready" | "error";

export interface ReportReadinessState {
  status: ReportReadinessStatus;
  /** The backend's answer for the current revision; `null` unless `status === "ready"`. */
  readiness: ReportReadiness | null;
  error: string | null;
  /** Asks the backend again now. */
  reload: () => void;
  /**
   * Adopts the issues of a `REPORT_NOT_READY` the backend just answered. That
   * 422 carries the complete evaluation of the same transaction, so it
   * replaces the held answer without another request.
   */
  adoptNotReady: (issues: ReportReadinessIssue[]) => void;
}

interface Loaded {
  code: string;
  revision: number;
  generation: number;
  readiness: ReportReadiness | null;
  error: string | null;
}

/**
 * Backend readiness of one report (Frontend #44; Backend #38 is the
 * authority). It is requested only while `active` and only when the answer it
 * holds belongs to an older `revision` — callers bump the revision after any
 * save that can change readiness (inputs, builder, template, mappings), so a
 * stale answer is never shown as current, and nothing is fetched for screens
 * that are not looking at it.
 */
export function useReportReadiness(
  code: string | null,
  { active = true, revision = 0 }: { active?: boolean; revision?: number } = {},
): ReportReadinessState {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [generation, setGeneration] = useState(0);

  const current = loaded != null && loaded.code === code && loaded.revision === revision && loaded.generation === generation
    ? loaded
    : null;

  useEffect(() => {
    if (code == null || !active || current != null) return;
    const controller = new AbortController();
    getReportReadiness(code, { signal: controller.signal })
      .then((readiness) => {
        if (!controller.signal.aborted) setLoaded({ code, revision, generation, readiness, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoaded({
          code,
          revision,
          generation,
          readiness: null,
          error: getUserErrorMessage(error, "No se pudo comprobar si el reporte está listo."),
        });
      });
    return () => controller.abort();
  }, [code, active, revision, generation, current]);

  const reload = useCallback(() => setGeneration((value) => value + 1), []);
  const adoptNotReady = useCallback((issues: ReportReadinessIssue[]) => {
    setLoaded((previous) => {
      if (previous?.readiness == null || previous.code !== code) return previous;
      return { ...previous, readiness: { ...previous.readiness, ready: false, issues } };
    });
  }, [code]);

  let status: ReportReadinessStatus = "idle";
  if (code != null) status = current == null ? "loading" : current.readiness != null ? "ready" : "error";

  return {
    status,
    readiness: status === "ready" ? current?.readiness ?? null : null,
    error: status === "error" ? current?.error ?? null : null,
    reload,
    adoptNotReady,
  };
}
