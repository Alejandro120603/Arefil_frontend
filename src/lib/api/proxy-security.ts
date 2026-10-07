/** Same-origin enforcement for the `/backend-api` proxy. */
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function extraTrustedOrigins(): Set<string> {
  return new Set(
    (process.env.TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/+$/, "").toLowerCase())
      .filter(Boolean),
  );
}

/**
 * CSRF guard for cookie-authenticated writes. The backend never sees the
 * browser's Origin (the `/backend-api` proxy drops it), so it is checked there: a write must
 * come from this same origin. `Sec-Fetch-Site` rejects same-site neighbours
 * (another port on the same host) that SameSite=Lax would let through.
 */
export function isCrossOriginWrite(request: Request): boolean {
  if (!STATE_CHANGING_METHODS.has(request.method)) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite != null && fetchSite !== "same-origin" && fetchSite !== "none") return true;
  const origin = request.headers.get("origin");
  if (origin == null) return false;
  const normalized = origin.trim().replace(/\/+$/, "").toLowerCase();
  if (extraTrustedOrigins().has(normalized)) return false;
  let originHost: string;
  try {
    originHost = new URL(normalized).host;
  } catch {
    return true;
  }
  const host = (request.headers.get("host") ?? new URL(request.url).host).toLowerCase();
  return originHost !== host;
}
