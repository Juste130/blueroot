#!/usr/bin/env node
/**
 * Usage:
 *   npm run compute -- --zone <id|all> --from 2023-12-01 --to 2026-09-30 \
 *     --baseline 2024-03:2024-05 --latest 2026-03:2026-05
 *   npm run verify  -- data/<zone>/ndvi-v1.json
 *
 * Baseline and latest windows must cover the SAME season so seasonal greening is not mistaken for
 * restoration, and avoid the Harmattan (Dec-Feb), whose Saharan dust haze depresses NDVI in Benin.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { canonicalJson, sha256Hex } from "./canonical.ts";
import { computeSeries } from "./pipeline.ts";
import { NdviSeriesSchema } from "./schema.ts";
import { listZoneIds, loadZone } from "./zones.ts";

const DATA_DIR = fileURLToPath(new URL("../data", import.meta.url));
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

async function compute(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      zone: { type: "string", default: "all" },
      from: { type: "string", default: "2023-12-01" },
      to: { type: "string", default: "2026-09-30" },
      baseline: { type: "string", default: "2024-03:2024-05" },
      latest: { type: "string", default: "2026-03:2026-05" },
      "max-cloud": { type: "string", default: "60" },
    },
  });
  if (!isoDate.test(values.from) || !isoDate.test(values.to) || values.from >= values.to) {
    throw new Error("--from and --to must be YYYY-MM-DD with from < to");
  }
  const baselineWindow = parseWindow(values.baseline);
  const latestWindow = parseWindow(values.latest);
  const ids = values.zone === "all" ? listZoneIds() : [values.zone];

  for (const id of ids) {
    const zone = loadZone(id);
    console.log(`\n${zone.name}: ${zone.cells.length} cells, ${zone.areaHa.toFixed(1)} ha`);
    const series = await computeSeries(zone, {
      from: values.from,
      to: values.to,
      maxCloudCover: Number(values["max-cloud"]),
      baselineWindow,
      latestWindow,
      onError: (item, error) => console.warn(`\n  skipped ${item.id}: ${error.message}`),
      onProgress: (done, total, item, accepted) =>
        process.stdout.write(`\r  scenes ${done}/${total} ${accepted ? "+" : "-"} ${item.id.padEnd(40)}`),
    });
    const content = canonicalJson(series);
    const file = join(DATA_DIR, id, "ndvi-v1.json");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    const hash = sha256Hex(content);
    writeFileSync(`${file}.sha256`, `${hash.slice(2)}  ndvi-v1.json\n`);
    const s = series.summary;
    console.log(
      `\n  accepted ${s.scenesAccepted}/${s.scenesConsidered} (failed ${s.scenesFailed}) · baseline ${s.baselineNdvi} · latest ${s.latestNdvi}` +
        ` · score ${s.satelliteScore}\n  sha256 ${hash}`,
    );
  }
}

function parseWindow(value: string): { from: string; to: string } {
  const match = /^(\d{4}-\d{2}):(\d{4}-\d{2})$/.exec(value);
  if (!match || match[1]! > match[2]!) throw new Error(`Invalid window "${value}", expected YYYY-MM:YYYY-MM`);
  return { from: match[1]!, to: match[2]! };
}

function verify(args: string[]) {
  if (args.length === 0) throw new Error("Usage: verify <file> [...]");
  let ok = true;
  for (const file of args) {
    const content = readFileSync(file, "utf8");
    const parsed = NdviSeriesSchema.safeParse(JSON.parse(content));
    const canonical = parsed.success && canonicalJson(parsed.data) === content;
    console.log(`${file}\n  schema ${parsed.success ? "ok" : "INVALID"} · canonical ${canonical ? "ok" : "NO"}`);
    console.log(`  sha256 ${sha256Hex(content)}`);
    if (!parsed.success) console.log(parsed.error.issues.slice(0, 5));
    ok &&= Boolean(canonical);
  }
  if (!ok) process.exitCode = 1;
}

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === "compute") await compute(rest);
  else if (command === "verify") verify(rest);
  else throw new Error("Commands: compute | verify");
} catch (error) {
  console.error(`Error: ${(error as Error).message}`);
  process.exitCode = 1;
}
