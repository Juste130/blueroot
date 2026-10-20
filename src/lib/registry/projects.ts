import "server-only";

import { cellArea, UNITS } from "h3-js";
import { getJson } from "../content/store";
import { type ZoneSeries, getZoneSeries, listZoneSeries } from "../satellite";
import { type ProjectMetadata, ProjectMetadataSchema } from "../schemas";
import { type RegistrySnapshot, getRegistry, stateOf } from "./indexer";
import type { Claim, Project, RegistryState } from "./state";

export interface SatelliteSummary {
  zoneId: string;
  hash: `0x${string}`;
  score: number;
  baseline: number | null;
  latest: number | null;
  delta: number | null;
  monthly: { month: string; ndvi: number; scenes: number }[];
  baselineWindow: { from: string; to: string };
  latestWindow: { from: string; to: string };
  scenesAccepted: number;
  scenesConsidered: number;
}

export interface ProjectView {
  /** On-chain id, or null for a demonstration zone not yet registered. */
  id: number | null;
  slug: string;
  name: string;
  place: string;
  cells: string[];
  areaHa: number;
  status: "active" | "closed" | "candidate";
  metadataHash?: `0x${string}`;
  metadataVerified: boolean;
  metadata?: ProjectMetadata;
  chain?: Project;
  claims: Claim[];
  satellite?: SatelliteSummary;
}

function areaOf(cells: readonly string[]): number {
  return cells.reduce((s, c) => s + cellArea(c, UNITS.m2), 0) / 10_000;
}

function summarize(z: ZoneSeries): SatelliteSummary {
  const { summary, monthly, parameters } = z.series;
  return {
    zoneId: z.id,
    hash: z.hash,
    score: summary.satelliteScore,
    baseline: summary.baselineNdvi,
    latest: summary.latestNdvi,
    delta: summary.delta,
    monthly,
    baselineWindow: parameters.baselineWindow,
    latestWindow: parameters.latestWindow,
    scenesAccepted: summary.scenesAccepted,
    scenesConsidered: summary.scenesConsidered,
  };
}

function candidate(z: ZoneSeries): ProjectView {
  const [place = z.series.zone.name, commune = ""] = z.series.zone.name.replace(")", "").split(" (");
  return {
    id: null,
    slug: z.id,
    name: z.series.zone.name,
    place: commune ? `${place}, ${commune}` : place,
    cells: z.series.zone.cells,
    areaHa: z.series.zone.areaHa,
    status: "candidate",
    metadataVerified: false,
    claims: [],
    satellite: summarize(z),
  };
}

async function fromChain(p: Project, state: RegistryState): Promise<ProjectView> {
  const doc = await getJson(p.metadataHash, (v) => ProjectMetadataSchema.parse(v));
  const claims = state.claims.filter((c) => c.projectId === p.id).sort((a, b) => b.id - a.id);
  // Satellite evidence: the series anchored with the latest claim, else the zone named in the metadata.
  const zone = (claims[0] && getZoneSeries(claims[0].satelliteHash)) ?? (doc?.data.satelliteZone ? getZoneSeries(doc.data.satelliteZone) : undefined);
  return {
    id: p.id,
    slug: String(p.id),
    name: doc?.data.name ?? `Projet #${p.id}`,
    place: doc ? `${doc.data.location.place}, ${doc.data.location.commune}` : "",
    cells: p.cells,
    areaHa: areaOf(p.cells),
    status: p.status,
    metadataHash: p.metadataHash,
    metadataVerified: Boolean(doc),
    metadata: doc?.data,
    chain: p,
    claims,
    satellite: zone ? summarize(zone) : undefined,
  };
}

export interface RegistryView {
  snapshot: RegistrySnapshot;
  state: RegistryState;
  projects: ProjectView[];
}

/**
 * Projects shown by the app: registered projects first, then the demonstration zones not registered
 * yet, labelled as candidates. Nothing is presented as on-chain when it is not.
 */
export async function getRegistryView(): Promise<RegistryView> {
  const snapshot = await getRegistry();
  const state = stateOf(snapshot);
  const onChain = await Promise.all(state.projects.map((p) => fromChain(p, state)));
  const registeredZones = new Set(onChain.map((p) => p.satellite?.zoneId).filter(Boolean));
  const candidates = listZoneSeries().filter((z) => !registeredZones.has(z.id)).map(candidate);
  return { snapshot, state, projects: [...onChain.sort((a, b) => (b.id ?? 0) - (a.id ?? 0)), ...candidates] };
}

export async function getProjectView(slug: string): Promise<(RegistryView & { project: ProjectView }) | undefined> {
  const view = await getRegistryView();
  const project = view.projects.find((p) => p.slug === slug);
  return project ? { ...view, project } : undefined;
}
