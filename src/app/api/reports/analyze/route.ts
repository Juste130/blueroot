import { isAddressEqual } from "viem";
import { z } from "zod";
import { ApiError, assertSameOrigin, handle, json, parse, readJson, requireSession } from "@/lib/api";
import { requireActiveProject, requireLive } from "@/lib/auth/access";
import { signReportToken } from "@/lib/auth/session";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { AssessmentRejectedError } from "@/lib/report/ai";
import { buildReport } from "@/lib/report/build";
import { THRESHOLD } from "@/lib/score";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({
  projectId: z.number().int().positive(),
  periodStart: z.number().int().positive(),
  periodEnd: z.number().int().positive(),
});

/**
 * POST /api/reports/analyze (spec 9): wallet signature, quota per project and per wallet. Returns
 * the public report and, if it reaches the threshold, a token to submit it for anchoring.
 */
export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  const session = await requireSession();
  const body = parse(Body, await readJson(request));
  const { state } = await requireLive();
  const project = requireActiveProject(state, body.projectId);
  if (!isAddressEqual(project.owner, session.address)) throw new ApiError(403, "not_project_owner");

  rateLimit(`analyze:wallet:${session.address}`, LIMITS.analyzePerWallet.limit, LIMITS.analyzePerWallet.windowMs);
  rateLimit(`analyze:project:${body.projectId}`, LIMITS.analyzePerProject.limit, LIMITS.analyzePerProject.windowMs);

  try {
    const { report, hash, cid } = await buildReport(body.projectId, body.periodStart, body.periodEnd);
    const submitToken =
      report.scores.combined >= THRESHOLD ? await signReportToken({ hash, projectId: body.projectId, owner: session.address }) : null;
    return json({ report, hash, cid, submitToken }, { status: 201 });
  } catch (error) {
    if (error instanceof AssessmentRejectedError) throw new ApiError(502, "ai_output_rejected");
    throw error;
  }
});
