// Assembles out/blueroot-demo.mp4 (1080p30, H.264/AAC) and out/blueroot-demo.srt.
// Picture per scene: clips/<id>.* > build/cuts/<id>.mp4 > build/captures/<id>.webm > build/slides/<id>.png.
// NO_SUBS=1 skips burning the captions into the picture (the .srt is always written).
// build/music.wav (music.mjs), when present, plays under the voice and ducks while it speaks; NO_MUSIC=1 leaves it out.
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
const TIDE = "0x0b3c5d";
const fit = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${TIDE},setsar=1,fps=${FPS}`;

function picture(id) {
  const clip = findFile(join(ROOT, "clips", id), ["mp4", "mov", "webm", "mkv"]);
  if (clip) return { kind: "clip", file: clip, trim: 0 };
  const cut = join(BUILD, "cuts", `${id}.mp4`);
  if (existsSync(cut)) return { kind: "cut", file: cut, trim: 0 };
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
  // Photo slides get a slow push-in, computed on a double-size copy so the motion stays smooth.
  const zoom =
    pic.kind === "slide" && scene.zoom
      ? `scale=${W * 2}:${H * 2},zoompan=z='1+0.06*on/${Math.round(seconds * FPS)}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=${W}x${H}:fps=${FPS},`
      : "";
  const input = pic.kind === "slide" ? ["-loop", "1", "-framerate", String(FPS), "-t", String(seconds), "-i", pic.file] : ["-ss", String(pic.trim), "-i", pic.file];
  const out = join(segs, `${scene.id}.mp4`);
  ffmpeg([
    ...input,
    "-i", join(BUILD, "voice", `${scene.id}.wav`),
    "-filter_complex",
    `[0:v]${zoom}${fit},tpad=stop_mode=clone:stop_duration=${seconds},trim=duration=${seconds},setpts=PTS-STARTPTS,` +
      `fade=t=in:st=0:d=${FADE}:color=${TIDE},fade=t=out:st=${(seconds - FADE).toFixed(3)}:d=${FADE}:color=${TIDE}[v];` +
      `[1:a]adelay=${LEAD * 1000}:all=1,apad,atrim=duration=${seconds}[a]`,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    out,
  ]);
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

// Final pass: burned captions (libass, fonts copied next to the build) and broadcast loudness.
const fonts = dir("fonts");
for (const f of ["segoeui.ttf", "segoeuib.ttf"]) {
  const src = join(process.env.WINDIR ?? "C:\\Windows", "Fonts", f);
  if (existsSync(src)) copyFileSync(src, join(fonts, f));
}
const style = "FontName=Segoe UI,Bold=1,Fontsize=12,PrimaryColour=&H00FFFFFF,BorderStyle=3,OutlineColour=&H405D3C0B,Outline=6,Shadow=0,MarginV=22,MarginL=60,MarginR=60";
const final = join(OUT, "blueroot-demo.mp4");
const music = join(BUILD, "music.wav");
const withMusic = existsSync(music) && !process.env.NO_MUSIC;
const graph = [
  process.env.NO_SUBS ? "[0:v]null[v]" : `[0:v]subtitles=captions.srt:fontsdir=fonts:force_style='${style}'[v]`,
  // The pad ducks under the voice (sidechain keyed on the narration), then the mix is normalized.
  withMusic
    ? `[0:a]asplit[voice][key];[key]volume=6[sc];[1:a]afade=t=out:st=${(clock - 4).toFixed(2)}:d=4[pad];[pad][sc]sidechaincompress=threshold=0.02:ratio=6:attack=120:release=1200[bed];` +
      "[voice][bed]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11[a]"
    : "[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]",
];
ffmpeg(
  [
    "-i", full,
    ...(withMusic ? ["-i", "music.wav"] : []),
    "-filter_complex", graph.join(";"),
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-movflags", "+faststart",
    final,
  ],
  { cwd: BUILD },
);
console.log(`\n${final}\n${Math.floor(clock / 60)}:${String(Math.round(clock % 60)).padStart(2, "0")}`);
