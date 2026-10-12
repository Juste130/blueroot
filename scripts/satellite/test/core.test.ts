import { createHash } from "node:crypto";
import { getResolution, isValidCell } from "h3-js";
import { describe, expect, it } from "vitest";

import { canonicalJson, round, sha256Hex } from "../src/canonical.ts";
import { median, monthlyMedian, pixelNdvi, sceneStats, windowMedian } from "../src/ndvi.ts";
import { satelliteScore } from "../src/score.ts";
import { dedupeByDate, type StacItem } from "../src/stac.ts";
import { utmDefinition } from "../src/raster.ts";
import { listZoneIds, loadZone } from "../src/zones.ts";

describe("pixelNdvi", () => {
  it("applies Collection 1 scaling (DN * 1e-4 - 0.1)", () => {
    // red 0.05, nir 0.35 -> (0.35 - 0.05) / 0.40 = 0.75
    expect(pixelNdvi(1500, 4500)).toBeCloseTo(0.75, 10);
  });
  it("rejects nodata and non-positive sums", () => {
    expect(pixelNdvi(0, 4000)).toBeNull();
    expect(pixelNdvi(4000, 0)).toBeNull();
    expect(pixelNdvi(500, 500)).toBeNull(); // both reflectances -0.05
  });
  it("is clamped to [-1, 1]", () => {
    expect(pixelNdvi(900, 3000)).toBe(1); // red reflectance negative after offset
  });
});

describe("sceneStats", () => {
  it("keeps only valid SCL classes", () => {
    const stats = sceneStats([
      { red: 1500, nir: 4500, scl: 4 }, // vegetation: 0.75
      { red: 1500, nir: 4500, scl: 9 }, // cloud: dropped
      { red: 1500, nir: 4500, scl: 6 }, // water: dropped (tide noise)
      { red: 2000, nir: 3000, scl: 5 }, // (0.2-0.1)/(0.3) = 0.333...
    ]);
    expect(stats.validPixels).toBe(2);
    expect(stats.totalPixels).toBe(4);
    expect(stats.validFraction).toBe(0.5);
    expect(stats.meanNdvi).toBeCloseTo((0.75 + 1 / 3) / 2, 10);
  });
  it("returns NaN mean when nothing is valid", () => {
    expect(sceneStats([{ red: 1, nir: 1, scl: 8 }]).meanNdvi).toBeNaN();
    expect(sceneStats([]).validFraction).toBe(0);
  });
});

describe("aggregation", () => {
  it("median handles odd, even and empty inputs", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNaN();
  });
  it("monthlyMedian groups and sorts by month", () => {
    const monthly = monthlyMedian([
      { date: "2025-02-10", meanNdvi: 0.6 },
      { date: "2025-01-05", meanNdvi: 0.5 },
      { date: "2025-01-25", meanNdvi: 0.7 },
      { date: "2025-01-15", meanNdvi: 0.1 }, // residual cloud: median ignores it
    ]);
    expect(monthly).toEqual([
      { month: "2025-01", ndvi: 0.5, scenes: 3 },
      { month: "2025-02", ndvi: 0.6, scenes: 1 },
    ]);
    expect(windowMedian(monthly, "2025-01", "2025-02")).toBeCloseTo(0.55);
    expect(windowMedian(monthly, "2026-01", "2026-03")).toBeNaN();
  });
});

describe("satelliteScore", () => {
  it("rewards dense and improving canopy", () => {
    expect(satelliteScore(0.5, 0.6)).toEqual({ levelScore: 100, trendScore: 100, satelliteScore: 100 });
    expect(satelliteScore(0.5, 0.5).trendScore).toBe(50);
  });
  it("penalises loss and sparse vegetation", () => {
    expect(satelliteScore(0.6, 0.45).trendScore).toBe(0);
    expect(satelliteScore(0.2, 0.2)).toEqual({ levelScore: 0, trendScore: 50, satelliteScore: 20 });
  });
  it("returns 0 without data", () => {
    expect(satelliteScore(Number.NaN, 0.6).satelliteScore).toBe(0);
  });
});

describe("canonical JSON and hash", () => {
  it("is independent of key order and matches a plain sha256 of the bytes", () => {
    const a = canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: "é" } });
    const b = canonicalJson({ a: { c: "é", d: [3, { x: 2, y: 1 }] }, b: 1 });
    expect(a).toBe(b);
    expect(a.endsWith("\n")).toBe(true);
    expect(sha256Hex(a)).toBe(`0x${createHash("sha256").update(a, "utf8").digest("hex")}`);
    expect(sha256Hex(a)).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it("rejects non-finite numbers and normalises -0", () => {
    expect(() => canonicalJson({ x: Number.NaN })).toThrow();
    expect(round(-0.00001)).toBe(0);
    expect(round(0.123456)).toBe(0.1235);
  });
});

describe("stac helpers", () => {
  const item = (id: string, datetime: string, cc: number) =>
    ({ id, properties: { datetime, "eo:cloud_cover": cc }, assets: {} }) as StacItem;
  it("keeps the least cloudy scene per day, sorted", () => {
    const out = dedupeByDate([
      item("b", "2025-01-02T10:00:00Z", 30),
      item("a", "2025-01-01T10:00:00Z", 50),
      item("c", "2025-01-02T10:00:05Z", 10),
    ]);
    expect(out.map((i) => i.id)).toEqual(["a", "c"]);
  });
  it("builds UTM definitions", () => {
    expect(utmDefinition(32631)).toBe("+proj=utm +zone=31 +datum=WGS84 +units=m +no_defs");
    expect(utmDefinition(32731)).toContain("+south");
    expect(() => utmDefinition(4326)).toThrow();
  });
});

describe("demo zones", () => {
  it("are real resolution-10 H3 cells covering the mapped mangrove", () => {
    const ids = listZoneIds();
    expect(ids).toEqual(["djegbame-ouidah", "gnigbohoue-grand-popo", "sodome-grand-popo"]);
    for (const id of ids) {
      const zone = loadZone(id);
      expect(zone.cells.length).toBeGreaterThan(3);
      expect(new Set(zone.cells).size).toBe(zone.cells.length);
      for (const c of zone.cells) {
        expect(isValidCell(c)).toBe(true);
        expect(getResolution(c)).toBe(10);
      }
      // Verification.sol default cellAreaCentiHa = 119 must never exceed the real cell area here.
      const perCellCentiHa = (zone.areaHa * 100) / zone.cells.length;
      expect(perCellCentiHa).toBeGreaterThanOrEqual(119);
      expect(perCellCentiHa).toBeLessThan(121);
    }
  });
  it("do not overlap each other (same rule as the registry)", () => {
    const seen = new Set<string>();
    for (const id of listZoneIds()) {
      for (const c of loadZone(id).cells) {
        expect(seen.has(c)).toBe(false);
        seen.add(c);
      }
    }
  });
  it("rejects path traversal in zone ids", () => {
    expect(() => loadZone("../secrets")).toThrow(/Invalid zone id/);
  });
});
