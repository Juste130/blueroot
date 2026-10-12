/**
 * Pure checks of a field photo (F4). The server feeds them with the EXIF data and pixels it reads
 * itself; nothing declared by the client is trusted.
 */
import { latLngToCell } from "h3-js";

export const EVIDENCE_RESOLUTION = 10;
/** Perceptual hashes closer than this (out of 64 bits) are treated as the same picture. */
export const DUPLICATE_DISTANCE = 6;
/** Photos older than this before the upload are flagged (they may predate the monitoring period). */
export const MAX_AGE_DAYS = 400;

export type EvidenceFlag = "no_gps" | "out_of_zone" | "no_date" | "future_date" | "too_old" | "duplicate";

/**
 * Difference hash: 9x8 greyscale pixels, one bit per horizontal neighbour comparison (64 bits).
 * Robust to re-compression and resizing, so a re-sent photo is recognised.
 */
export function dHash(gray: Uint8Array, width = 9, height = 8): string {
  if (gray.length !== width * height) throw new Error("Unexpected pixel buffer size");
  let bits = 0n;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      bits = (bits << 1n) | (gray[y * width + x]! > gray[y * width + x + 1]! ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, "0");
}

export function hammingDistance(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

export interface PhotoFacts {
  latitude?: number | undefined;
  longitude?: number | undefined;
  capturedAt?: Date | undefined;
  phash: string;
}

export interface CheckResult {
  cell: string | null;
  flags: EvidenceFlag[];
  duplicateOf: string | null;
  accepted: boolean;
}

export function checkPhoto(
  facts: PhotoFacts,
  ctx: { cells: ReadonlySet<string>; existing: readonly { id: string; phash: string }[]; now: Date },
): CheckResult {
  const flags: EvidenceFlag[] = [];
  let cell: string | null = null;

  const hasGps =
    facts.latitude !== undefined && facts.longitude !== undefined && Math.abs(facts.latitude) <= 90 && Math.abs(facts.longitude) <= 180;
  if (!hasGps) flags.push("no_gps");
  else {
    cell = latLngToCell(facts.latitude!, facts.longitude!, EVIDENCE_RESOLUTION);
    if (!ctx.cells.has(cell)) flags.push("out_of_zone");
  }

  if (!facts.capturedAt || Number.isNaN(facts.capturedAt.getTime())) flags.push("no_date");
  else {
    // EXIF dates have no time zone; one day of tolerance covers any offset.
    if (facts.capturedAt.getTime() > ctx.now.getTime() + 86_400_000) flags.push("future_date");
    if (ctx.now.getTime() - facts.capturedAt.getTime() > MAX_AGE_DAYS * 86_400_000) flags.push("too_old");
  }

  const duplicate = ctx.existing.find((e) => hammingDistance(e.phash, facts.phash) <= DUPLICATE_DISTANCE);
  if (duplicate) flags.push("duplicate");

  return { cell, flags, duplicateOf: duplicate?.id ?? null, accepted: flags.length === 0 };
}
