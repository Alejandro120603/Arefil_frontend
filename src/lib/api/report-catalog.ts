import "server-only";

import { serverApiClient } from "./server-client";
import type { RequestOptions } from "./client";
import type { ReportDefinition } from "@/types/api";

function reportPath(code: string): string {
  return `/reports/${encodeURIComponent(code)}`;
}

export function listReportDefinitions(options?: RequestOptions): Promise<ReportDefinition[]> {
  return serverApiClient.apiGet<ReportDefinition[]>("/reports", options);
}

export function getReportDefinition(code: string, options?: RequestOptions): Promise<ReportDefinition> {
  return serverApiClient.apiGet<ReportDefinition>(reportPath(code), options);
}
