import { assertSameOrigin, handle, json } from "@/lib/api";
import { endSession, getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const GET = handle(async () => json({ session: await getSession() }, { cache: "no-store" }));

export const DELETE = handle(async (request: Request) => {
  assertSameOrigin(request);
  await endSession();
  return json({ ok: true }, { cache: "no-store" });
});
