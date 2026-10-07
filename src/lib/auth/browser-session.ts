import "client-only";

import { getBrowserApiBaseUrl } from "@/lib/api/browser-client";
import type { CurrentUser } from "./session";

export type LoginResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; reason: "invalid" | "throttled" | "unavailable" };

/**
 * Plain fetches on purpose: a 401 here means "wrong credentials", not "send
 * me to the login page" as it does for every other API call.
 */
export async function login(username: string, password: string): Promise<LoginResult> {
  try {
    const response = await fetch(`${getBrowserApiBaseUrl()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ username, password }),
      credentials: "same-origin",
    });
    if (response.ok) return { ok: true, user: (await response.json()) as CurrentUser };
    if (response.status === 401 || response.status === 422) return { ok: false, reason: "invalid" };
    if (response.status === 429) return { ok: false, reason: "throttled" };
    return { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/** Ends the server-side session; the backend also expires the cookie. */
export async function logout(): Promise<void> {
  try {
    await fetch(`${getBrowserApiBaseUrl()}/auth/logout`, {
      method: "POST",
      credentials: "same-origin",
    });
  } catch {
    // Leaving for /login regardless: an unreachable backend cannot be
    // holding the user on a page that needs it.
  }
}
