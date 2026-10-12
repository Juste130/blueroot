import { z } from "zod";

export const NDVI_SCHEMA_VERSION = "blueroot.ndvi/1" as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoMonth = z.string().regex(/^\d{4}-\d{2}$/);
const ndvi = z.number().min(-1).max(1);
const h3Cell = z.string().regex(/^8a[0-9a-f]{13}$/, "H3 resolution-10 cell");

/** Versioned NDVI series. Its sha256 is anchored on-chain as `satelliteHash`. */
export const NdviSeriesSchema = z
  .object({
    schemaVersion: z.literal(NDVI_SCHEMA_VERSION),
    zone: z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      name: z.string().min(1),
      h3Resolution: z.literal(10),
      cells: z.array(h3Cell).min(1),
      areaHa: z.number().positive(),
    }),
    source: z.object({
      provider: z.string(),
      stacApi: z.string().url(),
      collection: z.string(),
      license: z.string(),
      bands: z.object({ red: z.string(), nir: z.string(), mask: z.string() }),
    }),
    parameters: z.object({
      period: z.object({ from: isoDate, to: isoDate }),
      maxCloudCover: z.number().min(0).max(100),
      minValidFraction: z.number().min(0).max(1),
      sclValidClasses: z.array(z.number().int()),
      aggregation: z.literal("monthly-median"),
      baselineWindow: z.object({ from: isoMonth, to: isoMonth }),
      latestWindow: z.object({ from: isoMonth, to: isoMonth }),
      scoring: z.object({
        levelFloor: z.number(),
        levelFull: z.number(),
        trendFull: z.number(),
        levelWeight: z.number(),
        trendWeight: z.number(),
      }),
    }),
    observations: z.array(
      z.object({
        date: isoDate,
        sceneId: z.string(),
        meanNdvi: ndvi,
        validFraction: z.number().min(0).max(1),
        validPixels: z.number().int().nonnegative(),
      }),
    ),
    monthly: z.array(z.object({ month: isoMonth, ndvi, scenes: z.number().int().positive() })),
    summary: z.object({
      scenesConsidered: z.number().int().nonnegative(),
      scenesAccepted: z.number().int().nonnegative(),
      scenesFailed: z.number().int().nonnegative(),
      baselineNdvi: ndvi.nullable(),
      latestNdvi: ndvi.nullable(),
      delta: z.number().nullable(),
      levelScore: z.number().int().min(0).max(100),
      trendScore: z.number().int().min(0).max(100),
      satelliteScore: z.number().int().min(0).max(100),
    }),
    generator: z.object({ name: z.string(), version: z.string() }),
    generatedAt: z.string().datetime(),
  })
  .strict();

export type NdviSeries = z.infer<typeof NdviSeriesSchema>;
