import { ApiError, clientIp, handle } from "@/lib/api";
import { getDocument } from "@/lib/content/store";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { getProjectView } from "@/lib/registry/projects";

export const dynamic = "force-dynamic";

/**
 * GET /api/satellite/[projectId] (public): the exact bytes of the NDVI series, so that
 * `sha256sum` of the response equals the hash anchored on-chain (F5).
 */
export const GET = handle(async (request: Request, { params }: { params: Promise<{ projectId: string }> }) => {
  rateLimit(`read:${clientIp(request)}`, LIMITS.read.limit, LIMITS.read.windowMs);
  const { projectId } = await params;
  const view = await getProjectView(projectId);
  const hash = view?.project.satellite?.hash;
  const doc = hash ? await getDocument(hash) : undefined;
  if (!doc) throw new ApiError(404, "no_satellite_series");
  return new Response(doc.text, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Content-SHA256": doc.hash,
      "Content-Disposition": `inline; filename="ndvi-${view!.project.satellite!.zoneId}.json"`,
    },
  });
});
