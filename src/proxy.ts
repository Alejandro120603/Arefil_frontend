import { NextResponse, type NextRequest } from "next/server";
import { REQUEST_PATH_HEADER, SESSION_COOKIE_NAME, loginPathFor } from "@/lib/auth/session";

const HSTS = "max-age=31536000";

/**
 * The scheme the browser used to reach Cloudflare, from the `CF-Visitor`
 * header Cloudflare sets on every proxied request (`{"scheme":"https"}`).
 * Null when the request did not come through Cloudflare.
 */
function cloudflareVisitorScheme(request: NextRequest): string | null {
  const visitor = request.headers.get("cf-visitor");
  if (!visitor) return null;
  try {
    const scheme = (JSON.parse(visitor) as { scheme?: unknown }).scheme;
    return typeof scheme === "string" ? scheme.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Behind the Cloudflare Tunnel the origin is plain HTTP, so only Cloudflare
 * knows whether the browser used HTTPS. A page opened over http:// could never
 * keep the `Secure` session cookie, so it is sent to https:// first (Cloudflare's
 * "Always Use HTTPS" does the same at the edge for every path).
 */
function enforceHttps(request: NextRequest): NextResponse | null {
  if (cloudflareVisitorScheme(request) !== "http") return null;
  // Not `nextUrl`'s host: the standalone server builds it from its own bind
  // address (0.0.0.0). PUBLIC_ORIGIN, when configured, also rules out
  // redirecting to whatever Host a client put in the request.
  const { pathname, search } = request.nextUrl;
  const publicOrigin = process.env.PUBLIC_ORIGIN?.trim().replace(/\/+$/, "");
  const origin = publicOrigin?.startsWith("https://")
    ? publicOrigin
    : `https://${request.headers.get("host") ?? request.nextUrl.host}`;
  return NextResponse.redirect(`${origin}${pathname}${search}`, 308);
}

function withHsts(request: NextRequest, response: NextResponse): NextResponse {
  if (cloudflareVisitorScheme(request) === "https") response.headers.set("Strict-Transport-Security", HSTS);
  return response;
}

/**
 * Optimistic navigation guard only. A missing session cookie sends the visitor
 * to /login; a present cookie proves nothing, so server layouts still validate
 * it against `GET /auth/me` and the backend authorizes every API request.
 */
export function proxy(request: NextRequest) {
  const insecure = enforceHttps(request);
  if (insecure) return insecure;

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/login")) return withHsts(request, NextResponse.next());
  if (!request.cookies.has(SESSION_COOKIE_NAME)) {
    return withHsts(request, NextResponse.redirect(new URL(loginPathFor(`${pathname}${search}`), request.url)));
  }
  // Lets a server layout send an expired session back to the same page after login.
  const headers = new Headers(request.headers);
  headers.set(REQUEST_PATH_HEADER, `${pathname}${search}`);
  return withHsts(request, NextResponse.next({ request: { headers } }));
}

export const config = {
  // Every page, including /login (HTTPS only, no session needed). Not the
  // health check, the backend proxy (the backend answers 401 itself),
  // Next.js internals or static files.
  matcher: [
    "/((?!api/health|backend-api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
