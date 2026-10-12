import { ApiError, clientIp, handle, json } from "@/lib/api";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { getProjectView } from "@/lib/registry/projects";
import { projectIdOf } from "@/lib/registry/state";

export const dynamic = "force-dynamic";

/** GET /api/projects/[id] (public): one project, its claims and its on-chain history (F12). */
export const GET = handle(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  rateLimit(`read:${clientIp(request)}`, LIMITS.read.limit, LIMITS.read.windowMs);
  const { id } = await params;
  const view = await getProjectView(id);
  if (!view) throw new ApiError(404, "unknown_project");
  const claims = new Map(view.state.claims.map((c) => [c.id, c]));
  const history = view.project.id === null ? [] : view.state.events.filter((e) => projectIdOf(e, claims) === view.project.id);
  return json({ project: view.project, history }, { cache: "public, max-age=15, s-maxage=15" });
});
