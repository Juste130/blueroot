import { ApiError, assertSameOrigin, handle, json, requireSession } from "@/lib/api";
import { canSubmitEvidence, requireActiveProject, requireLive } from "@/lib/auth/access";
import { InvalidFileError, MAX_UPLOAD_BYTES, processEvidence } from "@/lib/evidence/process";
import { LIMITS, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/** POST /api/evidence/upload (spec 9): wallet session, rate limit, real file checks. */
export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  const session = await requireSession();
  rateLimit(`upload:${session.address}`, LIMITS.upload.limit, LIMITS.upload.windowMs);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64_000) throw new ApiError(413, "too_large");

  const form = await request.formData().catch(() => {
    throw new ApiError(400, "invalid_form");
  });
  const projectId = Number(form.get("projectId"));
  const file = form.get("file");
  if (!Number.isSafeInteger(projectId) || projectId <= 0) throw new ApiError(400, "invalid_project");
  if (!(file instanceof File)) throw new ApiError(400, "missing_file");

  const { state } = await requireLive();
  const project = requireActiveProject(state, projectId);
  if (!canSubmitEvidence(session.address, project)) throw new ApiError(403, "not_project_member");

  try {
    const record = await processEvidence(new Uint8Array(await file.arrayBuffer()), projectId, project.cells);
    return json({ evidence: record }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidFileError) throw new ApiError(422, `invalid_file_${error.message}`);
    throw error;
  }
});
