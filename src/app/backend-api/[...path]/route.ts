import type { NextRequest } from "next/server";
import { isCrossOriginWrite, trustedClientAddress } from "@/lib/api/proxy-security";
import { getServerApiBaseUrl } from "@/lib/api/server-client";

type ProxyContext = { params: Promise<{ path: string[] }> };

const METHODS_WITH_BODY = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CROSS_ORIGIN_REJECTED = { detail: "Origen no permitido." };
const REQUEST_HEADERS_TO_FORWARD = [
  "accept",
  "accept-language",
  "authorization",
  "content-type",
  "cookie",
  "if-match",
  "if-none-match",
  "range",
];
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function createUpstreamHeaders(request: Request): Headers {
  // Forward only end-to-end application headers. In particular, keeping the
  // browser Origin would reintroduce CORS at the internal proxy hop.
  const headers = new Headers();
  for (const name of REQUEST_HEADERS_TO_FORWARD) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  headers.set("accept-encoding", "identity");
  const client = trustedClientAddress(request);
  if (client) headers.set("x-forwarded-for", client);
  return headers;
}

function createDownstreamHeaders(upstream: Response): Headers {
  const headers = new Headers(upstream.headers);
  for (const header of HOP_BY_HOP_HEADERS) headers.delete(header);
  return headers;
}

export async function proxyRequest(request: NextRequest, { params }: ProxyContext): Promise<Response> {
  if (isCrossOriginWrite(request)) {
    return Response.json(CROSS_ORIGIN_REJECTED, { status: 403 });
  }
  try {
    const { path } = await params;
    const encodedPath = path.map(encodeURIComponent).join("/");
    const target = new URL(`${getServerApiBaseUrl().replace(/\/+$/, "")}/${encodedPath}`);
    target.search = request.nextUrl.search;

    const upstream = await fetch(target, {
      method: request.method,
      headers: createUpstreamHeaders(request),
      body: METHODS_WITH_BODY.has(request.method) ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "manual",
    });

    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: createDownstreamHeaders(upstream),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error(`[backend-api] No se pudo completar ${request.method}: ${message}`);
    return Response.json({ detail: "No se pudo comunicar con el backend." }, { status: 502 });
  }
}

export const GET = proxyRequest;
export const HEAD = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const OPTIONS = proxyRequest;
