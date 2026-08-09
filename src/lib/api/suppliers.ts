import { apiGet } from "./client";
import type { Supplier } from "@/types/api";

export function listSuppliers(): Promise<Supplier[]> {
  return apiGet<Supplier[]>("/suppliers");
}
