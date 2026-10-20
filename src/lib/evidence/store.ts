import "server-only";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listFiles, privateLink, uploadFile } from "../content/pinata";
import { pinataConfigured } from "../content/store";
import type { EvidenceFlag } from "./checks";

/**
 * Index of field evidence. Raw photos are private (spec 10.5): on Pinata's private network, with the
 * check results stored as the file's key-values, so no database is needed. The uploader's identity
 * is never stored. Without Pinata (local development) files go to .data/evidence/.
 */
export interface EvidenceRecord {
  id: string; // sha256 of the stored (metadata-stripped) bytes
  projectId: number;
  cid: string | null;
  phash: string;
  cell: string | null;
  /** Rounded to 5 decimals (about 1 m), enough to check the zone. */
  gps: [number, number] | null;
  capturedAt: string | null;
  uploadedAt: string;
  flags: EvidenceFlag[];
  duplicateOf: string | null;
  accepted: boolean;
}

const LOCAL_DIR = join(process.cwd(), ".data", "evidence");
const indexFile = (projectId: number) => join(LOCAL_DIR, `project-${projectId}.json`);

function toKeyvalues(r: EvidenceRecord): Record<string, string> {
  return {
    kind: "evidence",
    project: String(r.projectId),
    sha256: r.id,
    phash: r.phash,
    cell: r.cell ?? "",
    gps: r.gps ? r.gps.join(",") : "",
    captured: r.capturedAt ?? "",
    flags: r.flags.join(","),
    dup: r.duplicateOf ?? "",
  };
}

function fromKeyvalues(kv: Record<string, string>, cid: string, createdAt: string): EvidenceRecord {
  const flags = (kv.flags ? kv.flags.split(",") : []) as EvidenceFlag[];
  const gps = kv.gps ? (kv.gps.split(",").map(Number) as [number, number]) : null;
  return {
    id: kv.sha256 ?? "",
    projectId: Number(kv.project),
    cid,
    phash: kv.phash ?? "",
    cell: kv.cell || null,
    gps,
    capturedAt: kv.captured || null,
    uploadedAt: createdAt,
    flags,
    duplicateOf: kv.dup || null,
    accepted: flags.length === 0,
  };
}

export async function listEvidence(projectId: number): Promise<EvidenceRecord[]> {
  if (pinataConfigured()) {
    const files = await listFiles("private", { kind: "evidence", project: String(projectId) });
    return files.map((f) => fromKeyvalues(f.keyvalues, f.cid, f.created_at));
  }
  const file = indexFile(projectId);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as EvidenceRecord[]) : [];
}

export async function saveEvidence(bytes: Uint8Array<ArrayBuffer>, record: Omit<EvidenceRecord, "cid">): Promise<EvidenceRecord> {
  if (pinataConfigured()) {
    const full = { ...record, cid: null };
    const file = await uploadFile(bytes, { name: `evidence-${record.projectId}-${record.id.slice(2, 14)}.jpg`, type: "image/jpeg", network: "private", keyvalues: toKeyvalues(full) });
    return { ...full, cid: file.cid };
  }
  if (process.env.NODE_ENV === "production") throw new Error("PINATA_JWT is required in production");
  mkdirSync(LOCAL_DIR, { recursive: true });
  writeFileSync(join(LOCAL_DIR, `${record.id.slice(2)}.jpg`), bytes);
  const saved: EvidenceRecord = { ...record, cid: null };
  const all = await listEvidence(record.projectId);
  writeFileSync(indexFile(record.projectId), JSON.stringify([...all, saved], null, 2));
  return saved;
}

/** Time-limited URL to look at a raw photo (validators and the project's proponent only). */
export async function evidenceUrl(record: EvidenceRecord): Promise<string> {
  if (record.cid) return privateLink(record.cid);
  return `/api/evidence/file/${record.id.slice(2)}?project=${record.projectId}`;
}

export function readLocalEvidence(sha256Hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/.test(sha256Hex)) return null;
  const file = join(LOCAL_DIR, `${sha256Hex}.jpg`);
  return existsSync(file) ? readFileSync(file) : null;
}
