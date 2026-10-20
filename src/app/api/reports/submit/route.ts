import { isAddressEqual } from "viem";
import { z } from "zod";
import { ApiError, assertSameOrigin, handle, json, parse, readJson, requireSession } from "@/lib/api";
import { requireActiveProject, requireLive } from "@/lib/auth/access";
import { verifyReportToken } from "@/lib/auth/session";
import { anchorReport } from "@/lib/report/anchor";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const Body = z.object({ token: z.string().min(20).max(2_000) });

/**
 * The project owner submits a report this server generated for them. The browser never chooses what
 * gets anchored: the signed token names the exact report hash.
 */
export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  const session = await requireSession();
  const claims = await verifyReportToken(parse(Body, await readJson(request)).token);
  if (!claims || !isAddressEqual(claims.owner, session.address)) throw new ApiError(403, "invalid_token");
  const { state } = await requireLive();
  const project = requireActiveProject(state, claims.projectId);
  if (!isAddressEqual(project.owner, session.address)) throw new ApiError(403, "not_project_owner");
  return json(await anchorReport(claims.hash), { status: 201 });
});
