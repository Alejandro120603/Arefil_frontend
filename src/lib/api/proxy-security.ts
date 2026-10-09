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

/**
 * The browser's address for the backend's per-client login throttle, or null.
 *
 * Next.js only fills `X-Forwarded-For` from the socket when the request did
 * not already carry one, so on its own the header is whatever the client sent.
 * It is trusted only with `TRUST_PROXY_FORWARDED_FOR=true`, i.e. when the only
 * way in is a reverse proxy (Caddy in `compose.yaml`) that overwrites it with
 * the address it actually saw. Otherwise nothing is forwarded and the backend
 * falls back to its per-username budget plus this proxy's own address.
 *
 * Cloudflare does not overwrite a client-sent `X-Forwarded-For` (it appends to
 * it), so behind a Cloudflare Tunnel `CLIENT_IP_HEADER=cf-connecting-ip` names
 * the header Cloudflare always sets itself; it takes precedence when set.
 */
export function trustedClientAddress(request: Request): string | null {
  const clientIpHeader = process.env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (clientIpHeader) return request.headers.get(clientIpHeader)?.trim() || null;
  if (process.env.TRUST_PROXY_FORWARDED_FOR?.trim().toLowerCase() !== "true") return null;
  const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || null;
}
