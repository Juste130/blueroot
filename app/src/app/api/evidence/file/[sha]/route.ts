import { ApiError, handle, requireSession } from "@/lib/api";
import { canSubmitEvidence, hasRole, requireLive } from "@/lib/auth/access";
import { listEvidence, readLocalEvidence } from "@/lib/evidence/store";

export const dynamic = "force-dynamic";

/** Local development only: serves a stored photo to the same people as Pinata's signed links. */
export const GET = handle(async (request: Request, { params }: { params: Promise<{ sha: string }> }) => {
  if (process.env.NODE_ENV === "production") throw new ApiError(404, "not_found");
  const session = await requireSession();
  const { sha } = await params;
  const projectId = Number(new URL(request.url).searchParams.get("project"));
  const { state } = await requireLive();
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) throw new ApiError(404, "unknown_project");
  if (!canSubmitEvidence(session.address, project) && !(await hasRole("validator", session.address))) throw new ApiError(403, "forbidden");
  if (!(await listEvidence(projectId)).some((r) => r.id === `0x${sha}`)) throw new ApiError(404, "not_found");
  const bytes = readLocalEvidence(sha);
  if (!bytes) throw new ApiError(404, "not_found");
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store" } });
});
