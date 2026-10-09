import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api/errors";
import { serverApiClient } from "@/lib/api/server-client";
import { type CurrentUser, REQUEST_PATH_HEADER, loginPathFor } from "./session";

/**
 * The signed-in user according to the backend, or null without a valid
 * session. Memoized per request, so layouts and pages share one lookup.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  try {
    return await serverApiClient.apiGet<CurrentUser>("/auth/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
});

/** The current user, or a redirect to /login that returns here afterwards. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (user == null) {
    const path = (await headers()).get(REQUEST_PATH_HEADER);
    redirect(loginPathFor(path));
  }
  return user;
}
