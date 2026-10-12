import { createHash } from "node:crypto";
import { cellToLatLng, latLngToCell } from "h3-js";
import { describe, expect, it } from "vitest";
import { cidFromSha256 } from "../src/lib/content/cid";
import { checkPhoto, dHash, hammingDistance } from "../src/lib/evidence/checks";
import { extractExifSegment, insertExifSegment, resetOrientation } from "../src/lib/evidence/jpeg";
import { type RegistryEvent, buildState, projectIdOf } from "../src/lib/registry/state";
import { THRESHOLD, combinedScore, expectedQuantity, fieldScore } from "../src/lib/score";

const sha = (s: string) => `0x${createHash("sha256").update(s).digest("hex")}` as const;
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as const;
const A = "0x00000000000000000000000000000000000000a1" as const;
const C = "0x00000000000000000000000000000000000000c1" as const;
const V1 = "0x00000000000000000000000000000000000000b1" as const;
const V2 = "0x00000000000000000000000000000000000000b2" as const;
const TOKEN = ((1n << 16n) | 2026n).toString();

let block = 0;
const at = <T extends object>(e: T) => ({ blockNumber: ++block, logIndex: 0, txHash: tx(block), timestamp: 1_760_000_000 + block, ...e }) as unknown as RegistryEvent;

describe("buildState: the registry is rebuilt from events only", () => {
  const events: RegistryEvent[] = [
    at({ kind: "ProjectRegistered", projectId: 1, owner: A, community: C, metadataHash: sha("meta") }),
    at({ kind: "CellsAdded", projectId: 1, cells: ["8a754e64992ffff", "8a754e649927fff"], totalCells: 2 }),
    at({ kind: "ReportAnchored", claimId: 1, projectId: 1, reportHash: sha("r"), satelliteHash: sha("s"), score: 80, periodStart: 1, periodEnd: 2, quantity: 1000, deadline: 9_999_999_999 }),
    at({ kind: "Attested", claimId: 1, validator: V1, approve: true, reportHash: sha("r") }),
    at({ kind: "Attested", claimId: 1, validator: V2, approve: true, reportHash: sha("r") }),
    at({ kind: "ClaimApproved", claimId: 1 }),
    at({ kind: "ClaimFinalized", claimId: 1, projectId: 1, tokenId: TOKEN, net: 800, buffer: 200 }),
    at({ kind: "Listed", listingId: 1, seller: A, tokenId: TOKEN, amount: 500, unitPrice: "1000000" }),
    at({ kind: "Purchased", listingId: 1, buyer: V1, tokenId: TOKEN, amount: 500, totalPrice: "500000000", communityAmount: "250000000", feeAmount: "10000000", sellerAmount: "240000000" }),
    at({ kind: "CreditsRetired", retirementId: 1, account: V1, tokenId: TOKEN, amount: 120, beneficiary: V1, reasonHash: sha("why") }),
  ];
  // Shuffled input: order must come from block numbers, not from arrival.
  const state = buildState([...events].reverse(), 1_760_000_100);

  it("reconstructs projects, claims and totals", () => {
    const p = state.projects[0]!;
    expect(p.cells).toHaveLength(2);
    expect(p.issued).toBe(1000);
    expect(p.buffer).toBe(200);
    expect(p.sold).toBe(500);
    expect(p.retired).toBe(120);
    expect(state.claims[0]!.status).toBe("finalized");
    expect(state.claims[0]!.votes).toHaveLength(2);
    expect(state.totals).toMatchObject({ issued: 1000, buffer: 200, sold: 500, retired: 120, volume: "500000000", communityPaid: "250000000" });
  });

  it("closes a sold-out listing and decodes token ids", () => {
    expect(state.listings[0]).toMatchObject({ status: "sold", amount: 0, projectId: 1, vintage: 2026 });
    expect(state.retirements[0]).toMatchObject({ projectId: 1, vintage: 2026, amount: 120 });
  });

  it("attributes every event to its project (audit trail)", () => {
    const claims = new Map(state.claims.map((c) => [c.id, c]));
    expect(state.events.filter((e) => projectIdOf(e, claims) === 1)).toHaveLength(events.length);
  });

  it("derives expiry from the deadline and frees cells of closed projects", () => {
    const s = buildState(
      [
        at({ kind: "ProjectRegistered", projectId: 2, owner: A, community: C, metadataHash: sha("m2") }),
        at({ kind: "CellsAdded", projectId: 2, cells: ["8a754e64992ffff"], totalCells: 1 }),
        at({ kind: "ReportAnchored", claimId: 7, projectId: 2, reportHash: sha("x"), satelliteHash: sha("y"), score: 75, periodStart: 1, periodEnd: 2, quantity: 5, deadline: 100 }),
        at({ kind: "ProjectClosed", projectId: 2, by: A }),
      ],
      101,
    );
    expect(s.claims[0]!.status).toBe("expired");
    expect(s.totals.cells).toBe(0);
  });
});

