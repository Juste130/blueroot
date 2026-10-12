import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { UNITS, cellArea, cellToBoundary, polygonToCells } from "h3-js";

export const H3_RESOLUTION = 10;

/** Demonstration zone: a mapped mangrove polygon (OpenStreetMap, ODbL) and its H3 cells. */
export interface Zone {
  id: string;
  name: string;
  context: string;
  source: string;
  license: string;
  geometry: { type: "MultiPolygon"; coordinates: number[][][][] };
  /** Sorted H3 resolution-10 cells whose centre falls inside the polygon. */
  cells: string[];
  /** Exact area of those cells, in hectares. */
  areaHa: number;
}

interface ZoneFeature {
  properties: { id: string; name: string; context: string; source: string; license: string };
  geometry: Zone["geometry"];
}

const ZONES_DIR = fileURLToPath(new URL("../zones", import.meta.url));

/** Cells of a GeoJSON MultiPolygon (centre containment), sorted and de-duplicated. */
export function cellsOfMultiPolygon(coordinates: number[][][][]): string[] {
  const set = new Set<string>();
  for (const polygon of coordinates) {
    for (const cell of polygonToCells(polygon, H3_RESOLUTION, true)) set.add(cell);
  }
  return [...set].sort();
}

export function areaHaOf(cells: readonly string[]): number {
  return cells.reduce((sum, c) => sum + cellArea(c, UNITS.m2), 0) / 10_000;
}

export function loadZone(id: string): Zone {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Invalid zone id: ${id}`);
  const feature = JSON.parse(readFileSync(join(ZONES_DIR, `${id}.geojson`), "utf8")) as ZoneFeature;
  const cells = cellsOfMultiPolygon(feature.geometry.coordinates);
  if (cells.length === 0) throw new Error(`Zone ${id} contains no H3 cell at resolution ${H3_RESOLUTION}`);
  return { ...feature.properties, geometry: feature.geometry, cells, areaHa: areaHaOf(cells) };
}

export function listZoneIds(): string[] {
  return readdirSync(ZONES_DIR)
    .filter((f) => f.endsWith(".geojson"))
    .map((f) => f.replace(/\.geojson$/, ""))
    .sort();
}

/** [minLon, minLat, maxLon, maxLat] of the zone cells (not just the polygon), with a margin in degrees. */
export function cellsBbox(cells: readonly string[], margin = 0.0005): [number, number, number, number] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const c of cells) {
    for (const [lat, lon] of cellToBoundary(c)) {
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }
  return [minLon - margin, minLat - margin, maxLon + margin, maxLat + margin];
}
