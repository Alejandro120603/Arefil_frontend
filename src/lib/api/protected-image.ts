import { browserApiClient } from "./browser-client";
import type { RequestOptions } from "./client";

/**
 * Letterhead thumbnails (Backend #38) are protected resources: the backend
 * only serves them to a signed-in user with the right permission, so they are
 * fetched through the same authenticated client as every other call (the
 * session cookie travels same-origin) and shown from a `blob:` URL — never
 * from a URL handed straight to `<img>`.
 *
 * The backend answers with `ETag` + `Cache-Control: private, no-cache` and
 * `Vary: Cookie`. The browser's HTTP cache therefore revalidates every fetch
 * with `If-None-Match` and turns a `304` into the cached image by itself, and
 * an entry never serves another session's cookie.
 */

const IMAGE_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
/** The backend publishes its own URLs (`thumbnail_url`) rooted at `/api`. */
const BACKEND_API_PREFIX = "/api/";

/** Maps a backend URL (`/api/reports/...`) to a path of the browser client, or `null` if it is not one. */
export function backendApiPath(url: string | null | undefined): string | null {
  if (url == null || !url.startsWith(BACKEND_API_PREFIX)) return null;
  return url.slice(BACKEND_API_PREFIX.length - 1);
}

export class UnexpectedImageTypeError extends Error {
  constructor(type: string) {
    super(`Tipo de imagen no admitido: ${type || "desconocido"}.`);
    this.name = "UnexpectedImageTypeError";
  }
}

/** Fetches an authenticated image; anything that is not a raster image is refused. */
export async function fetchProtectedImage(path: string, options?: RequestOptions): Promise<Blob> {
  const { blob } = await browserApiClient.apiDownloadBlob(path, options);
  const type = blob.type.split(";")[0].trim().toLowerCase();
  if (!IMAGE_MEDIA_TYPES.has(type)) throw new UnexpectedImageTypeError(type);
  return blob;
}
