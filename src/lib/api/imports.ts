import { apiGet, apiPostJson, apiUpload } from "./client";
import { ApiError } from "./errors";
import type { ImportConfirmResult, ImportJob, ImportPreviewResponse } from "@/types/api";

export function previewDonaldsonImport(file: File): Promise<ImportPreviewResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload<ImportPreviewResponse>("/imports/donaldson/preview", formData);
}

export function getImportJob(importId: number): Promise<ImportJob> {
  return apiGet<ImportJob>(`/imports/${importId}`);
}

export function confirmImport(importId: number): Promise<ImportConfirmResult> {
  return apiPostJson<ImportConfirmResult>(`/imports/${importId}/confirm`);
}

/**
 * `POST /imports/donaldson/preview` responds 409 with this shape when the
 * same file was already imported. `existing_import_id` points at the
 * ImportJob, not a PriceList — there is no endpoint to resolve one from the
 * other, so callers must not link/navigate to a PriceList from it.
 */
export interface DuplicateImportDetail {
  message: string;
  existing_import_id: number;
}

export function getDuplicateImportDetail(error: unknown): DuplicateImportDetail | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const detail = error.detail;
  if (
    detail &&
    typeof detail === "object" &&
    typeof (detail as Record<string, unknown>).existing_import_id === "number" &&
    typeof (detail as Record<string, unknown>).message === "string"
  ) {
    return detail as DuplicateImportDetail;
  }
  return null;
}
