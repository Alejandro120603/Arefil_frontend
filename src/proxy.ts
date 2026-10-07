import { NextResponse, type NextRequest } from "next/server";
import { REQUEST_PATH_HEADER, SESSION_COOKIE_NAME, loginPathFor } from "@/lib/auth/session";

/**
 * Optimistic navigation guard only. A missing session cookie sends the visitor
 * to /login; a present cookie proves nothing, so server layouts still validate
 * it against `GET /auth/me` and the backend authorizes every API request.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.redirect(new URL(loginPathFor(`${pathname}${search}`), request.url));
  }
  // Lets a server layout send an expired session back to the same page after login.
  const headers = new Headers(request.headers);
  headers.set(REQUEST_PATH_HEADER, `${pathname}${search}`);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Everything except the login page, the health check, the backend proxy
  // (the backend answers 401 itself), Next.js internals and static files.
  matcher: [
    "/((?!login|api/health|backend-api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
