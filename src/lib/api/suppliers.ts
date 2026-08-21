import { serverApiClient } from "./server-client";
import type { Supplier } from "@/types/api";

export function listSuppliers(): Promise<Supplier[]> {
  return serverApiClient.apiGet<Supplier[]>("/suppliers");
}
