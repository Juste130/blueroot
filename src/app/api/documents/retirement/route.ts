import { assertSameOrigin, handle, json, parse, readJson, requireSession } from "@/lib/api";
import { putPublicDocument } from "@/lib/content/store";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { RETIREMENT_SCHEMA, RetirementReasonSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

const Body = RetirementReasonSchema.omit({ schemaVersion: true, createdAt: true });

/** Publishes the public reason of a retirement (F10); its hash becomes `reasonHash` in `retire`. */
export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  const session = await requireSession();
  rateLimit(`upload:${session.address}`, LIMITS.upload.limit, LIMITS.upload.windowMs);
  const body = parse(Body, await readJson(request, 8_000));
  const doc = RetirementReasonSchema.parse({ ...body, schemaVersion: RETIREMENT_SCHEMA, createdAt: new Date().toISOString() });
  return json(await putPublicDocument(doc, `retirement-${Date.now()}`), { status: 201 });
});
