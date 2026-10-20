import "server-only";

import { ApiError } from "./api";

/**
 * Fixed-window rate limiter kept in memory. On serverless platforms each instance has its own
 * counters, so limits are per instance: enough to stop a single abusive client during the demo.
 * A shared store (Redis, Postgres) can replace `buckets` without changing callers.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  if (buckets.size > 10_000) for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (++bucket.count > limit) {
    throw new ApiError(429, "rate_limited", `Retry in ${Math.ceil((bucket.resetAt - now) / 1000)} s`);
  }
}

export const LIMITS = {
  auth: { limit: 20, windowMs: 60_000 },
  read: { limit: 120, windowMs: 60_000 },
  upload: { limit: 30, windowMs: 10 * 60_000 },
  /** AI reports cost money: a few per project per day (spec 9: quota per project). */
  analyzePerProject: { limit: 3, windowMs: 24 * 60 * 60_000 },
  analyzePerWallet: { limit: 10, windowMs: 24 * 60 * 60_000 },
} as const;
