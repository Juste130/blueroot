import { getResolution, isValidCell } from "h3-js";
import { ApiError, assertSameOrigin, handle, json, parse, readJson, requireSession } from "@/lib/api";
import { hasRole, requireLive } from "@/lib/auth/access";
import { putPublicDocument } from "@/lib/content/store";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { PROJECT_SCHEMA, ProjectMetadataSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

const Body = ProjectMetadataSchema.omit({ schemaVersion: true, createdAt: true });

/**
 * Publishes a project's metadata on public IPFS before registration (F2) and returns the hash to
 * pass to `registerProject`. Cells already held by an active project are reported up front (F3);
 * the contract enforces the rule anyway.
 */
export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  const session = await requireSession();
  rateLimit(`upload:${session.address}`, LIMITS.upload.limit, LIMITS.upload.windowMs);
  const body = parse(Body, await readJson(request, 200_000));
  if (!(await hasRole("proponent", session.address))) throw new ApiError(403, "not_proponent");

  const cells = [...new Set(body.cells)].sort();
  if (cells.some((c) => !isValidCell(c) || getResolution(c) !== 10)) throw new ApiError(400, "invalid_cells");
  const { state } = await requireLive();
  const taken = new Map(state.projects.filter((p) => p.status === "active").flatMap((p) => p.cells.map((c) => [c, p.id] as const)));
  const conflicts = cells.filter((c) => taken.has(c)).map((c) => ({ cell: c, projectId: taken.get(c)! }));
  if (conflicts.length) return json({ error: "cells_taken", conflicts }, { status: 409 });

  const metadata = ProjectMetadataSchema.parse({ ...body, cells, schemaVersion: PROJECT_SCHEMA, createdAt: new Date().toISOString() });
  return json(await putPublicDocument(metadata, `project-${cells[0]}`), { status: 201 });
});

