import { apiGet, type PageParams } from "./client";
import type { Page, PriceHistoryEntry, Product } from "@/types/api";

export interface ListProductsParams extends PageParams {
  search?: string;
  part_number?: string;
  item_number?: string;
}

export function listProducts(params: ListProductsParams = {}): Promise<Page<Product>> {
  return apiGet<Page<Product>>("/products", { query: params });
}

export function getProduct(productId: number): Promise<Product> {
  return apiGet<Product>(`/products/${productId}`);
}

export function getProductPriceHistory(
  productId: number,
  params: PageParams = {},
): Promise<Page<PriceHistoryEntry>> {
  return apiGet<Page<PriceHistoryEntry>>(`/products/${productId}/price-history`, { query: params });
}
