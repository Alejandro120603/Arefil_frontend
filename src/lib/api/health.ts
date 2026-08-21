import { serverApiClient } from "./server-client";
import type { HealthStatus } from "@/types/api";

export function getHealth(): Promise<HealthStatus> {
  return serverApiClient.apiGet<HealthStatus>("/health");
}
