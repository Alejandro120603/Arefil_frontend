import "client-only";

import { LOGIN_PATH, loginPathFor } from "@/lib/auth/session";
import { createApiClient } from "./client";

const DEFAULT_BROWSER_API_URL = "/backend-api";

export function getBrowserApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL?.trim() || DEFAULT_BROWSER_API_URL;
}

/** The session ended (expired, revoked, logged out elsewhere): sign in again and come back. */
export function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (pathname === LOGIN_PATH) return;
  window.location.assign(loginPathFor(`${pathname}${search}`));
}

export const browserApiClient = createApiClient(getBrowserApiBaseUrl, { onUnauthorized: redirectToLogin });
