import { apiDownloadBlob, type BlobDownload } from "./client";

export function downloadDatabaseBackup(): Promise<BlobDownload> {
  return apiDownloadBlob("/admin/database/backup");
}
