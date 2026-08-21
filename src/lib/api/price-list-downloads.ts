import { browserApiClient } from "./browser-client";
import type { BlobDownload } from "./client";

export function downloadPriceListXlsx(priceListId: number): Promise<BlobDownload> {
  return browserApiClient.apiDownloadBlob(`/price-lists/${priceListId}/export/xlsx`);
}

export function downloadPriceListCsv(priceListId: number): Promise<BlobDownload> {
  return browserApiClient.apiDownloadBlob(`/price-lists/${priceListId}/export/csv`);
}

export function downloadPriceListSource(priceListId: number): Promise<BlobDownload> {
  return browserApiClient.apiDownloadBlob(`/price-lists/${priceListId}/source`);
}
