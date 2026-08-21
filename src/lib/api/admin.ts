import { browserApiClient } from "./browser-client";
import type { BlobDownload } from "./client";

export function downloadDatabaseBackup(): Promise<BlobDownload> {
  return browserApiClient.apiDownloadBlob("/admin/database/backup");
}
