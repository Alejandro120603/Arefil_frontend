import { browserApiClient } from "./browser-client";
import { ApiError } from "./errors";
import type { ImportConfirmResult, ImportJob, ImportPreviewResponse } from "@/types/api";

export type PriceListImportSupplier = "DONALDSON" | "FLEETGUARD";

export const PRICE_LIST_IMPORT_SUPPLIER_LABELS: Record<PriceListImportSupplier, string> = {
  DONALDSON: "Donaldson",
  FLEETGUARD: "Fleetguard",
};

/**
 * The parsers' own wording when a workbook lacks the selected supplier's
 * structure (its sheet or its header row). Nothing else maps here: a corrupt
 * file, a size or extension problem or a row error keeps its own message.
 */
const SUPPLIER_FORMAT_ERRORS = [
  /^No se encontró la hoja requerida '/,
  /^No se reconoció el formato de encabezados en la hoja '/,
  /^No se reconocieron los encabezados de la hoja Fleetguard /,
];

export interface SupplierFormatError {
  message: string;
  /** The backend's own text, kept for diagnosis. */
  detail: string;
}

/**
 * A 422 from the preview that says the file does not have the selected
 * supplier's layout, reworded so the user checks the supplier or the file.
 * It never guesses which supplier the file belongs to.
 */
export function getSupplierFormatError(
  error: unknown,
  supplier: PriceListImportSupplier,
): SupplierFormatError | null {
  if (!(error instanceof ApiError) || error.status !== 422 || typeof error.detail !== "string") return null;
  const detail = error.detail;
  if (!SUPPLIER_FORMAT_ERRORS.some((pattern) => pattern.test(detail))) return null;
  const label = PRICE_LIST_IMPORT_SUPPLIER_LABELS[supplier];
  return {
    message: `El archivo no parece corresponder al formato ${label}. Verifica el proveedor seleccionado o el archivo que intentas importar.`,
    detail,
  };
}

export function previewPriceListImport(
  supplier: PriceListImportSupplier,
  file: File,
): Promise<ImportPreviewResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return browserApiClient.apiUpload<ImportPreviewResponse>(
    `/imports/${supplier.toLowerCase()}/preview`,
    formData,
  );
}

export function previewDonaldsonImport(file: File): Promise<ImportPreviewResponse> {
  return previewPriceListImport("DONALDSON", file);
}

export function getImportJob(importId: number): Promise<ImportJob> {
  return browserApiClient.apiGet<ImportJob>(`/imports/${importId}`);
}

export function confirmImport(importId: number): Promise<ImportConfirmResult> {
  return browserApiClient.apiPostJson<ImportConfirmResult>(`/imports/${importId}/confirm`);
}

/**
 * `POST /imports/{supplier}/preview` responds 409 with this shape when the
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
