import { ApiError } from "./errors";

const DEFAULT_BASE_URL = "http://127.0.0.1:8000/api";

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_BASE_URL;
}

export type QueryParams = Record<string, string | number | boolean | undefined>;

export interface PageParams {
  page?: number;
  page_size?: number;
  [key: string]: string | number | boolean | undefined;
}

function buildUrl(path: string, query?: QueryParams): string {
  const url = new URL(`${getApiBaseUrl()}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function ensureOk(response: Response): Promise<void> {
  if (response.ok) return;
  let detail: unknown = null;
  try {
    const body = await response.json();
    detail = body?.detail ?? body;
  } catch {
    detail = await response.text().catch(() => null);
  }
  throw new ApiError(response.status, detail);
}

async function parseJson<T>(response: Response): Promise<T> {
  await ensureOk(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface RequestOptions {
  query?: QueryParams;
  signal?: AbortSignal;
}

export async function apiGet<T>(path: string, options?: RequestOptions): Promise<T> {
  const response = await fetch(buildUrl(path, options?.query), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: options?.signal,
    cache: "no-store",
  });
  return parseJson<T>(response);
}

export async function apiPostJson<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
  const response = await fetch(buildUrl(path, options?.query), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options?.signal,
  });
  return parseJson<T>(response);
}

export async function apiUpload<T>(path: string, formData: FormData, options?: RequestOptions): Promise<T> {
  const response = await fetch(buildUrl(path, options?.query), {
    method: "POST",
    headers: { Accept: "application/json" },
    body: formData,
    signal: options?.signal,
  });
  return parseJson<T>(response);
}

export interface BlobDownload {
  blob: Blob;
  filename: string | null;
}

export async function apiDownloadBlob(path: string, options?: RequestOptions): Promise<BlobDownload> {
  const response = await fetch(buildUrl(path, options?.query), {
    method: "GET",
    signal: options?.signal,
  });
  await ensureOk(response);
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition");
  return { blob, filename: disposition ? extractFilename(disposition) : null };
}

function extractFilename(disposition: string): string | null {
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return match ? match[1] : null;
}
