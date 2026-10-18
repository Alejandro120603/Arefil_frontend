import { browserApiClient } from "./browser-client";
import type { BlobDownload, RequestOptions } from "./client";
import type {
  LetterheadAdmin,
  LetterheadUpdateRequest,
  LetterheadVersion,
  LetterheadVersionUpload,
  ReportLetterheadAssignments,
  ReportLetterheadAssignmentsWrite,
} from "@/types/letterhead-admin";

/**
 * Letterhead catalog administration (Backend #38, `reports:admin`).
 *
 * Uploads are multipart `FormData`: the browser writes the multipart
 * Content-Type with its own boundary (and the Content-Length the backend
 * requires). The workbook is never parsed here — the backend runs the whole
 * OOXML preflight — and its bytes are never stored on the client.
 */

function letterheadPath(id: number, suffix = ""): string {
  return `/admin/letterheads/${encodeURIComponent(String(id))}${suffix}`;
}

function versionPath(id: number, version: number, suffix = ""): string {
  return letterheadPath(id, `/versions/${encodeURIComponent(String(version))}${suffix}`);
}

function reportAssignmentsPath(code: string): string {
  return `/admin/reports/${encodeURIComponent(code)}/letterheads`;
}

/** Inactive letterheads included. */
export function listLetterheads(options?: RequestOptions): Promise<LetterheadAdmin[]> {
  return browserApiClient.apiGet<LetterheadAdmin[]>("/admin/letterheads", options);
}

export function getLetterhead(id: number, options?: RequestOptions): Promise<LetterheadAdmin> {
  return browserApiClient.apiGet<LetterheadAdmin>(letterheadPath(id), options);
}

/** Identity and version 1 in one transaction. A taken slug answers `409`. */
export function createLetterhead(
  request: { slug: string; display_name: string; file: File },
  options?: RequestOptions,
): Promise<LetterheadAdmin> {
  const body = new FormData();
  body.append("slug", request.slug);
  body.append("display_name", request.display_name);
  body.append("file", request.file, request.file.name);
  return browserApiClient.apiUpload<LetterheadAdmin>("/admin/letterheads", body, options);
}

export function updateLetterhead(
  id: number,
  request: LetterheadUpdateRequest,
  options?: RequestOptions,
): Promise<LetterheadAdmin> {
  return browserApiClient.apiPatchJson<LetterheadAdmin>(letterheadPath(id), request, options);
}

/** Newest first; history is immutable. */
export function listLetterheadVersions(id: number, options?: RequestOptions): Promise<LetterheadVersion[]> {
  return browserApiClient.apiGet<LetterheadVersion[]>(letterheadPath(id, "/versions"), options);
}

/**
 * A new version, never an overwrite. `expectedLatestVersion` is the current
 * version this screen showed (`0` = none): if someone else uploaded in
 * between, the backend answers `409` and stores nothing. An identical file
 * answers `created: false`.
 */
export function uploadLetterheadVersion(
  id: number,
  file: File,
  expectedLatestVersion: number,
  options?: RequestOptions,
): Promise<LetterheadVersionUpload> {
  const body = new FormData();
  body.append("expected_latest_version", String(expectedLatestVersion));
  body.append("file", file, file.name);
  return browserApiClient.apiUpload<LetterheadVersionUpload>(letterheadPath(id, "/versions"), body, options);
}

export function downloadLetterheadSource(id: number, version: number, options?: RequestOptions): Promise<BlobDownload> {
  return browserApiClient.apiDownloadBlob(versionPath(id, version, "/source"), options);
}

/** Path of any version's thumbnail (inactive and historical included), for `LetterheadThumbnail`. */
export function letterheadVersionThumbnailPath(id: number, version: number): string {
  return versionPath(id, version, "/thumbnail");
}

export function getReportLetterheadAssignments(
  code: string,
  options?: RequestOptions,
): Promise<ReportLetterheadAssignments> {
  return browserApiClient.apiGet<ReportLetterheadAssignments>(reportAssignmentsPath(code), options);
}

/** Replaces assignments, order and default in one write (`409` on a stale `expected_revision`). */
export function replaceReportLetterheadAssignments(
  code: string,
  request: ReportLetterheadAssignmentsWrite,
  options?: RequestOptions,
): Promise<ReportLetterheadAssignments> {
  return browserApiClient.apiPutJson<ReportLetterheadAssignments>(reportAssignmentsPath(code), request, options);
}
