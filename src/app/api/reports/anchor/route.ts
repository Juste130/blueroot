import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError, handle, json, parse, readJson } from "@/lib/api";
import { anchorReport } from "@/lib/report/anchor";

export const dynamic = "force-dynamic";

const Body = z.object({ reportHash: z.string().regex(/^0x[0-9a-f]{64}$/) });

function authorized(request: Request): boolean {
  const secret = process.env.ANCHOR_API_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!secret || secret.length < 32 || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST /api/reports/anchor (spec 9): reserved to the server. Never called by the browser; only an
 * operator or job holding ANCHOR_API_SECRET can use it, e.g. to retry an anchoring that failed.
 */
export const POST = handle(async (request: Request) => {
  if (!authorized(request)) throw new ApiError(404, "not_found");
  const { reportHash } = parse(Body, await readJson(request));
  return json(await anchorReport(reportHash as `0x${string}`), { status: 201 });
});
