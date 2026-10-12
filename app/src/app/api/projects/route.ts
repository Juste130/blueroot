import { clientIp, handle, json } from "@/lib/api";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { getRegistryView } from "@/lib/registry/projects";

export const dynamic = "force-dynamic";

/** GET /api/projects (public): projects, candidate zones and registry totals, rebuilt from events. */
export const GET = handle(async (request: Request) => {
  rateLimit(`read:${clientIp(request)}`, LIMITS.read.limit, LIMITS.read.windowMs);
  const { snapshot, state, projects } = await getRegistryView();
  return json(
    {
      status: snapshot.status,
      totals: state.totals,
      projects: projects.map(({ metadata, chain, claims, satellite, ...p }) => ({
        ...p,
        community: chain?.community ?? null,
        owner: chain?.owner ?? null,
        issued: chain?.issued ?? 0,
        retired: chain?.retired ?? 0,
        claims: claims.length,
        satelliteScore: satellite?.score ?? null,
        description: metadata?.description ?? null,
      })),
    },
    { cache: "public, max-age=15, s-maxage=15" },
  );
});
