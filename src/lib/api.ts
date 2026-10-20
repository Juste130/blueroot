import "server-only";

import { NextResponse } from "next/server";
import type { z } from "zod";
import { type Session, getSession } from "./auth/session";

/** Errors returned to clients: a stable code for the UI, never a stack trace or internal detail. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export function json<T>(data: T, init?: ResponseInit & { cache?: string }) {
  const res = NextResponse.json(data, init);
  if (init?.cache) res.headers.set("Cache-Control", init.cache);
  return res;
}

export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof ApiError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
      // Logged without request bodies, signatures or file contents (spec 10.3).
      console.error("[api]", (error as Error).name, (error as Error).message);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }
  };
}

export function parse<S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, "invalid_input", result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return result.data;
}

export async function readJson(request: Request, maxBytes = 64_000): Promise<unknown> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new ApiError(413, "too_large");
  const text = await request.text();
  if (text.length > maxBytes) throw new ApiError(413, "too_large");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json");
  }
}

/**
 * State-changing requests must come from this origin (CSRF defence on top of SameSite=Strict cookies).
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) throw new ApiError(403, "bad_origin");
}

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new ApiError(401, "unauthenticated");
  return session;
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
}
