import { browserApiClient } from "./browser-client";
import type { RequestOptions } from "./client";
import type {
  ReportAdminDefinition,
  ReportBuilderDefinition,
  ReportBuilderPreviewResponse,
  ReportBuilderWriteRequest,
  ReportFieldDescriptor,
  ReportCreateRequest,
  ReportDefinition,
  ReportOption,
  ReportPreviewResponse,
  ReportUpdateRequest,
} from "@/types/api";
import type { BlobDownload } from "./client";

function reportPath(code: string, suffix = ""): string {
  return `/reports/${encodeURIComponent(code)}${suffix}`;
}

export function createReport(request: ReportCreateRequest, options?: RequestOptions): Promise<ReportDefinition> {
  return browserApiClient.apiPostJson<ReportDefinition>("/reports", request, options);
}

export function updateReport(
  code: string,
  request: ReportUpdateRequest,
  options?: RequestOptions,
): Promise<ReportDefinition> {
  return browserApiClient.apiPatchJson<ReportDefinition>(reportPath(code), request, options);
}

export function getAdminReport(code: string, options?: RequestOptions): Promise<ReportAdminDefinition> {
  return browserApiClient.apiGet<ReportAdminDefinition>(`/admin${reportPath(code)}`, options);
}

export function previewReport(
  code: string,
  parameters: Record<string, unknown>,
  options?: RequestOptions,
): Promise<ReportPreviewResponse> {
  return browserApiClient.apiPostJson<ReportPreviewResponse>(reportPath(code, "/preview"), parameters, options);
}

/** Executes any enabled report; callers must narrow the response before rendering it. */
export function executeReport<T = unknown>(
  code: string,
  parameters: Record<string, unknown>,
  options?: RequestOptions,
): Promise<T> {
  return browserApiClient.apiPostJson<T>(reportPath(code, "/data"), parameters, options);
}

export function getReportParameterOptions(
  code: string,
  parameterName: string,
  context?: Record<string, string | number | boolean | undefined>,
  options?: RequestOptions,
): Promise<ReportOption[]> {
  return browserApiClient.apiGet<ReportOption[]>(
    reportPath(code, `/parameters/${encodeURIComponent(parameterName)}/options`),
    { ...options, query: { ...options?.query, ...context } },
  );
}

export function downloadReportData(
  code: string,
  format: "csv" | "xlsx",
  parameters: Record<string, unknown>,
  options?: RequestOptions,
): Promise<BlobDownload> {
  return browserApiClient.apiPostBlob(reportPath(code, `/export/${format}`), parameters, options);
}

/**
 * Report Builder — Backend #12.
 *
 * These four calls are all the builder needs. Formula parsing, field
 * allow-listing and cycle detection stay on
 * the backend, so the UI's job is to send valid references and surface the
 * backend's own message when it refuses.
 */

/** Allow-listed business fields a FIELD column may bind to. */
export function getReportFieldCatalog(options?: RequestOptions): Promise<ReportFieldDescriptor[]> {
  return browserApiClient.apiGet<ReportFieldDescriptor[]>("/report-builder/fields", options);
}

export function getReportBuilder(code: string, options?: RequestOptions): Promise<ReportBuilderDefinition> {
  return browserApiClient.apiGet<ReportBuilderDefinition>(reportPath(code, "/builder"), options);
}

/**
 * Columns and layout are replaced together in a single transactional PUT -
 * never save a builder column by column, a partial write would leave totals
 * pointing at columns that no longer exist.
 */
export function saveReportBuilder(
  code: string,
  request: ReportBuilderWriteRequest,
  options?: RequestOptions,
): Promise<ReportBuilderDefinition> {
  return browserApiClient.apiPutJson<ReportBuilderDefinition>(reportPath(code, "/builder"), request, options);
}

/**
 * Renders the saved builder against real data. The request body is the bare
 * parameter map (FastAPI declares it as the whole body), not a wrapper object.
 */
export function previewReportBuilder(
  code: string,
  parameters: Record<string, unknown>,
  options?: RequestOptions,
): Promise<ReportBuilderPreviewResponse> {
  return browserApiClient.apiPostJson<ReportBuilderPreviewResponse>(
    reportPath(code, "/builder/preview"),
    parameters,
    options,
  );
}
