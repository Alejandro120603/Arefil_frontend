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
  ReportDataSource,
  ReportOption,
  ReportPreviewResponse,
  ReportProductOption,
  ReportDocumentFormat,
  ReportTemplate,
  ReportTemplateWriteRequest,
  ReportUpdateRequest,
  Page,
} from "@/types/api";
import type { BlobDownload } from "./client";

function reportPath(code: string, suffix = ""): string {
  return `/reports/${encodeURIComponent(code)}${suffix}`;
}

export function createReport(request: ReportCreateRequest, options?: RequestOptions): Promise<ReportDefinition> {
  return browserApiClient.apiPostJson<ReportDefinition>("/reports", request, options);
}

export function listReportDataSources(options?: RequestOptions): Promise<ReportDataSource[]> {
  return browserApiClient.apiGet<ReportDataSource[]>("/report-data-sources", options);
}

export function getReportDataSource(code: string, options?: RequestOptions): Promise<ReportDataSource> {
  return browserApiClient.apiGet<ReportDataSource>(
    `/report-data-sources/${encodeURIComponent(code)}`,
    options,
  );
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

export type ReportOptionsContext = Record<string, string | number | boolean | undefined>;

export interface ReportOptionsQuery {
  /** Server-side incremental search (part number, item number, id, description). */
  search?: string;
  page?: number;
  page_size?: number;
}

/** The backend caps `page_size` at 100 (`schemas/pagination.py::MAX_PAGE_SIZE`). */
const MAX_OPTIONS_PAGE_SIZE = 100;
/** Safety valve so a mis-reported `total_pages` can never spin a walk forever. */
const MAX_OPTIONS_PAGES = 20;
/** Never show more than one screenful of suggestions per keystroke. */
export const PRODUCT_SEARCH_PAGE_SIZE = 20;

/**
 * One page of options for a parameter (Backend #21). The endpoint is paginated
 * precisely so no caller ever pulls a whole catalog: reach for
 * `searchReportProductOptions` when the user is typing, and only use
 * `listAllReportParameterOptions` for the small bounded sources (price lists,
 * suppliers) a plain `<select>` is still the right control for.
 */
export function getReportParameterOptions(
  code: string,
  parameterName: string,
  context?: ReportOptionsContext,
  options?: RequestOptions & { query?: ReportOptionsQuery },
): Promise<Page<ReportOption>> {
  return browserApiClient.apiGet<Page<ReportOption>>(
    reportPath(code, `/parameters/${encodeURIComponent(parameterName)}/options`),
    { ...options, query: { ...options?.query, ...context } },
  );
}

/** Every option of a bounded source, for the scalar `<select>` controls. */
export async function listAllReportParameterOptions(
  code: string,
  parameterName: string,
  context?: ReportOptionsContext,
  options?: RequestOptions,
): Promise<ReportOption[]> {
  const first = await getReportParameterOptions(code, parameterName, context, {
    ...options,
    query: { page: 1, page_size: MAX_OPTIONS_PAGE_SIZE },
  });
  const items = [...first.items];
  const lastPage = Math.min(first.meta.total_pages, MAX_OPTIONS_PAGES);
  for (let page = 2; page <= lastPage; page += 1) {
    const next = await getReportParameterOptions(code, parameterName, context, {
      ...options,
      query: { page, page_size: MAX_OPTIONS_PAGE_SIZE },
    });
    items.push(...next.items);
  }
  return items;
}

/**
 * Incremental product search inside one price list. Each hit already carries
 * part number, description and unit price, so selecting a line item needs no
 * follow-up request.
 */
export async function searchReportProductOptions(
  code: string,
  parameterName: string,
  context: ReportOptionsContext,
  search: string,
  options?: RequestOptions,
): Promise<ReportProductOption[]> {
  const page = await getReportParameterOptions(code, parameterName, context, {
    ...options,
    query: { search: search.trim() || undefined, page: 1, page_size: PRODUCT_SEARCH_PAGE_SIZE },
  });
  return page.items.filter(isReportProductOption);
}

/**
 * Re-resolves an already selected product against a (possibly different) price
 * list. Answers `null` when the product is not in that list, which is how the
 * quotation table drops incompatible lines after the list changes.
 */
export async function resolveReportProductOption(
  code: string,
  parameterName: string,
  context: ReportOptionsContext,
  productId: number,
  options?: RequestOptions,
): Promise<ReportProductOption | null> {
  const items = await searchReportProductOptions(code, parameterName, context, String(productId), options);
  return items.find((item) => item.product_id === productId) ?? null;
}

function isReportProductOption(option: ReportOption): option is ReportProductOption {
  return typeof (option as ReportProductOption).product_id === "number";
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
export function getReportFieldCatalog(code: string, options?: RequestOptions): Promise<ReportFieldDescriptor[]> {
  return browserApiClient.apiGet<ReportFieldDescriptor[]>(reportPath(code, "/builder/fields"), options);
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

/**
 * Document layer — Backend #22.
 *
 * The template is administrative (one active template per report); the render
 * endpoints are runtime and take the exact parameter map of an execution the
 * user already validated on screen.
 */

function templatePath(code: string): string {
  return `/admin${reportPath(code, "/template")}`;
}

/** Rejects with a 404 `ApiError` when the report has no active template. */
export function getReportTemplate(code: string, options?: RequestOptions): Promise<ReportTemplate> {
  return browserApiClient.apiGet<ReportTemplate>(templatePath(code), options);
}

/** Creates or replaces the active template in one write, like the builder. */
export function saveReportTemplate(
  code: string,
  request: ReportTemplateWriteRequest,
  options?: RequestOptions,
): Promise<ReportTemplate> {
  return browserApiClient.apiPutJson<ReportTemplate>(templatePath(code), request, options);
}

/** Deactivates/removes the active template; the report keeps running without it. */
export function deleteReportTemplate(code: string, options?: RequestOptions): Promise<void> {
  return browserApiClient.apiDelete<void>(templatePath(code), options);
}

/**
 * Renders the document for one execution. The body is the same parameter map
 * `executeReport` ran with, so the file can never disagree with the preview the
 * user approved.
 */
export function downloadReportDocument(
  code: string,
  format: ReportDocumentFormat,
  parameters: Record<string, unknown>,
  options?: RequestOptions,
): Promise<BlobDownload> {
  return browserApiClient.apiPostBlob(reportPath(code, `/document/${format}`), parameters, options);
}
