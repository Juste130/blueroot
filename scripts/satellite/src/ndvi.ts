/**
 * Pure NDVI computations. No I/O here: everything is unit-tested.
 */

/**
 * Sentinel-2 Scene Classification (SCL) classes kept as valid observations.
 * 4 vegetation, 5 not vegetated, 7 unclassified.
 * Excluded: 0 no data, 1 saturated, 2 dark/topographic shadow, 3 cloud shadow, 6 water (tide noise on
 * mudflats), 8-9 clouds, 10 cirrus, 11 snow.
 */
export const SCL_VALID_CLASSES: readonly number[] = [4, 5, 7];

export interface BandScaling {
  scale: number;
  offset: number;
}

/** Collection 1 L2A default: reflectance = DN * 0.0001 - 0.1. */
export const DEFAULT_SCALING: BandScaling = { scale: 0.0001, offset: -0.1 };

/** NDVI of one pixel from raw digital numbers, or null if the pixel is unusable. */
export function pixelNdvi(redDn: number, nirDn: number, scaling: BandScaling = DEFAULT_SCALING): number | null {
  if (redDn === 0 || nirDn === 0) return null; // nodata
  const red = redDn * scaling.scale + scaling.offset;
  const nir = nirDn * scaling.scale + scaling.offset;
  const sum = nir + red;
  if (sum <= 0) return null;
  const ndvi = (nir - red) / sum;
  return Math.max(-1, Math.min(1, ndvi));
}

export interface SceneStats {
  meanNdvi: number;
  validPixels: number;
  totalPixels: number;
  validFraction: number;
}

/**
 * Mean NDVI over the zone pixels of one scene.
 * @param samples one entry per pixel inside the zone: raw red, raw nir and SCL class.
 */
export function sceneStats(
  samples: ReadonlyArray<{ red: number; nir: number; scl: number }>,
  scaling: BandScaling = DEFAULT_SCALING,
): SceneStats {
  let sum = 0;
  let valid = 0;
  for (const s of samples) {
    if (!SCL_VALID_CLASSES.includes(s.scl)) continue;
    const v = pixelNdvi(s.red, s.nir, scaling);
    if (v === null) continue;
    sum += v;
    valid++;
  }
  const total = samples.length;
  return {
    meanNdvi: valid === 0 ? Number.NaN : sum / valid,
    validPixels: valid,
    totalPixels: total,
    validFraction: total === 0 ? 0 : valid / total,
  };
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export interface Observation {
  date: string; // YYYY-MM-DD
  meanNdvi: number;
}

export interface MonthlyValue {
  month: string; // YYYY-MM
  ndvi: number;
  scenes: number;
}

/** Monthly median composite: robust to residual clouds and tide effects. */
export function monthlyMedian(observations: readonly Observation[]): MonthlyValue[] {
  const byMonth = new Map<string, number[]>();
  for (const o of observations) {
    const month = o.date.slice(0, 7);
    const list = byMonth.get(month) ?? [];
    list.push(o.meanNdvi);
    byMonth.set(month, list);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => ({ month, ndvi: median(values), scenes: values.length }));
}

/** Median of monthly values whose month falls in [from, to] (inclusive, YYYY-MM). */
export function windowMedian(monthly: readonly MonthlyValue[], from: string, to: string): number {
  return median(monthly.filter((m) => m.month >= from && m.month <= to).map((m) => m.ndvi));
}
