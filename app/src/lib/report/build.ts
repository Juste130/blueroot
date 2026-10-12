import "server-only";

import { ApiError } from "../api";
import { putPublicDocument } from "../content/store";
import { listEvidence } from "../evidence/store";
import { getProjectView } from "../registry/projects";
import { THRESHOLD, WEIGHTS, combinedScore, fieldScore } from "../score";
import { PROMPT_VERSION, assess } from "./ai";
import { REPORT_SCHEMA, type Report, ReportSchema } from "./schema";

/**
 * Builds the verification report of a project for a monitoring period (F6): satellite series,
 * evidence checks, AI assessment and combined score. The result is published on public IPFS; its
 * hash is what validators vote on.
 */
export async function buildReport(projectId: number, periodStart: number, periodEnd: number): Promise<{ report: Report; hash: `0x${string}`; cid: string }> {
  const view = await getProjectView(String(projectId));
  const project = view?.project;
  if (!project?.chain || project.status !== "active") throw new ApiError(404, "unknown_project");
  if (!project.metadataHash || !project.metadataVerified) throw new ApiError(409, "metadata_unverified");
  if (!project.satellite) throw new ApiError(409, "no_satellite_series");
  const now = Math.floor(Date.now() / 1000);
  if (periodStart < project.chain.registeredAt || periodEnd <= periodStart || periodEnd > now) throw new ApiError(400, "invalid_period");

  const evidence = await listEvidence(projectId);
  const accepted = evidence.filter((e) => e.accepted);
  const stats = {
    submitted: evidence.length,
    accepted: accepted.length,
    coveredCells: new Set(accepted.map((e) => e.cell)).size,
    totalCells: project.cells.length,
  };
  if (stats.submitted === 0) throw new ApiError(409, "no_evidence");
  const field = fieldScore(stats);
  const s = project.satellite;

  const satellite = {
    hash: s.hash,
    zoneId: s.zoneId,
    score: s.score,
    baselineNdvi: s.baseline,
    latestNdvi: s.latest,
    baselineWindow: s.baselineWindow,
    latestWindow: s.latestWindow,
  };
  const items = evidence.map((e) => ({ sha256: e.id, cell: e.cell, capturedAt: e.capturedAt, flags: e.flags }));

  // The model sees facts and check results only: no photo, no name, no wallet address.
  const { assessment, model } = await assess({
    project: { cells: project.cells.length, areaHa: Math.round(project.areaHa * 10) / 10, place: project.place },
    period: { start: new Date(periodStart * 1000).toISOString(), end: new Date(periodEnd * 1000).toISOString() },
    satellite: { ...satellite, monthly: s.monthly },
    evidence: { ...stats, fieldScore: field, items },
  });

  const scores = { satellite: s.score, field, ai: assessment.consistencyScore };
  const report: Report = ReportSchema.parse({
    schemaVersion: REPORT_SCHEMA,
    projectId,
    projectMetadataHash: project.metadataHash,
    period: { start: periodStart, end: periodEnd },
    satellite,
    evidence: { ...stats, items, score: field },
    ai: { provider: "anthropic", model, promptVersion: PROMPT_VERSION, generatedAt: new Date().toISOString(), assessment },
    scores: {
      ...scores,
      combined: combinedScore(scores),
      weights: { ...WEIGHTS },
      threshold: THRESHOLD,
      note: "Demonstration weights and threshold, to be calibrated with experts.",
    },
    createdAt: new Date().toISOString(),
  });
  const { hash, cid } = await putPublicDocument(report, `report-${projectId}-${periodEnd}`);
  return { report, hash, cid };
}
