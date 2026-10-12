import { round } from "./canonical.ts";
import { SCL_VALID_CLASSES, monthlyMedian, sceneStats, windowMedian } from "./ndvi.ts";
import { sampleZone, scalingOf } from "./raster.ts";
import { NDVI_SCHEMA_VERSION, NdviSeriesSchema, type NdviSeries } from "./schema.ts";
import { SCORING, satelliteScore } from "./score.ts";
import { BANDS, COLLECTION, STAC_API, searchScenes, type StacItem } from "./stac.ts";
import { cellsBbox, type Zone } from "./zones.ts";

export const GENERATOR = { name: "@blueroot/satellite", version: "1.0.0" } as const;

export interface ComputeOptions {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  maxCloudCover?: number;
  minValidFraction?: number;
  /** Months (YYYY-MM) used as baseline and latest windows. Default: first 3 and last 3 months. */
  baselineWindow?: { from: string; to: string };
  latestWindow?: { from: string; to: string };
  concurrency?: number;
  onProgress?: (done: number, total: number, item: StacItem, accepted: boolean) => void;
  onError?: (item: StacItem, error: Error) => void;
  now?: () => Date;
}

/** Run `fn` over `items` with bounded concurrency, preserving order of results. */
async function mapPool<T, R>(items: readonly T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** COG range requests occasionally fail on long runs; a transient error must not change the result. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 2_000 * 2 ** i));
    }
  }
  throw lastError;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export async function computeSeries(zone: Zone, options: ComputeOptions): Promise<NdviSeries> {
  const maxCloudCover = options.maxCloudCover ?? 60;
  const minValidFraction = options.minValidFraction ?? 0.5;
  const fromMonth = options.from.slice(0, 7);
  const toMonth = options.to.slice(0, 7);
  const baselineWindow = options.baselineWindow ?? { from: fromMonth, to: shiftMonth(fromMonth, 2) };
  const latestWindow = options.latestWindow ?? { from: shiftMonth(toMonth, -2), to: toMonth };

  const bbox = cellsBbox(zone.cells);
  const cellSet = new Set(zone.cells);
  // 1 ha = 100 Sentinel-2 pixels of 10 m. Measuring validity against the expected count (not the pixels
  // actually read) stays honest when a scene only partially covers the zone (tile edges).
  const expectedPixels = Math.round(zone.areaHa * 100);
  const scenes = await searchScenes({ bbox, from: options.from, to: options.to, maxCloudCover });

  let done = 0;
  let failed = 0;
  const results = await mapPool(scenes, options.concurrency ?? 4, async (item) => {
    let observation: NdviSeries["observations"][number] | null = null;
    try {
      const samples = await withRetry(() => sampleZone(item, cellSet, bbox));
      const stats = sceneStats(samples, scalingOf(item, BANDS.red));
      const validFraction = Math.min(1, stats.validPixels / expectedPixels);
      if (validFraction >= minValidFraction && Number.isFinite(stats.meanNdvi)) {
        observation = {
          date: item.properties.datetime.slice(0, 10),
          sceneId: item.id,
          meanNdvi: round(stats.meanNdvi),
          validFraction: round(validFraction, 3),
          validPixels: stats.validPixels,
        };
      }
    } catch (error) {
      // A failing scene is skipped, never invented, and counted in the summary.
      failed++;
      options.onError?.(item, error as Error);
    }
    options.onProgress?.(++done, scenes.length, item, observation !== null);
    return observation;
  });

  const observations = results.filter((o): o is NonNullable<typeof o> => o !== null);
  const monthly = monthlyMedian(observations).map((m) => ({ ...m, ndvi: round(m.ndvi) }));
  const baseline = windowMedian(monthly, baselineWindow.from, baselineWindow.to);
  const latest = windowMedian(monthly, latestWindow.from, latestWindow.to);
  const scores = satelliteScore(baseline, latest);
  const finite = (x: number) => (Number.isFinite(x) ? round(x) : null);

  const series: NdviSeries = {
    schemaVersion: NDVI_SCHEMA_VERSION,
    zone: { id: zone.id, name: zone.name, h3Resolution: 10, cells: zone.cells, areaHa: round(zone.areaHa, 2) },
    source: {
      provider: "Element84 Earth Search (AWS Open Data)",
      stacApi: STAC_API,
      collection: COLLECTION,
      license: "Contains modified Copernicus Sentinel data (free, full and open access)",
      bands: { red: "B04 (red)", nir: "B08 (nir)", mask: "SCL (scene classification)" },
    },
    parameters: {
      period: { from: options.from, to: options.to },
      maxCloudCover,
      minValidFraction,
      sclValidClasses: [...SCL_VALID_CLASSES],
      aggregation: "monthly-median",
      baselineWindow,
      latestWindow,
      scoring: { ...SCORING },
    },
    observations,
    monthly,
    summary: {
      scenesConsidered: scenes.length,
      scenesAccepted: observations.length,
      scenesFailed: failed,
      baselineNdvi: finite(baseline),
      latestNdvi: finite(latest),
      delta: Number.isFinite(baseline) && Number.isFinite(latest) ? round(latest - baseline) : null,
      ...scores,
    },
    generator: { ...GENERATOR },
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
  };
  return NdviSeriesSchema.parse(series);
}
