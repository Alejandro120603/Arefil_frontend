import { apiGet, apiPostJson, apiUpload } from "./client";
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