describe("cidFromSha256", () => {
  it("matches the IPFS CID of a raw block (empty file test vector)", () => {
    expect(cidFromSha256(sha(""))).toBe("bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku");
  });
  it("rejects anything but a sha256 digest", () => {
    expect(() => cidFromSha256("0x1234")).toThrow();
  });
});

describe("scores (demonstration assumptions)", () => {
  it("weights 40/40/20", () => {
    expect(combinedScore({ satellite: 80, field: 70, ai: 90 })).toBe(78);
    expect(THRESHOLD).toBe(70);
  });
  it("rewards valid photos spread over the zone", () => {
    expect(fieldScore({ submitted: 0, accepted: 0, coveredCells: 0, totalCells: 24 })).toBe(0);
    expect(fieldScore({ submitted: 10, accepted: 10, coveredCells: 3, totalCells: 24 })).toBe(100);
    expect(fieldScore({ submitted: 10, accepted: 5, coveredCells: 1, totalCells: 24 })).toBe(42);
  });
  it("mirrors the contract quantity formula", () => {
    // 24 cells x 1.19 ha x 1 year x 80 % = 22.85 ha-years = 2284 units (rounded down)
    expect(expectedQuantity(24, 119, 365 * 86_400, 80)).toBe(2284);
  });
  it("refuses out-of-range inputs", () => {
    expect(() => combinedScore({ satellite: 101, field: 0, ai: 0 })).toThrow(RangeError);
  });
});

describe("photo checks (F4)", () => {
  const cell = latLngToCell(6.2672, 1.8211, 10);
  const [lat, lon] = cellToLatLng(cell);
  const now = new Date("2026-10-12T12:00:00Z");
  const base = { latitude: lat, longitude: lon, capturedAt: new Date("2026-10-01T09:00:00Z"), phash: "f0f0f0f0f0f0f0f0" };

  it("accepts a recent photo inside the zone", () => {
    expect(checkPhoto(base, { cells: new Set([cell]), existing: [], now })).toEqual({ cell, flags: [], duplicateOf: null, accepted: true });
  });
  it("flags out-of-zone, missing GPS, future and old dates", () => {
    expect(checkPhoto(base, { cells: new Set(), existing: [], now }).flags).toEqual(["out_of_zone"]);
    expect(checkPhoto({ ...base, latitude: undefined }, { cells: new Set([cell]), existing: [], now }).flags).toEqual(["no_gps"]);
    expect(checkPhoto({ ...base, capturedAt: new Date("2026-12-01") }, { cells: new Set([cell]), existing: [], now }).flags).toEqual(["future_date"]);
    expect(checkPhoto({ ...base, capturedAt: new Date("2024-01-01") }, { cells: new Set([cell]), existing: [], now }).flags).toEqual(["too_old"]);
  });
  it("detects a near-identical photo as a duplicate", () => {
    const r = checkPhoto(base, { cells: new Set([cell]), existing: [{ id: "0xabc", phash: "f0f0f0f0f0f0f0f1" }], now });
    expect(r).toMatchObject({ duplicateOf: "0xabc", accepted: false, flags: ["duplicate"] });
  });
  it("computes a 64-bit difference hash", () => {
    const gradient = Uint8Array.from({ length: 72 }, (_, i) => (i % 9) * 20);
    expect(dHash(gradient)).toBe("0000000000000000");
    expect(dHash(gradient.map((v) => 255 - v))).toBe("ffffffffffffffff");
    expect(hammingDistance("0000000000000000", "ffffffffffffffff")).toBe(64);
  });
});

describe("EXIF transplant (client compression)", () => {
  // Minimal JPEG: SOI, APP1 Exif (big-endian TIFF, IFD0 with Orientation = 6), SOS, EOI.
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0];
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const app1 = [0xff, 0xe1, 0, payload.length + 2, ...payload];
  const original = Uint8Array.from([0xff, 0xd8, ...app1, 0xff, 0xda, 0, 2, 0xff, 0xd9]);

  it("extracts the Exif segment and resets the orientation", () => {
    const segment = extractExifSegment(original)!;
    expect(Array.from(segment)).toEqual(app1);
    resetOrientation(segment);
    expect(segment[10 + 8 + 2 + 8 + 1]).toBe(1);
  });
  it("inserts the segment right after SOI", () => {
    const compressed = Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
    const out = insertExifSegment(compressed, extractExifSegment(original)!);
    expect(Array.from(out.slice(0, 4))).toEqual([0xff, 0xd8, 0xff, 0xe1]);
    expect(extractExifSegment(out)).not.toBeNull();
  });
  it("returns null for a non-JPEG", () => {
    expect(extractExifSegment(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
});
