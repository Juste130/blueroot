// Edits your own screen recordings into build/cuts/<id>.mp4 for scenes that declare a `cut` (scenes.mjs):
// crop away the browser chrome, keep only the listed parts, speed them up, blur what must not be shown.
// A part with speed "fit" absorbs the difference so the cut lasts exactly as long as the narration.
// REC_DIR is the folder holding the recordings (default: ~/Videos/Captures). Run after voice.mjs.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BUILD, FPS, H, W, dir, ffmpeg, readJson } from "./lib.mjs";
import { scenes } from "./scenes.mjs";

const recDir = process.env.REC_DIR ?? join(homedir(), "Videos", "Captures");
const timeline = readJson(join(BUILD, "timeline.json"), null);
if (!timeline) throw new Error("Run `npm run voice` first: cuts are timed on the narration.");
const out = dir("cuts");

for (const scene of scenes.filter((s) => s.cut)) {
  const { src, crop, parts, blur = [] } = scene.cut;
  const file = join(recDir, src);
  if (!existsSync(file)) {
    console.log(`cut ${scene.id} skipped: ${file} not found (set REC_DIR)`);
    continue;
  }
  const target = timeline.find((t) => t.id === scene.id).seconds;
  const fixed = parts.reduce((a, p) => a + (p.speed === "fit" ? 0 : (p.to - p.from) / p.speed) + (p.hold ?? 0), 0);
  const elastic = parts.filter((p) => p.speed === "fit").reduce((a, p) => a + (p.to - p.from), 0);
  // Never slower than real time: a cut shorter than its narration holds its last frame at render time.
  const fit = elastic ? Math.max(1, elastic / Math.max(1, target - fixed)) : 1;

  // Blur on the full frame first (coordinates are those of the recording), then crop, then cut.
  const chain = [];
  let last = "[0:v]";
  blur.forEach((b, i) => {
    chain.push(`${last}split[base${i}][patch${i}]`);
    chain.push(`[patch${i}]crop=${b.w}:${b.h}:${b.x}:${b.y},gblur=sigma=9:steps=3[blur${i}]`);
    chain.push(`[base${i}][blur${i}]overlay=${b.x}:${b.y}:enable='between(t,${b.from},${b.to})'[b${i}]`);
    last = `[b${i}]`;
  });
  const [cw, ch, cx, cy] = crop;
  chain.push(`${last}crop=${cw}:${ch}:${cx}:${cy},scale=${W}:${H}:flags=lanczos,setsar=1,split=${parts.length}${parts.map((_, i) => `[s${i}]`).join("")}`);
  parts.forEach((p, i) => {
    const speed = p.speed === "fit" ? fit : p.speed;
    const freeze = p.hold ? `,tpad=stop_mode=clone:stop_duration=${p.hold}` : "";
    chain.push(`[s${i}]trim=${p.from}:${p.to},setpts=(PTS-STARTPTS)/${speed.toFixed(4)},fps=${FPS}${freeze}[p${i}]`);
  });
  chain.push(`${parts.map((_, i) => `[p${i}]`).join("")}concat=n=${parts.length}:v=1:a=0[v]`);

  ffmpeg([
    "-i", file,
    "-filter_complex", chain.join(";"),
    "-map", "[v]", "-an",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS),
    join(out, `${scene.id}.mp4`),
  ]);
  console.log(`cut ${scene.id} ${target.toFixed(1)}s from ${src}${elastic ? ` (fit ×${fit.toFixed(1)})` : ""}`);
}
