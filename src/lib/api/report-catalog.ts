import "server-only";

import { serverApiClient } from "./server-client";
import type { RequestOptions } from "./client";
import type { ReportAdminDefinition, ReportBuilderDefinition, ReportDefinition } from "@/types/api";

function reportPath(code: string): string {
  return `/reports/${encodeURIComponent(code)}`;
}

export function listReportDefinitions(options?: RequestOptions): Promise<ReportDefinition[]> {
  return serverApiClient.apiGet<ReportDefinition[]>("/reports", options);
}

export function getReportDefinition(code: string, options?: RequestOptions): Promise<ReportDefinition> {
  return serverApiClient.apiGet<ReportDefinition>(reportPath(code), options);
}

export function getAdminReportDefinition(code: string, options?: RequestOptions): Promise<ReportAdminDefinition> {
  return serverApiClient.apiGet<ReportAdminDefinition>(`/admin${reportPath(code)}`, options);
}

/**
 * The saved builder, read server-side so the runtime can label the summaries
 * the preview returns: the dataset answers `summary` keyed by key alone.
 */
export function getReportBuilderDefinition(
  code: string,
  options?: RequestOptions,
): Promise<ReportBuilderDefinition> {
  return serverApiClient.apiGet<ReportBuilderDefinition>(`${reportPath(code)}/builder`, options);
}
