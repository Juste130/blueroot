import "server-only";

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson } from "@blueroot/satellite/canonical";
import { cidFromSha256 } from "./cid";
import { uploadFile } from "./pinata";

export type Hex = `0x${string}`;

const APP_DIR = process.cwd();
/** Documents committed with the repository (demo project metadata). */
const COMMITTED_DIR = join(APP_DIR, "content");
/** Documents written at runtime when Pinata is not configured (development only, gitignored). */
const LOCAL_DIR = join(APP_DIR, ".data", "content");
const SATELLITE_DIR = join(APP_DIR, "scripts", "satellite", "data");

const GATEWAY = process.env.IPFS_GATEWAY ?? "https://gateway.pinata.cloud";
const MAX_DOCUMENT_BYTES = 2_000_000;

export function sha256(content: string | Uint8Array): Hex {
  return `0x${createHash("sha256").update(content).digest("hex")}`;
}

export interface StoredDocument {
  hash: Hex;
  cid: string;
  text: string;
  source: "repository" | "local" | "ipfs";
}

let satelliteIndex: Map<string, string> | undefined;

/** NDVI series files, indexed by the sha256 of their bytes (the value anchored as satelliteHash). */
function satelliteFiles(): Map<string, string> {
  if (satelliteIndex) return satelliteIndex;
  satelliteIndex = new Map();
  if (!existsSync(SATELLITE_DIR)) return satelliteIndex;
  for (const zone of readdirSync(SATELLITE_DIR)) {
    const file = join(SATELLITE_DIR, zone, "ndvi-v1.json");
    if (existsSync(file)) satelliteIndex.set(sha256(readFileSync(file)), file);
  }
  return satelliteIndex;
}

function readLocal(hash: Hex): Pick<StoredDocument, "text" | "source"> | undefined {
  const name = `${hash.slice(2)}.json`;
  for (const [dir, source] of [[COMMITTED_DIR, "repository"], [LOCAL_DIR, "local"]] as const) {
    const file = join(dir, name);
    if (existsSync(file)) return { text: readFileSync(file, "utf8"), source };
  }
  const satellite = satelliteFiles().get(hash);
  return satellite ? { text: readFileSync(satellite, "utf8"), source: "repository" } : undefined;
}

const memory = new Map<string, StoredDocument>();

/**
 * Returns the document whose sha256 is `hash`, from the repository, the local store or IPFS.
 * The bytes are always re-hashed: a document that does not match its anchored hash is never returned.
 */
export async function getDocument(hash: Hex): Promise<StoredDocument | undefined> {
  const key = hash.toLowerCase() as Hex;
  if (!/^0x[0-9a-f]{64}$/.test(key)) return undefined;
  const hit = memory.get(key);
  if (hit) return hit;

  let found = readLocal(key);
  if (!found) {
    try {
      const res = await fetch(`${GATEWAY}/ipfs/${cidFromSha256(key)}`, { signal: AbortSignal.timeout(8_000) });
      const length = Number(res.headers.get("content-length") ?? 0);
      if (res.ok && length <= MAX_DOCUMENT_BYTES) found = { text: await res.text(), source: "ipfs" };
    } catch {
      // Gateway unavailable: treated as "not found", the page says so.
    }
  }
  if (!found || sha256(found.text) !== key) return undefined;
  const doc: StoredDocument = { hash: key, cid: cidFromSha256(key), ...found };
  memory.set(key, doc);
  return doc;
}

export async function getJson<T>(hash: Hex, parse: (value: unknown) => T): Promise<(StoredDocument & { data: T }) | undefined> {
  const doc = await getDocument(hash);
  if (!doc) return undefined;
  try {
    return { ...doc, data: parse(JSON.parse(doc.text)) };
  } catch {
    return undefined;
  }
}

export const pinataConfigured = () => Boolean(process.env.PINATA_JWT);

/**
 * Publishes a JSON document on public IPFS (spec 10.5: reports, metadata, certificates) and returns
 * its sha256, ready to be anchored. Without Pinata (local development) it is written to .data/.
 */
export async function putPublicDocument(value: unknown, name: string): Promise<{ hash: Hex; cid: string }> {
  const text = canonicalJson(value);
  const hash = sha256(text);
  const cid = cidFromSha256(hash);
  if (pinataConfigured()) {
    const file = await uploadFile(new TextEncoder().encode(text), { name: `${name}.json`, type: "application/json", network: "public" });
    // Small JSON documents are stored as one raw block, so Pinata returns the CID derived from the hash.
    if (file.cid !== cid) throw new Error(`Unexpected CID ${file.cid}, expected ${cid}`);
  } else {
    if (process.env.NODE_ENV === "production") throw new Error("PINATA_JWT is required in production");
    mkdirSync(LOCAL_DIR, { recursive: true });
    writeFileSync(join(LOCAL_DIR, `${hash.slice(2)}.json`), text);
  }
  memory.set(hash, { hash, cid, text, source: pinataConfigured() ? "ipfs" : "local" });
  return { hash, cid };
}
