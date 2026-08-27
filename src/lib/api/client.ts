import { ApiError } from "./errors";

export type QueryParams = Record<string, string | number | boolean | undefined>;

export interface PageParams {
  page?: number;
  page_size?: number;
  [key: string]: string | number | boolean | undefined;
}

export function buildApiUrl(baseUrl: string, path: string, query?: QueryParams): string {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  if (!normalizedBaseUrl) throw new Error("La URL base del API no puede estar vacía.");

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const joinedUrl = `${normalizedBaseUrl}${normalizedPath}`;
  const isAbsolute = /^https?:\/\//i.test(joinedUrl);
  const url = new URL(joinedUrl, "http://arefil.local");
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return isAbsolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
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

export interface ApiClient {
  apiGet<T>(path: string, options?: RequestOptions): Promise<T>;
  apiPostJson<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  apiPatchJson<T>(path: string, body: unknown, options?: RequestOptions): Promise<T>;
  apiPutJson<T>(path: string, body: unknown, options?: RequestOptions): Promise<T>;
  apiPostBlob(path: string, body: unknown, options?: RequestOptions): Promise<BlobDownload>;
  apiUpload<T>(path: string, formData: FormData, options?: RequestOptions): Promise<T>;
  apiDownloadBlob(path: string, options?: RequestOptions): Promise<BlobDownload>;
}

export function createApiClient(resolveBaseUrl: () => string): ApiClient {
  async function apiGet<T>(path: string, options?: RequestOptions): Promise<T> {
    const response = await fetch(buildApiUrl(resolveBaseUrl(), path, options?.query), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: options?.signal,
      cache: "no-store",
    });
    return parseJson<T>(response);
  }

  async function apiPostJson<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const response = await fetch(buildApiUrl(resolveBaseUrl(), path, options?.query), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: options?.signal,
    });
    return parseJson<T>(response);
  }

  async function apiPatchJson<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
    const response = await fetch(buildApiUrl(resolveBaseUrl(), path, options?.query), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: options?.signal,
    });
    return parseJson<T>(response);
  }

  async function apiPutJson<T>(path: string, body: unknown, options?: RequestOptions): Promise<T> {
    const response = await fetch(buildApiUrl(resolveBaseUrl(), path, options?.query), {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: options?.signal,
    });
    return parseJson<T>(response);
  }

  async function apiPostBlob(path: string, body: unknown, options?: RequestOptions): Promise<BlobDownload> {
    const response = await fetch(buildApiUrl(resolveBaseUrl(), path, options?.query), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: options?.signal,
    });
    await ensureOk(response);
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition");
    return { blob, filename: disposition ? extractFilename(disposition) : null };
  }

  async function apiUpload<T>(path: string, formData: FormData, options?: RequestOptions): Promise<T> {
    const response = await fetch(buildApiUrl(resolveBaseUrl(), path, options?.query), {
      method: "POST",
      headers: { Accept: "application/json" },
      body: formData,
      signal: options?.signal,
    });
    return parseJson<T>(response);
  }

  async function apiDownloadBlob(path: string, options?: RequestOptions): Promise<BlobDownload> {
    const response = await fetch(buildApiUrl(resolveBaseUrl(), path, options?.query), {
      method: "GET",
      signal: options?.signal,
    });
    await ensureOk(response);
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition");
    return { blob, filename: disposition ? extractFilename(disposition) : null };
  }

  return { apiGet, apiPostJson, apiPatchJson, apiPutJson, apiPostBlob, apiUpload, apiDownloadBlob };
}

export interface BlobDownload {
  blob: Blob;
  filename: string | null;
}

function extractFilename(disposition: string): string | null {
  const encodedMatch = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(disposition);
  const plainMatch = /filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i.exec(disposition);
  const raw = encodedMatch?.[1] ?? plainMatch?.[1] ?? plainMatch?.[2];
  if (raw == null) return null;
  const unquoted = raw.trim().replace(/^"|"$/g, "");
  try {
    return decodeURIComponent(unquoted).replace(/[\\/]/g, "_");
  } catch {
    return unquoted.replace(/[\\/]/g, "_");
  }
}
