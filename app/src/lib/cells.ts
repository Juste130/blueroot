import { cellToBoundary, cellToLatLng } from "h3-js";

export interface CellZone {
  slug: string;
  name: string;
  cells: string[];
  /** Cells registered on-chain (gold outline) or candidate zone (dashed). */
  anchored: boolean;
}

/** GeoJSON features, one polygon per H3 cell, ring closed, [lon, lat] order. */
export function cellsToGeoJson(zones: readonly CellZone[]) {
  return {
    type: "FeatureCollection" as const,
    features: zones.flatMap((z) =>
      z.cells.map((cell) => {
        const ring = cellToBoundary(cell, true);
        return {
          type: "Feature" as const,
          properties: { slug: z.slug, name: z.name, cell, anchored: z.anchored },
          geometry: { type: "Polygon" as const, coordinates: [[...ring, ring[0]!]] },
        };
      }),
    ),
  };
}

export function boundsOf(cells: readonly string[]): [[number, number], [number, number]] | undefined {
  if (cells.length === 0) return undefined;
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const cell of cells) {
    for (const [lon, lat] of cellToBoundary(cell, true)) {
      minLon = Math.min(minLon, lon!);
      maxLon = Math.max(maxLon, lon!);
      minLat = Math.min(minLat, lat!);
      maxLat = Math.max(maxLat, lat!);
    }
  }
  return [[minLon, minLat], [maxLon, maxLat]];
}

/**
 * SVG paths of the cells in a local equirectangular projection. Used as a static footprint (thumbnails,
 * no-WebGL fallback, print) so the shape of a zone is visible without loading the map.
 */
export function footprintPaths(cells: readonly string[], size = 100): { paths: string[]; width: number; height: number } {
  if (cells.length === 0) return { paths: [], width: size, height: size };
  const [lat0] = cellToLatLng(cells[0]!);
  const k = Math.cos((lat0 * Math.PI) / 180);
  const rings = cells.map((c) => cellToBoundary(c, true).map(([lon, lat]) => [lon! * k, -lat!] as const));
  const xs = rings.flat().map((p) => p[0]);
  const ys = rings.flat().map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = size / Math.max(maxX - minX, maxY - minY);
  const width = (maxX - minX) * scale;
  const height = (maxY - minY) * scale;
  const paths = rings.map(
    (ring) => `M${ring.map(([x, y]) => `${((x - minX) * scale).toFixed(2)},${((y - minY) * scale).toFixed(2)}`).join("L")}Z`,
  );
  return { paths, width, height };
}
