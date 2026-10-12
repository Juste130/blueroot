/**
 * Combined score (spec section 6). DEMONSTRATION ASSUMPTIONS, configurable and to be calibrated with
 * experts; the interface says so wherever a score is shown.
 *
 *   combined = 40 % satellite + 40 % field evidence + 20 % AI consistency, threshold 70
 *
 * The contract re-checks the threshold on-chain (`Verification.anchorReport`), so the app cannot
 * anchor a file below it even by mistake.
 */
export const WEIGHTS = { satellite: 0.4, field: 0.4, ai: 0.2 } as const;
export const THRESHOLD = 70;

/** Share of the project cells that must carry at least one accepted photo for full coverage. */
export const COVERAGE_TARGET = 0.1;
export const MIN_COVERED_CELLS = 3;

export interface FieldStats {
  submitted: number;
  accepted: number;
  coveredCells: number;
  totalCells: number;
}

/**
 * Field evidence score: half for the share of photos that pass every check (position, date,
 * uniqueness), half for the spread of accepted photos across the zone.
 */
export function fieldScore(s: FieldStats): number {
  if (s.submitted === 0 || s.totalCells === 0) return 0;
  const validity = s.accepted / s.submitted;
  const target = Math.min(s.totalCells, Math.max(MIN_COVERED_CELLS, Math.ceil(s.totalCells * COVERAGE_TARGET)));
  const coverage = Math.min(1, s.coveredCells / target);
  return Math.round(100 * (0.5 * validity + 0.5 * coverage));
}

export function combinedScore(scores: { satellite: number; field: number; ai: number }): number {
  for (const v of Object.values(scores)) if (!Number.isFinite(v) || v < 0 || v > 100) throw new RangeError("Scores must be within 0-100");
  return Math.round(WEIGHTS.satellite * scores.satellite + WEIGHTS.field * scores.field + WEIGHTS.ai * scores.ai);
}

/** Mirrors Verification.anchorReport: units of 0.01 ha-year = cells x cellArea x years x score / 100. */
export function expectedQuantity(cells: number, cellAreaCentiHa: number, periodSeconds: number, score: number): number {
  const YEAR = 365 * 24 * 60 * 60;
  return Math.floor((cells * cellAreaCentiHa * periodSeconds * score) / (YEAR * 100));
}
