import type { BlobDownload } from "./api/client";

/** Triggers a browser file save from an already-fetched blob (no extra request, no `<a>` left in the DOM). */
export function triggerBrowserDownload(download: BlobDownload, fallbackFilename: string): void {
  const url = URL.createObjectURL(download.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = download.filename ?? fallbackFilename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
