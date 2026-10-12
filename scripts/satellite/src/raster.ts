import { fromUrl, type GeoTIFFImage } from "geotiff";
import { latLngToCell } from "h3-js";
import proj4 from "proj4";

import { DEFAULT_SCALING, type BandScaling } from "./ndvi.ts";
import { BANDS, epsgOf, type StacItem } from "./stac.ts";
import { H3_RESOLUTION } from "./zones.ts";

export interface PixelSample {
  red: number;
  nir: number;
  scl: number;
}

interface Window {
  image: GeoTIFFImage;
  x0: number;
  y0: number;
  width: number;
  height: number;
  originX: number;
  originY: number;
  resX: number;
  resY: number; // positive, pixels go down
}

/** proj4 definition for a WGS84 UTM EPSG code (326xx north, 327xx south). */
export function utmDefinition(epsg: number): string {
  const north = epsg >= 32601 && epsg <= 32660;
  const south = epsg >= 32701 && epsg <= 32760;
  if (!north && !south) throw new Error(`Unsupported projection EPSG:${epsg}`);
  const zone = epsg % 100;
  return `+proj=utm +zone=${zone}${south ? " +south" : ""} +datum=WGS84 +units=m +no_defs`;
}

async function openWindow(href: string, minX: number, minY: number, maxX: number, maxY: number): Promise<Window> {
  const tiff = await fromUrl(href, { allowFullFile: false });
  const image = await tiff.getImage();
  const [originX, , , originY] = image.getBoundingBox() as [number, number, number, number];
  const [resX, resYNeg] = image.getResolution() as [number, number];
  const resY = Math.abs(resYNeg);
  const x0 = Math.max(0, Math.floor((minX - originX) / resX));
  const y0 = Math.max(0, Math.floor((originY - maxY) / resY));
  const x1 = Math.min(image.getWidth(), Math.ceil((maxX - originX) / resX));
  const y1 = Math.min(image.getHeight(), Math.ceil((originY - minY) / resY));
  if (x1 <= x0 || y1 <= y0) throw new Error("Zone outside of the scene footprint");
  return { image, x0, y0, width: x1 - x0, height: y1 - y0, originX, originY, resX, resY };
}

async function readBand(w: Window): Promise<ArrayLike<number>> {
  const rasters = await w.image.readRasters({
    window: [w.x0, w.y0, w.x0 + w.width, w.y0 + w.height],
    samples: [0],
    interleave: false,
  });
  return (rasters as unknown as ArrayLike<number>[])[0]!;
}

export function scalingOf(item: StacItem, band: string): BandScaling {
  const rb = item.assets[band]?.["raster:bands"]?.[0];
  return { scale: rb?.scale ?? DEFAULT_SCALING.scale, offset: rb?.offset ?? DEFAULT_SCALING.offset };
}

/**
 * Raw red, nir and SCL values of every 10 m pixel whose centre falls in one of `cells`.
 * Only the window covering `bbox` is downloaded (HTTP range requests on Cloud-Optimized GeoTIFFs).
 */
export async function sampleZone(
  item: StacItem,
  cells: ReadonlySet<string>,
  bbox: [number, number, number, number],
): Promise<PixelSample[]> {
  const redHref = item.assets[BANDS.red]?.href;
  const nirHref = item.assets[BANDS.nir]?.href;
  const sclHref = item.assets[BANDS.mask]?.href;
  if (!redHref || !nirHref || !sclHref) throw new Error(`Missing bands in ${item.id}`);

  const toUtm = proj4("EPSG:4326", utmDefinition(epsgOf(item)));
  const corners = [
    toUtm.forward([bbox[0], bbox[1]]),
    toUtm.forward([bbox[0], bbox[3]]),
    toUtm.forward([bbox[2], bbox[1]]),
    toUtm.forward([bbox[2], bbox[3]]),
  ];
  const xs = corners.map((c) => c[0]!);
  const ys = corners.map((c) => c[1]!);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];

  const [redW, nirW, sclW] = await Promise.all([
    openWindow(redHref, minX, minY, maxX, maxY),
    openWindow(nirHref, minX, minY, maxX, maxY),
    openWindow(sclHref, minX, minY, maxX, maxY),
  ]);
  if (redW.width !== nirW.width || redW.height !== nirW.height || redW.x0 !== nirW.x0) {
    throw new Error(`Red and NIR grids differ in ${item.id}`);
  }
  const [red, nir, scl] = await Promise.all([readBand(redW), readBand(nirW), readBand(sclW)]);

  const samples: PixelSample[] = [];
  for (let j = 0; j < redW.height; j++) {
    for (let i = 0; i < redW.width; i++) {
      const x = redW.originX + (redW.x0 + i + 0.5) * redW.resX;
      const y = redW.originY - (redW.y0 + j + 0.5) * redW.resY;
      const [lon, lat] = toUtm.inverse([x, y]) as [number, number];
      if (!cells.has(latLngToCell(lat, lon, H3_RESOLUTION))) continue;

      const si = Math.floor((x - sclW.originX) / sclW.resX) - sclW.x0;
      const sj = Math.floor((sclW.originY - y) / sclW.resY) - sclW.y0;
      if (si < 0 || sj < 0 || si >= sclW.width || sj >= sclW.height) continue;

      const k = j * redW.width + i;
      samples.push({ red: red[k]!, nir: nir[k]!, scl: scl[sj * sclW.width + si]! });
    }
  }
  return samples;
}
