/**
 * FastAPI's `detail` field is not stable in shape: plain validation failures
 * (422) send an array of `{loc, msg, type}`, hand-raised HTTPExceptions send
 * either a string or an arbitrary object (see `imports.py`'s 409 response).
 * `ApiError.message` normalizes all three into a single human-readable string
 * so callers never have to branch on `detail`'s type themselves.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: unknown;

  constructor(status: number, detail: unknown) {
    super(formatDetail(detail));
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

interface ValidationErrorItem {
  type?: string;
  loc?: (string | number)[];
  msg?: string;
  message?: string;
  input?: unknown;
}

const GENERIC_ERROR_MESSAGE = "Error inesperado del servidor.";

function formatDetail(detail: unknown): string {
  if (detail == null) return "Error de comunicación con el servidor.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map(formatValidationItem).filter((item) => item.length > 0);
    return messages.length > 0 ? messages.join(" ") : "Error de validación.";
  }
  if (typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    if (typeof record.message === "string") return record.message;
    // Unrecognized object shape - never fall back to JSON.stringify here, a
    // raw payload dump is exactly what users must never see.
    return GENERIC_ERROR_MESSAGE;
  }
  return GENERIC_ERROR_MESSAGE;
}

export function getErrorMessage(error: unknown, fallback = "No se pudo comunicar con el backend."): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function formatValidationItem(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const validation = item as ValidationErrorItem;
    const field = validation.loc?.filter((part) => part !== "body").join(".");
    const message = validation.msg ?? validation.message;
    if (field && message) return `${field}: ${message}`;
    if (message) return message;
  }
  // Unrecognized item shape - drop it rather than leak raw JSON; the caller
  // already falls back to "Error de validación." if every item drops out.
  return "";
}
