import createIntlMiddleware from "next-intl/middleware";
import { chain } from "./lib/chain/config";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intl = createIntlMiddleware(routing);
const dev = process.env.NODE_ENV !== "production";

function origin(url: string | undefined): string {
  try {
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
}

/**
 * Content-Security-Policy with a per-request nonce (spec 10.3): only scripts emitted by Next.js for
 * this response can run. External origins are limited to the map tiles, the chain RPC and IPFS.
 */
function contentSecurityPolicy(nonce: string): string {
  const rpc = origin(chain.rpcUrls.default.http[0]);
  const ipfs = origin(process.env.IPFS_GATEWAY) || "https://gateway.pinata.cloud";
  const tiles = "https://tiles.openfreemap.org https://tiles.maps.eox.at";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // MapLibre and React set inline style attributes; styles cannot execute code.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${tiles} ${ipfs}`,
    "font-src 'self'",
    `connect-src 'self' ${rpc} ${tiles}${dev ? " ws: http://127.0.0.1:8545 http://localhost:8545" : ""}`,
    "worker-src 'self' blob:",
    "child-src blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export default function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  // Next.js reads the nonce from the request's CSP header and adds it to its own scripts.
  request.headers.set("Content-Security-Policy", csp);
  request.headers.set("x-nonce", nonce);
  const response = intl(request);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Pages only: API routes, Next.js assets, the service worker and static files are excluded.
  matcher: ["/((?!api|_next|_vercel|sw\\.js|manifest\\.webmanifest|.*\\..*).*)"],
};
