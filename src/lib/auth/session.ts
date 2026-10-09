/**
 * Session contract shared by server and browser code. The backend is the only
 * authority: these values come from `GET /auth/me` and only drive UX.
 */

export const SESSION_COOKIE_NAME = "arefil_session";
export const LOGIN_PATH = "/login";
/** Request header set by `src/proxy.ts` with the path being rendered. */
export const REQUEST_PATH_HEADER = "x-arefil-path";

export type UserRole = "ADMIN" | "USER";

export type Permission =
  | "catalog:read"
  | "catalog:write"
  | "reports:run"
  | "reports:admin"
  | "system:backup"
  | "users:admin";

export interface CurrentUser {
  id: number;
  username: string;
  role: UserRole;
  is_active: boolean;
  permissions: Permission[];
}

export function hasPermission(user: CurrentUser | null, permission: Permission): boolean {
  return user != null && user.permissions.includes(permission);
}

/** Where a user lands after signing in when no destination was requested. */
export function homePathFor(user: CurrentUser): string {
  return hasPermission(user, "reports:admin") ? "/administracion/reportes" : "/donaldson/reports";
}

/**
 * Only same-site, absolute paths are accepted as a post-login destination, so
 * `?next=` can never send the user to another origin (`//evil`, `https://…`,
 * `/\evil`) or back to the login page.
 */
export function safeNextPath(next: string | string[] | null | undefined): string | null {
  const value = Array.isArray(next) ? next[0] : next;
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  if ([...value].some((char) => char.charCodeAt(0) < 0x20)) return null;
  if (value === LOGIN_PATH || value.startsWith(`${LOGIN_PATH}?`) || value.startsWith(`${LOGIN_PATH}/`)) return null;
  return value;
}

export function loginPathFor(next: string | null | undefined): string {
  const destination = safeNextPath(next);
  return destination ? `${LOGIN_PATH}?next=${encodeURIComponent(destination)}` : LOGIN_PATH;
}
