import { browserApiClient } from "./browser-client";
import type { RequestOptions } from "./client";
import type { ReportLetterheadOptions } from "@/types/letterhead-runtime";

/**
 * Letterhead options a report offers before «Generar reporte» (Backend #38,
 * `reports:run`): «Sin membrete» first, then the assigned active letterheads
 * resolved to their current version.
 */
export function getReportLetterheadOptions(code: string, options?: RequestOptions): Promise<ReportLetterheadOptions> {
  return browserApiClient.apiGet<ReportLetterheadOptions>(`/reports/${encodeURIComponent(code)}/letterheads`, options);
}
