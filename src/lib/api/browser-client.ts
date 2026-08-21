import "client-only";

import { createApiClient } from "./client";

const DEFAULT_BROWSER_API_URL = "/backend-api";

export function getBrowserApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL?.trim() || DEFAULT_BROWSER_API_URL;
}

export const browserApiClient = createApiClient(getBrowserApiBaseUrl);
