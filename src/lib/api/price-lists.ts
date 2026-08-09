import { apiDownloadBlob, apiGet, type BlobDownload, type PageParams } from "./client";
import type { Page, PriceList, PriceListDetail, PriceListItem, StatusChange } from "@/types/api";

export interface ListPriceListsParams extends PageParams {
  supplier?: string;
  effective_date?: string;
}

export function listPriceLists(params: ListPriceListsParams = {}): Promise<Page<PriceList>> {
  return apiGet<Page<PriceList>>("/price-lists", { query: params });
}

export function getPriceList(priceListId: number): Promise<PriceListDetail> {
  return apiGet<PriceListDetail>(`/price-lists/${priceListId}`);
}

export interface ListPriceListItemsParams extends PageParams {
  search?: string;
  classification?: string;
  sort?: string;
}

export function listPriceListItems(
  priceListId: number,
  params: ListPriceListItemsParams = {},
): Promise<Page<PriceListItem>> {
  return apiGet<Page<PriceListItem>>(`/price-lists/${priceListId}/items`, { query: params });
}

export function listPriceListStatusChanges(
  priceListId: number,
  params: PageParams = {},
): Promise<Page<StatusChange>> {
  return apiGet<Page<StatusChange>>(`/price-lists/${priceListId}/status-changes`, { query: params });
}

export function downloadPriceListXlsx(priceListId: number): Promise<BlobDownload> {
  return apiDownloadBlob(`/price-lists/${priceListId}/export/xlsx`);
}

export function downloadPriceListCsv(priceListId: number): Promise<BlobDownload> {
  return apiDownloadBlob(`/price-lists/${priceListId}/export/csv`);
}

export function downloadPriceListSource(priceListId: number): Promise<BlobDownload> {
  return apiDownloadBlob(`/price-lists/${priceListId}/source`);
}
