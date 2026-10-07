import "server-only";

import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createApiClient } from "./client";

const DEFAULT_SERVER_API_URL = "http://127.0.0.1:8000/api";

export function getServerApiBaseUrl(): string {
  return process.env.API_INTERNAL_URL?.trim() || DEFAULT_SERVER_API_URL;
}

/** Server components call the backend directly, on behalf of the browser's session. */
async function forwardSessionCookie(): Promise<Record<string, string>> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return token ? { Cookie: `${SESSION_COOKIE_NAME}=${token}` } : {};
}

export const serverApiClient = createApiClient(getServerApiBaseUrl, { resolveHeaders: forwardSessionCookie });
