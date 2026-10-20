/**
 * Versioned schemas of the public documents whose sha256 is anchored on-chain (spec 10.5).
 * Personal data never appears in them: organisations are named, people are not.
 */
import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
const hex32 = z.string().regex(/^0x[0-9a-f]{64}$/, "sha256 hex digest");
export const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "EVM address");
export const h3CellSchema = z.string().regex(/^8a[0-9a-f]{13}$/, "H3 resolution-10 cell");

export const PROJECT_SCHEMA = "blueroot.project/1" as const;

export const ProjectMetadataSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_SCHEMA),
    name: text(80),
    description: text(1200),
    language: z.enum(["fr", "en"]),
    location: z.object({ place: text(80), commune: text(80), department: text(80), country: z.literal("BJ") }),
    /** Community organisation receiving the guaranteed share of every sale (no personal data). */
    community: z.object({ name: text(120) }),
    /** Pre-computed NDVI zone (scripts/satellite), if any. */
    satelliteZone: z.string().regex(/^[a-z0-9-]+$/).optional(),
    source: z.object({ description: text(200), license: text(80) }).optional(),
    cells: z.array(h3CellSchema).min(1).max(2000),
    createdAt: z.string().datetime(),
  })
  .strict();
export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;

export const RETIREMENT_SCHEMA = "blueroot.retirement/1" as const;

/** Public document behind `reasonHash` (F10). The beneficiary name is chosen by the buyer and public. */
export const RetirementReasonSchema = z
  .object({
    schemaVersion: z.literal(RETIREMENT_SCHEMA),
    beneficiaryName: text(120),
    reason: text(500),
    language: z.enum(["fr", "en"]),
    createdAt: z.string().datetime(),
  })
  .strict();
export type RetirementReason = z.infer<typeof RetirementReasonSchema>;

export { hex32 };
