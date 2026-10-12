import { generateSiweNonce } from "viem/siwe";
import { clientIp, handle, json } from "@/lib/api";
import { issueNonce } from "@/lib/auth/session";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  rateLimit(`auth:${clientIp(request)}`, LIMITS.auth.limit, LIMITS.auth.windowMs);
  const nonce = generateSiweNonce();
  await issueNonce(nonce);
  return json({ nonce }, { cache: "no-store" });
});
