import { z } from "zod";

/** Text in both interface languages (the report is public and read by the jury, validators and communities). */
const bilingual = (max: number) => z.object({ fr: z.string().trim().min(1).max(max), en: z.string().trim().min(1).max(max) }).strict();

/**
 * What the model must return (F6). Anything else is rejected and logged: the AI never writes free
 * text into the registry. It gives an opinion; humans decide.
 */
export const AiAssessmentSchema = z
  .object({
    consistencyScore: z.number().int().min(0).max(100),
    summary: bilingual(900),
    strengths: z.array(bilingual(300)).max(6),
    inconsistencies: z
      .array(z.object({ severity: z.enum(["low", "medium", "high"]), description: bilingual(400) }).strict())
      .max(10),
    recommendation: z.enum(["approve", "review", "reject"]),
  })
  .strict();
export type AiAssessment = z.infer<typeof AiAssessmentSchema>;

export const REPORT_SCHEMA = "blueroot.report/1" as const;

const hex32 = z.string().regex(/^0x[0-9a-f]{64}$/);

export const ReportSchema = z
  .object({
    schemaVersion: z.literal(REPORT_SCHEMA),
    projectId: z.number().int().positive(),
    projectMetadataHash: hex32,
    period: z.object({ start: z.number().int(), end: z.number().int() }).strict(),
    satellite: z
      .object({
        hash: hex32,
        zoneId: z.string(),
        score: z.number().int().min(0).max(100),
        baselineNdvi: z.number().nullable(),
        latestNdvi: z.number().nullable(),
        baselineWindow: z.object({ from: z.string(), to: z.string() }),
        latestWindow: z.object({ from: z.string(), to: z.string() }),
      })
      .strict(),
    evidence: z
      .object({
        submitted: z.number().int().nonnegative(),
        accepted: z.number().int().nonnegative(),
        coveredCells: z.number().int().nonnegative(),
        totalCells: z.number().int().positive(),
        /** Private photos are referenced by the sha256 of their bytes only. */
        items: z.array(
          z
            .object({
              sha256: hex32,
              cell: z.string().nullable(),
              capturedAt: z.string().nullable(),
              flags: z.array(z.string()),
            })
            .strict(),
        ),
        score: z.number().int().min(0).max(100),
      })
      .strict(),
    ai: z
      .object({
        /** "fixture": local test data written by scripts/demo.ts, never produced by an AI and never anchorable by the server. */
        provider: z.enum(["anthropic", "fixture"]),
        model: z.string(),
        promptVersion: z.string(),
        generatedAt: z.string().datetime(),
        assessment: AiAssessmentSchema,
      })
      .strict(),
    scores: z
      .object({
        satellite: z.number().int(),
        field: z.number().int(),
        ai: z.number().int(),
        combined: z.number().int().min(0).max(100),
        weights: z.object({ satellite: z.number(), field: z.number(), ai: z.number() }).strict(),
        threshold: z.number().int(),
        note: z.string(),
      })
      .strict(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type Report = z.infer<typeof ReportSchema>;
