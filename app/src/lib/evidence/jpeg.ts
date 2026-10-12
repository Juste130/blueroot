/**
 * Phones produce 3-6 MB photos; on a weak 3G link the field form compresses them first (spec 11).
 * Re-encoding through a canvas drops the EXIF block that the server needs (GPS position, capture
 * date), so it is copied from the original into the compressed JPEG, byte for byte. The orientation
 * tag is reset to 1 because the canvas has already applied the rotation.
 */

const SOI = 0xffd8;
const APP1 = 0xffe1;
const SOS = 0xffda;

/** The APP1 "Exif" segment of a JPEG (marker included), or null. */
export function extractExifSegment(jpeg: Uint8Array): Uint8Array | null {
  const view = new DataView(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength);
  if (jpeg.length < 4 || view.getUint16(0) !== SOI) return null;
  let offset = 2;
  while (offset + 4 <= jpeg.length) {
    const marker = view.getUint16(offset);
    if ((marker & 0xff00) !== 0xff00 || marker === SOS) return null;
    const length = view.getUint16(offset + 2);
    if (length < 2 || offset + 2 + length > jpeg.length) return null;
    const isExif =
      marker === APP1 &&
      length >= 8 &&
      jpeg[offset + 4] === 0x45 && // E
      jpeg[offset + 5] === 0x78 && // x
      jpeg[offset + 6] === 0x69 && // i
      jpeg[offset + 7] === 0x66; // f
    if (isExif) return jpeg.slice(offset, offset + 2 + length);
    offset += 2 + length;
  }
  return null;
}

/** Sets IFD0 Orientation (0x0112) to 1 in an APP1 Exif segment, in place. */
export function resetOrientation(segment: Uint8Array): void {
  const tiff = 10; // FF E1, length (2), "Exif\0\0" (6)
  if (segment.length < tiff + 8) return;
  const view = new DataView(segment.buffer, segment.byteOffset, segment.byteLength);
  const little = view.getUint16(tiff) === 0x4949;
  const ifd0 = tiff + view.getUint32(tiff + 4, little);
  if (ifd0 + 2 > segment.length) return;
  const entries = view.getUint16(ifd0, little);
  for (let i = 0; i < entries; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > segment.length) return;
    if (view.getUint16(entry, little) === 0x0112) {
      view.setUint16(entry + 8, 1, little); // SHORT value stored inline
      return;
    }
  }
}

/** Inserts an APP1 segment right after SOI, as the EXIF standard requires. */
export function insertExifSegment(jpeg: Uint8Array, segment: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(jpeg.length + segment.length);
  out.set(jpeg.subarray(0, 2), 0);
  out.set(segment, 2);
  out.set(jpeg.subarray(2), 2 + segment.length);
  return out;
}
