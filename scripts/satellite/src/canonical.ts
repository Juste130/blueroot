import { createHash } from "node:crypto";

/**
 * Deterministic JSON: object keys sorted recursively, 2-space indent, trailing newline.
 * The file written to disk IS this exact string, so `sha256sum file` equals the anchored hash.
 */
export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

/** sha256 of the canonical bytes, as a 0x-prefixed bytes32 ready for `anchorReport`. */
export function sha256Hex(content: string | Uint8Array): `0x${string}` {
  return `0x${createHash("sha256").update(content).digest("hex")}`;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`Non-finite number cannot be serialized: ${value}`);
  }
  return value;
}

/** Round to a fixed number of decimals so outputs are stable across platforms. */
export function round(value: number, decimals = 4): number {
  const f = 10 ** decimals;
  const r = Math.round(value * f) / f;
  return Object.is(r, -0) ? 0 : r;
}
