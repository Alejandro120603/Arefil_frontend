import type { PageParams } from "./client";
import { serverApiClient } from "./server-client";
import type { Page, PriceList, PriceListDetail, PriceListItem, StatusChange } from "@/types/api";

export interface ListPriceListsParams extends PageParams {
  supplier?: string;
  effective_date?: string;
}

export function listPriceLists(params: ListPriceListsParams = {}): Promise<Page<PriceList>> {
  return serverApiClient.apiGet<Page<PriceList>>("/price-lists", { query: params });
}

export function getPriceList(priceListId: number): Promise<PriceListDetail> {
  return serverApiClient.apiGet<PriceListDetail>(`/price-lists/${priceListId}`);
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
  return serverApiClient.apiGet<Page<PriceListItem>>(`/price-lists/${priceListId}/items`, { query: params });
}

export function listPriceListStatusChanges(
  priceListId: number,
  params: PageParams = {},
): Promise<Page<StatusChange>> {
  return serverApiClient.apiGet<Page<StatusChange>>(`/price-lists/${priceListId}/status-changes`, { query: params });
}
