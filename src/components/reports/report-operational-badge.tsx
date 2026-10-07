"use client";

import { CircleCheck, CircleDashed, CircleSlash, Loader2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useReportReadiness } from "@/hooks/use-report-readiness";
import { reportOperationalStatus, type ReportOperationalStatusKey } from "@/lib/reports/report-readiness";

const VARIANT = {
  success: "success",
  warning: "warning",
  destructive: "destructive",
  neutral: "secondary",
} as const;

const ICON: Record<ReportOperationalStatusKey, typeof CircleCheck> = {
  "enabled-ready": CircleCheck,
  "enabled-attention": TriangleAlert,
  "ready-to-enable": CircleDashed,
  pending: CircleSlash,
  "enabled-unknown": CircleDashed,
  unknown: CircleDashed,
  loading: Loader2,
};

/**
 * Admin catalog status (Frontend #44): the persisted `enabled` intent combined
 * with the backend's computed readiness for this one report. A readiness that
 * cannot be read is shown as unknown — never as "not ready".
 */
export function ReportOperationalBadge({ code, enabled }: { code: string; enabled: boolean }) {
  const readiness = useReportReadiness(code);
  const status = reportOperationalStatus(
    enabled,
    readiness.readiness,
    readiness.status === "ready" ? "ready" : readiness.status === "error" ? "error" : "loading",
  );
  const Icon = ICON[status.key];
  const blockers = readiness.readiness?.issues.filter((issue) => issue.severity === "blocker") ?? [];
  return (
    <Badge
      variant={VARIANT[status.tone]}
      className="gap-1"
      title={blockers.length > 0 ? blockers.map((issue) => issue.message).join("\n") : undefined}
      data-status={status.key}
    >
      <Icon aria-hidden className={status.key === "loading" ? "animate-spin" : undefined} />
      {status.label}
    </Badge>
  );
}
