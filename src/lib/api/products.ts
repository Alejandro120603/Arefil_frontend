import type { PageParams } from "./client";
import { serverApiClient } from "./server-client";
import type { Page, PriceHistoryEntry, Product } from "@/types/api";

export interface ListProductsParams extends PageParams {
  search?: string;
  part_number?: string;
  item_number?: string;
}

export function listProducts(params: ListProductsParams = {}): Promise<Page<Product>> {
  return serverApiClient.apiGet<Page<Product>>("/products", { query: params });
}

export function getProduct(productId: number): Promise<Product> {
  return serverApiClient.apiGet<Product>(`/products/${productId}`);
}

export function getProductPriceHistory(
  productId: number,
  params: PageParams = {},
): Promise<Page<PriceHistoryEntry>> {
  return serverApiClient.apiGet<Page<PriceHistoryEntry>>(`/products/${productId}/price-history`, { query: params });
}
