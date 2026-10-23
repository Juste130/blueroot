// Assembles out/blueroot-demo.mp4 (1080p30, H.264/AAC) and out/blueroot-demo.srt.
// Picture per scene: clips/<id>.* > build/captures/<id>.webm > build/slides/<id>.png.
// NO_SUBS=1 skips burning the captions into the picture (the .srt is always written).
// Slide scenes may open on photos (slow pan, credit on screen). A generated ambient pad plays under the
// voice and ducks while it speaks; NO_MUSIC=1 leaves it out.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUILD, FPS, H, LEAD, OUT, ROOT, W, dir, duration, ffmpeg, findFile, readJson } from "./lib.mjs";
import { scenes } from "./scenes.mjs";

const timeline = readJson(join(BUILD, "timeline.json"), null);
if (!timeline) throw new Error("Run `npm run voice` first.");
const captures = readJson(join(BUILD, "captures", "meta.json"), {});
const segs = dir("segments");
mkdirSync(OUT, { recursive: true });

const FADE = 0.25;
const XFADE = 0.6;
const TIDE = "0x0b3c5d";
const credits = readJson(join(ROOT, "assets", "photos", "credits.json"), {});

// Fonts next to the build: drawtext (photo credits) and libass (captions) read them from there.
const fonts = dir("fonts");
for (const f of ["segoeui.ttf", "segoeuib.ttf"]) {
  const src = join(process.env.WINDIR ?? "C:\\Windows", "Fonts", f);
  if (existsSync(src)) copyFileSync(src, join(fonts, f));
}

/** Photos panning one after another, cross-faded into the slide: returns inputs and a graph ending in [base]. */
function photoOpening(photos, slide, seconds) {
  const inputs = [];
  const graph = [];
  photos.forEach((p, i) => {
    inputs.push("-loop", "1", "-framerate", String(FPS), "-t", String(p.seconds + XFADE), "-i", join(ROOT, "assets", "photos", `${p.file}.jpg`));
    const d = p.seconds + XFADE;
    const x = i % 2 ? `(iw-ow)*(1-t/${d})` : `(iw-ow)*t/${d}`;
    const c = credits[p.file];
    const text = c ? `Photo ${c.author} · ${c.license} · Wikimedia Commons`.replace(/['%:\\]/g, "") : "";
    graph.push(
      `[${i}:v]scale=2112:1188:force_original_aspect_ratio=increase,crop=2112:1188,crop=${W}:${H}:x='${x}':y='(ih-oh)/2',setsar=1,fps=${FPS},settb=AVTB,` +
        (text ? `drawtext=fontfile=fonts/segoeui.ttf:text='${text}':x=w-tw-36:y=30:fontsize=24:fontcolor=white@0.9:shadowcolor=black@0.7:shadowx=2:shadowy=2,` : "") +
        `format=yuv420p,trim=duration=${d}[p${i}]`,
    );
  });
  const n = photos.length;
  const rest = seconds - photos.reduce((a, p) => a + p.seconds, 0) + XFADE;
  inputs.push("-loop", "1", "-framerate", String(FPS), "-t", String(rest + XFADE), "-i", slide);
  graph.push(`[${n}:v]${fit},settb=AVTB,format=yuv420p[sl]`);
  let cur = "p0";
  let offset = photos[0].seconds;
  for (let i = 1; i <= n; i++) {
    const next = i < n ? `p${i}` : "sl";
    const label = i < n ? `x${i}` : "base";
    graph.push(`[${cur}][${next}]xfade=transition=fade:duration=${XFADE}:offset=${offset.toFixed(3)}[${label}]`);
    cur = label;
    if (i < n) offset += photos[i].seconds;
  }
  return { inputs, graph: graph.join(";"), voice: n + 1 };
}
const fit = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${TIDE},setsar=1,fps=${FPS}`;

function picture(id) {
  const clip = findFile(join(ROOT, "clips", id), ["mp4", "mov", "webm", "mkv"]);
  if (clip) return { kind: "clip", file: clip, trim: 0 };
  const cap = join(BUILD, "captures", `${id}.webm`);
  if (existsSync(cap) && captures[id]) return { kind: "capture", file: cap, trim: captures[id].trim };
  return { kind: "slide", file: join(BUILD, "slides", `${id}.png`) };
}

const starts = {};
let clock = 0;
const list = [];
for (const scene of scenes) {
  const t = timeline.find((x) => x.id === scene.id);
  const pic = picture(scene.id);
  if (pic.kind === "slide" && !existsSync(pic.file)) throw new Error(`Missing ${pic.file}: run \`npm run slides\`.`);
  // Your own clip sets its length when it is longer than the narration; the voice then ends early.
  const seconds = pic.kind === "clip" ? Math.max(t.seconds, duration(pic.file)) : t.seconds;
  const photos = pic.kind === "slide" ? (scene.photos ?? []) : [];
  const opening = photos.length ? photoOpening(photos, pic.file, seconds) : null;
  const input = opening
    ? opening.inputs
    : pic.kind === "slide" ? ["-loop", "1", "-framerate", String(FPS), "-t", String(seconds), "-i", pic.file] : ["-ss", String(pic.trim), "-i", pic.file];
  const voiceIndex = opening ? opening.voice : 1;
  const head = opening ? `${opening.graph};[base]` : `[0:v]${fit},`;
  const out = join(segs, `${scene.id}.mp4`);
  ffmpeg([
    ...input,
    "-i", join(BUILD, "voice", `${scene.id}.wav`),
    "-filter_complex",
    `${head}tpad=stop_mode=clone:stop_duration=${seconds},trim=duration=${seconds},setpts=PTS-STARTPTS,` +
      `fade=t=in:st=0:d=${FADE}:color=${TIDE},fade=t=out:st=${(seconds - FADE).toFixed(3)}:d=${FADE}:color=${TIDE}[v];` +
      `[${voiceIndex}:a]adelay=${LEAD * 1000}:all=1,apad,atrim=duration=${seconds}[a]`,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    out,
  ], { cwd: BUILD });
  starts[scene.id] = clock;
  clock += seconds;
  list.push(`file '${out.replace(/\\/g, "/")}'`);
  console.log(`segment ${scene.id} ${seconds.toFixed(1)}s ${pic.kind}`);
}

