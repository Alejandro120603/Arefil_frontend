import "server-only";

import { createApiClient } from "./client";

const DEFAULT_SERVER_API_URL = "http://127.0.0.1:8000/api";

export function getServerApiBaseUrl(): string {
  return process.env.API_INTERNAL_URL?.trim() || DEFAULT_SERVER_API_URL;
}

export const serverApiClient = createApiClient(getServerApiBaseUrl);
