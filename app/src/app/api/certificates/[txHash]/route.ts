import { ApiError, clientIp, handle, json } from "@/lib/api";
import { getCertificates } from "@/lib/certificates";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Public (spec 9): anyone can verify a certificate from the retirement transaction hash. */
export const GET = handle(async (request: Request, { params }: { params: Promise<{ txHash: string }> }) => {
  rateLimit(`read:${clientIp(request)}`, LIMITS.read.limit, LIMITS.read.windowMs);
  const { txHash } = await params;
  const result = await getCertificates(txHash);
  if (result.status === "invalid") throw new ApiError(400, "invalid_tx_hash");
  if (result.status !== "ok") throw new ApiError(404, result.status);
  // A mined retirement never changes.
  return json(result.certificates, { cache: "public, max-age=300, s-maxage=86400" });
});
