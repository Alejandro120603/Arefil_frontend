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
  SQLReportExecutionResponse,
  ReportUpdateRequest,
  PriceListComparisonRequest,
  PriceListComparisonResponse,
  ReportTemplateVersion,
} from "@/types/api";
import type { BlobDownload } from "./client";
import { PRICE_LIST_COMPARISON_CODE } from "@/lib/reports/report-constants";

export { PRICE_LIST_COMPARISON_CODE };
export const PRICE_LIST_COMPARISON_PATH = `/reports/${PRICE_LIST_COMPARISON_CODE}/data`;

function reportPath(code: string, suffix = ""): string {
  return `/reports/${encodeURIComponent(code)}${suffix}`;
}

/**
 * A == B is rejected by the backend with a 422 whose message is written for
 * developers, so the UI blocks the request before it leaves the browser and
 * this guard exists only as the last line of defence for direct callers.
 */
export const SAME_PRICE_LIST_MESSAGE = "Selecciona dos listas distintas.";

export class SamePriceListError extends Error {
  constructor() {
    super(SAME_PRICE_LIST_MESSAGE);
    this.name = "SamePriceListError";
  }
}

/**
 * Runs on the browser through the same-origin `/backend-api/*` proxy - the
 * internal Docker hostname is never resolved client side (see `browser-client`).
 */
export function getPriceListComparison(
  request: PriceListComparisonRequest,
  options?: RequestOptions,
): Promise<PriceListComparisonResponse> {
  if (request.price_list_a_id === request.price_list_b_id) {
    return Promise.reject(new SamePriceListError());
  }
  return browserApiClient.apiPostJson<PriceListComparisonResponse>(PRICE_LIST_COMPARISON_PATH, request, options);
}

export function getReportTemplate(code: string, options?: RequestOptions): Promise<string> {
  return browserApiClient.apiGetText(reportPath(code, "/template"), options);
}

export function saveReportTemplate(
  code: string,
  template: string,
  options?: RequestOptions,
): Promise<ReportTemplateVersion> {
  return browserApiClient.apiPutText<ReportTemplateVersion>(reportPath(code, "/template"), template, options);
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

/** Executes any enabled report through Report Engine v2's generic endpoint. */
export function executeReport<T = SQLReportExecutionResponse>(
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
 * These four calls are all the new builder needs; none of them touches
 * Stimulsoft. Formula parsing, field allow-listing and cycle detection stay on
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
