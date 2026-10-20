import "server-only";

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { type NdviSeries, NdviSeriesSchema } from "@blueroot/satellite/schema";
import { sha256 } from "./content/store";

const SATELLITE_DIR = join(process.cwd(), "scripts", "satellite");

export interface ZoneSeries {
  id: string;
  /** sha256 of the file bytes: the value anchored on-chain as `satelliteHash`. */
  hash: `0x${string}`;
  series: NdviSeries;
  context: string;
  source: string;
  license: string;
}

let cache: ZoneSeries[] | undefined;

/** Pre-computed NDVI series of the demonstration zones (F5), re-hashed from the file bytes. */
export function listZoneSeries(): ZoneSeries[] {
  if (cache) return cache;
  const dataDir = join(SATELLITE_DIR, "data");
  if (!existsSync(dataDir)) return (cache = []);
  cache = readdirSync(dataDir)
    .filter((id) => existsSync(join(dataDir, id, "ndvi-v1.json")))
    .map((id) => {
      const bytes = readFileSync(join(dataDir, id, "ndvi-v1.json"));
      const series = NdviSeriesSchema.parse(JSON.parse(bytes.toString("utf8")));
      const zoneFile = join(SATELLITE_DIR, "zones", `${id}.geojson`);
      const props = existsSync(zoneFile)
        ? (JSON.parse(readFileSync(zoneFile, "utf8")) as { properties: Record<string, string> }).properties
        : {};
      return {
        id,
        hash: sha256(bytes),
        series,
        context: props.context ?? "",
        source: props.source ?? "",
        license: props.license ?? "",
      };
    })
    .sort((a, b) => b.series.zone.areaHa - a.series.zone.areaHa);
  return cache;
}

export function getZoneSeries(idOrHash: string): ZoneSeries | undefined {
  const key = idOrHash.toLowerCase();
  return listZoneSeries().find((z) => z.id === key || z.hash === key);
}
