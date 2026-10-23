// A quiet ambient pad generated from sine chords -> build/music.wav, as long as the whole video.
// No samples and no rights to clear. render.mjs mixes it under the voice and ducks it while someone speaks.
import { join } from "node:path";
import { BUILD, ffmpeg, readJson } from "./lib.mjs";

const timeline = readJson(join(BUILD, "timeline.json"), null);
if (!timeline) throw new Error("Run `npm run voice` first.");
const total = timeline.reduce((a, t) => a + t.seconds, 0) + 1;

// D add9, B minor 7, G major 7, A: each sounds 16 s, crossfading with the next every 8 s.
const chords = [
  [146.83, 220.0, 329.63, 369.99],
  [123.47, 185.0, 293.66, 440.0],
  [98.0, 146.83, 246.94, 369.99],
  [110.0, 164.81, 277.18, 329.63],
];
const STEP = 8;
const voice = (f, detune) =>
  [`sin(2*PI*${f}*t)`, `0.6*sin(2*PI*${(f + detune).toFixed(2)}*t)`, `0.15*sin(2*PI*${(2 * f).toFixed(2)}*t)`].join("+");
// Window of chord k: sin² over two steps; neighbouring windows sum to one, so the level never dips.
const pad = (detune) =>
  chords
    .map((notes, k) => {
      const u = `mod(t/${STEP}+${chords.length - k},${chords.length})`;
      return `if(lt(${u},2),pow(sin(PI*${u}/2),2),0)*(${notes.map((f) => voice(f, detune)).join("+")})`;
    })
    .join("+");

ffmpeg([
  "-f", "lavfi",
  "-i", `aevalsrc=exprs='0.04*(${pad(0.7)})|0.04*(${pad(-0.7)})':s=48000:d=${total.toFixed(2)}`,
  "-af",
  [
    "lowpass=f=1400",
    "tremolo=f=0.15:d=0.25",
    "aecho=0.8:0.8:180|370:0.3|0.2",
    "afade=t=in:d=4",
    `afade=t=out:st=${(total - 5).toFixed(2)}:d=5`,
    "loudnorm=I=-30:TP=-6:LRA=7",
  ].join(","),
  "-ar", "48000", "-ac", "2",
  join(BUILD, "music.wav"),
]);
console.log(`music ${total.toFixed(1)}s`);
