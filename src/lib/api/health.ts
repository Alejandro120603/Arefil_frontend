import { apiGet } from "./client";
import type { HealthStatus } from "@/types/api";

export function getHealth(): Promise<HealthStatus> {
  return apiGet<HealthStatus>("/health");
}