writeFileSync(join(BUILD, "concat.txt"), list.join("\n"));
const full = join(BUILD, "full.mp4");
ffmpeg(["-f", "concat", "-safe", "0", "-i", join(BUILD, "concat.txt"), "-c", "copy", full]);

// Captions: sentence chunks timed in proportion to their length within each scene's narration.
const stamp = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
const chunks = (text) =>
  text.split(/(?<=[.?!])\s+/).flatMap((sentence) => {
    if (sentence.length <= 90) return [sentence];
    const parts = [];
    let cur = "";
    for (const piece of sentence.split(/(?<=,)\s+/)) {
      if (cur && (cur + " " + piece).length > 90) (parts.push(cur), (cur = piece));
      else cur = cur ? `${cur} ${piece}` : piece;
    }
    return cur ? [...parts, cur] : parts;
  });
const srt = [];
for (const scene of scenes) {
  const t = timeline.find((x) => x.id === scene.id);
  const parts = chunks(scene.narration);
  const total = parts.reduce((a, p) => a + p.length, 0);
  let at = starts[scene.id] + LEAD;
  for (const part of parts) {
    const len = (t.voiceSeconds * part.length) / total;
    srt.push(`${srt.length + 1}\n${stamp(at)} --> ${stamp(at + len - 0.05)}\n${part}\n`);
    at += len;
  }
}
writeFileSync(join(BUILD, "captions.srt"), srt.join("\n"));
copyFileSync(join(BUILD, "captions.srt"), join(OUT, "blueroot-demo.srt"));

// Music: a slow ambient pad (A minor, F, C, G; one chord every 8 s, each swelling in and out so chord
// changes never click), generated here: no third-party track, no licence to clear.
const music = join(BUILD, "music.wav");
if (!process.env.NO_MUSIC) {
  const chords = [[220, 261.63, 329.63], [174.61, 220, 261.63], [196, 261.63, 329.63], [196, 246.94, 293.66]];
  const pick = (k, detune) => {
    const f = (c) => (chords[c][k] + detune).toFixed(2);
    return `if(eq(C,0),${f(0)},if(eq(C,1),${f(1)},if(eq(C,2),${f(2)},${f(3)})))`;
  };
  const voice = (detune) =>
    (`pow(sin(PI*mod(t,8)/8),0.6)*(` + [0, 1, 2].map((k) => `sin(2*PI*${pick(k, detune)}*t)`).join("+") + `+0.6*sin(PI*${pick(0, detune)}*t))/5`)
      .replaceAll("C,", "floor(mod(t,32)/8),");
  ffmpeg([
    "-f", "lavfi", "-i", `aevalsrc=exprs='${voice(0)}|${voice(0.7)}':s=48000:d=${clock.toFixed(2)}`,
    "-af", `lowpass=f=1600,aecho=0.8:0.6:140|260:0.3|0.2,afade=t=in:d=2,afade=t=out:st=${(clock - 3).toFixed(2)}:d=3`,
    music,
  ]);
}

// Final pass: burned captions (libass), music ducked under the voice, broadcast loudness.
const style = "FontName=Segoe UI,Bold=1,Fontsize=12,PrimaryColour=&H00FFFFFF,BorderStyle=3,OutlineColour=&H405D3C0B,Outline=6,Shadow=0,MarginV=22,MarginL=60,MarginR=60";
const final = join(OUT, "blueroot-demo.mp4");
const subs = process.env.NO_SUBS ? "null" : `subtitles=captions.srt:fontsdir=fonts:force_style='${style}'`;
const audio = process.env.NO_MUSIC
  ? "[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]"
  : // Explicit formats on both branches: without them the sidechain graph stalls on format negotiation.
    "[1:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=0.22[m];" +
    "[0:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,asplit=2[vo][sc];" +
    "[m][sc]sidechaincompress=threshold=0.02:ratio=8:attack=30:release=700[md];" +
    "[vo][md]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]";
ffmpeg(
  [
    "-i", full,
    ...(process.env.NO_MUSIC ? [] : ["-i", music]),
    "-filter_complex", `[0:v]${subs}[v];${audio}`,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-movflags", "+faststart",
    final,
  ],
  { cwd: BUILD },
);
console.log(`\n${final}\n${Math.floor(clock / 60)}:${String(Math.round(clock % 60)).padStart(2, "0")}`);
