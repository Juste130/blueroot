import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const repoRoot = fileURLToPath(new URL(".", import.meta.url));

// Headers that do not depend on the request. The Content-Security-Policy needs a per-request
// nonce, so it is set in `src/proxy.ts`.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Camera and geolocation are needed by the field evidence form, on this origin only.
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()" },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@blueroot/satellite"],
  serverExternalPackages: ["sharp"],
  // The NDVI files live in scripts/satellite/data and are read (and hashed) at runtime.
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    "/**": ["./scripts/satellite/data/**/*.json", "./contracts/deployments/*.json", "./content/**/*.json"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(config);
