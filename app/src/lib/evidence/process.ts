import "server-only";

import exifr from "exifr";
import sharp from "sharp";
import { sha256 } from "../content/store";
import { checkPhoto, dHash } from "./checks";
import { type EvidenceRecord, listEvidence, saveEvidence } from "./store";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 2048;

export class InvalidFileError extends Error {}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * F4 pipeline. Invalid files (not a real JPEG, too big, undecodable) are refused and never stored.
 * Valid photos are stored even when a check fails, with the flag, so the report can show it.
 */
export async function processEvidence(input: Uint8Array, projectId: number, cells: readonly string[]): Promise<EvidenceRecord> {
  if (input.length === 0 || input.length > MAX_UPLOAD_BYTES) throw new InvalidFileError("size");
  // The real type is read from the bytes, never from the file name or the declared MIME type.
  if (!isJpeg(input)) throw new InvalidFileError("type");

  const exif = (await exifr.parse(Buffer.from(input), { gps: true, pick: ["DateTimeOriginal", "CreateDate", "GPSLatitude", "GPSLongitude", "GPSLatitudeRef", "GPSLongitudeRef"] }).catch(() => null)) as
    | { latitude?: number; longitude?: number; DateTimeOriginal?: Date; CreateDate?: Date }
    | null;

  let stored: Buffer;
  let gray: Buffer;
  try {
    // Re-encoding drops every metadata block (EXIF, XMP, maker notes) from the stored file (spec 10.3).
    stored = await sharp(input, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    gray = await sharp(stored).grayscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  } catch {
    throw new InvalidFileError("decode");
  }

  const phash = dHash(new Uint8Array(gray));
  const existing = await listEvidence(projectId);
  const capturedAt = exif?.DateTimeOriginal ?? exif?.CreateDate;
  const result = checkPhoto(
    { latitude: exif?.latitude, longitude: exif?.longitude, capturedAt, phash },
    { cells: new Set(cells), existing: existing.map((e) => ({ id: e.id, phash: e.phash })), now: new Date() },
  );

  const round = (v: number) => Math.round(v * 1e5) / 1e5;
  return saveEvidence(new Uint8Array(stored), {
    id: sha256(stored),
    projectId,
    phash,
    cell: result.cell,
    gps: exif?.latitude !== undefined && exif.longitude !== undefined ? [round(exif.latitude), round(exif.longitude)] : null,
    capturedAt: capturedAt instanceof Date && !Number.isNaN(capturedAt.getTime()) ? capturedAt.toISOString() : null,
    uploadedAt: new Date().toISOString(),
    flags: result.flags,
    duplicateOf: result.duplicateOf,
    accepted: result.accepted,
  });
}
