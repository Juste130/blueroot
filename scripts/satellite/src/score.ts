/**
 * Satellite score (0-100). DEMONSTRATION ASSUMPTIONS, to be calibrated with experts (spec section 6).
 * NDVI measures vegetation vigour, not carbon: the score only says "the mangrove is there and healthy".
 *
 *   level = clamp((latest - LEVEL_FLOOR) / (LEVEL_FULL - LEVEL_FLOOR))   dense mangrove canopy ~ 0.6+
 *   trend = clamp(0.5 + (latest - baseline) / (2 * TREND_FULL))           0 change -> 0.5, +0.1 -> 1
 *   score = round(100 * (LEVEL_WEIGHT * level + TREND_WEIGHT * trend))
 */
export const SCORING = {
  levelFloor: 0.2,
  levelFull: 0.6,
  trendFull: 0.1,
  levelWeight: 0.6,
  trendWeight: 0.4,
} as const;

export interface SatelliteScore {
  levelScore: number;
  trendScore: number;
  satelliteScore: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function satelliteScore(baselineNdvi: number, latestNdvi: number): SatelliteScore {
  if (!Number.isFinite(baselineNdvi) || !Number.isFinite(latestNdvi)) {
    return { levelScore: 0, trendScore: 0, satelliteScore: 0 };
  }
  const level = clamp01((latestNdvi - SCORING.levelFloor) / (SCORING.levelFull - SCORING.levelFloor));
  const trend = clamp01(0.5 + (latestNdvi - baselineNdvi) / (2 * SCORING.trendFull));
  return {
    levelScore: Math.round(level * 100),
    trendScore: Math.round(trend * 100),
    satelliteScore: Math.round(100 * (SCORING.levelWeight * level + SCORING.trendWeight * trend)),
  };
}
