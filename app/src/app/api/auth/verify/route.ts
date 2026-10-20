import { getAddress, isAddressEqual, recoverMessageAddress } from "viem";
import { parseSiweMessage, validateSiweMessage } from "viem/siwe";
import { z } from "zod";
import { ApiError, assertSameOrigin, clientIp, handle, json, parse, readJson } from "@/lib/api";
import { consumeNonce, startSession } from "@/lib/auth/session";
import { CHAIN_ID } from "@/lib/chain/config";
import { publicClient } from "@/lib/registry/indexer";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({
  message: z.string().min(1).max(2_000),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(20_000),
});

/** SIWE (EIP-4361) verification: domain, nonce (single use), chain, expiry, then the signature itself. */
export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  rateLimit(`auth:${clientIp(request)}`, LIMITS.auth.limit, LIMITS.auth.windowMs);
  const { message, signature } = parse(Body, await readJson(request, 24_000));

  const nonce = await consumeNonce();
  if (!nonce) throw new ApiError(401, "nonce_expired");
  const fields = parseSiweMessage(message);
  const domain = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  if (fields.chainId !== CHAIN_ID) throw new ApiError(401, "wrong_chain");

  // A plain ECDSA signature from the address itself settles it locally. This also covers embedded
  // wallets upgraded with EIP-7702 for gas sponsorship, whose delegated code would otherwise be asked
  // through ERC-1271. Anything else goes to verifySiweMessage (smart-contract wallets, ERC-6492).
  const time = new Date();
  const recovered = await recoverMessageAddress({ message, signature: signature as `0x${string}` }).catch(() => null);
  const valid =
    (validateSiweMessage({ message: fields, domain, nonce, time }) && !!fields.address && !!recovered && isAddressEqual(recovered, fields.address)) ||
    (await publicClient.verifySiweMessage({ message, signature: signature as `0x${string}`, domain, nonce, time }));
  if (!valid || !fields.address) throw new ApiError(401, "invalid_signature");

  const address = getAddress(fields.address);
  await startSession({ address, chainId: CHAIN_ID });
  return json({ address }, { cache: "no-store" });
});
