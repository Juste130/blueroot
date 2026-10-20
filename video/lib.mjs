import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export const ROOT = dirname(fileURLToPath(import.meta.url));
export const BUILD = join(ROOT, "build");
export const OUT = join(ROOT, "out");
export const W = 1920;
export const H = 1080;
export const FPS = 30;
/** Silence before and after each scene's narration, in seconds. */
export const LEAD = 0.4;
export const TAIL = 0.7;

export const FFMPEG = require("ffmpeg-static");

export function dir(...parts) {
  const d = join(BUILD, ...parts);
  mkdirSync(d, { recursive: true });
  return d;
}

/** First existing `<base>.<ext>`, or undefined. */
export function findFile(base, exts) {
  return exts.map((e) => `${base}.${e}`).find((p) => existsSync(p));
}

export function ffmpeg(args, opts = {}) {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "inherit", "pipe"], ...opts });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr?.toString().trim()}\n  args: ${args.join(" ")}`);
}

/** Media duration in seconds, read from ffmpeg's probe output (ffprobe is not bundled). */
export function duration(file) {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-i", file], { stdio: ["ignore", "ignore", "pipe"] });
  const m = r.stderr.toString().match(/Duration: (\d+):(\d+):([\d.]+)/);
  if (!m) throw new Error(`cannot read duration of ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/**
 * Chromium driven by patchright (a Playwright fork) from the CodeGPT extension already on this machine,
 * falling back to a local `npm i patchright` / `playwright`.
 */
export function chromium() {
  const roots = [];
  const ext = join(homedir(), ".vscode", "extensions");
  if (existsSync(ext)) {
    const newest = readdirSync(ext)
      .filter((d) => d.startsWith("danielsanmedium.dscodegpt-"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .at(-1);
    if (newest) roots.push(join(ext, newest, "standalone") + "/");
  }
  roots.push(ROOT + "/");
  for (const root of roots) {
    for (const name of ["patchright", "playwright"]) {
      try {
        const mod = createRequire(root)(name);
        if (mod?.chromium) return mod.chromium;
      } catch {}
    }
  }
  throw new Error("No patchright or playwright found. Run `npm i -D playwright` in video/ then `npx playwright install chromium`.");
}

export async function launch() {
  return chromium().launch({ headless: true, channel: "chromium", args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader"] });
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
