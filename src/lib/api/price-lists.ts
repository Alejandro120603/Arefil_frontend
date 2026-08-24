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

/** The backend caps `page_size` at 100 (`schemas/pagination.py::MAX_PAGE_SIZE`). */
const MAX_PAGE_SIZE = 100;
/** Safety valve so a mis-reported `total_pages` can never spin this forever. */
const MAX_PAGES_FETCHED = 20;

/**
 * Every price list, for selectors that need the full set at once (the A/B
 * comparison picker). Callers get an empty array rather than a partial page
 * only on failure - the rejection propagates so the page can show `ErrorAlert`.
 */
export async function listAllPriceLists(params: Omit<ListPriceListsParams, "page" | "page_size"> = {}): Promise<PriceList[]> {
  const first = await listPriceLists({ ...params, page: 1, page_size: MAX_PAGE_SIZE });
  const items = [...first.items];
  const lastPage = Math.min(first.meta.total_pages, MAX_PAGES_FETCHED);
  for (let page = 2; page <= lastPage; page += 1) {
    const next = await listPriceLists({ ...params, page, page_size: MAX_PAGE_SIZE });
    items.push(...next.items);
  }
  return items;
}
