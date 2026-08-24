import { browserApiClient } from "./browser-client";
import type { RequestOptions } from "./client";
import type { PriceListComparisonRequest, PriceListComparisonResponse } from "@/types/api";

export const PRICE_LIST_COMPARISON_PATH = "/reports/price-list-comparison/data";

/**
 * A == B is rejected by the backend with a 422 whose message is written for
 * developers, so the UI blocks the request before it leaves the browser and
 * this guard exists only as the last line of defence for direct callers.
 */
export const SAME_PRICE_LIST_MESSAGE = "Selecciona dos listas distintas.";

export class SamePriceListError extends Error {
  constructor() {
    super(SAME_PRICE_LIST_MESSAGE);
    this.name = "SamePriceListError";
  }
}

/**
 * Runs on the browser through the same-origin `/backend-api/*` proxy - the
 * internal Docker hostname is never resolved client side (see `browser-client`).
 */
export function getPriceListComparison(
  request: PriceListComparisonRequest,
  options?: RequestOptions,
): Promise<PriceListComparisonResponse> {
  if (request.price_list_a_id === request.price_list_b_id) {
    return Promise.reject(new SamePriceListError());
  }
  return browserApiClient.apiPostJson<PriceListComparisonResponse>(PRICE_LIST_COMPARISON_PATH, request, options);
}
