import { ApiError, handle, json, requireSession } from "@/lib/api";
import { canSubmitEvidence, hasRole, requireLive } from "@/lib/auth/access";
import { evidenceUrl, listEvidence } from "@/lib/evidence/store";

export const dynamic = "force-dynamic";

/**
 * Evidence of a project with temporary links to the raw photos. Raw evidence is private: only the
 * project's members and validators can see it (spec 10.5).
 */
export const GET = handle(async (request: Request) => {
  const session = await requireSession();
  const projectId = Number(new URL(request.url).searchParams.get("project"));
  if (!Number.isSafeInteger(projectId) || projectId <= 0) throw new ApiError(400, "invalid_project");
  const { state } = await requireLive();
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) throw new ApiError(404, "unknown_project");
  if (!canSubmitEvidence(session.address, project) && !(await hasRole("validator", session.address))) throw new ApiError(403, "forbidden");

  const records = await listEvidence(projectId);
  const withUrls = await Promise.all(records.map(async (r) => ({ ...r, url: await evidenceUrl(r) })));
  return json({ evidence: withUrls }, { cache: "private, no-store" });
});
