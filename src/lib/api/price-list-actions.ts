import { browserApiClient } from "./browser-client";
import type { RequestOptions } from "./client";

export function deletePriceList(priceListId: number, options?: RequestOptions): Promise<void> {
  return browserApiClient.apiDelete<void>(`/price-lists/${priceListId}`, options);
}
