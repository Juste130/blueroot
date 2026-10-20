// Narration per scene -> build/voice/<id>.wav, and build/timeline.json (each scene's length).
// Your own recording voice/<id>.(wav|mp3|m4a) always wins; otherwise a Windows SAPI voice reads the
// script as a timing draft. VOICE picks the SAPI voice, RATE its speed (-10..10).
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUILD, LEAD, OUT, ROOT, TAIL, dir, duration, ffmpeg, findFile } from "./lib.mjs";
import { scenes } from "./scenes.mjs";

const out = dir("voice");
const tmp = dir("tmp");
const voice = process.env.VOICE ?? "Microsoft Zira Desktop";
const rate = Number(process.env.RATE ?? 0);

function synthesize(text, wav) {
  const txt = join(tmp, "narration.txt");
  writeFileSync(txt, text, "utf8");
  const ps = [
    "Add-Type -AssemblyName System.Speech",
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
    `$s.SelectVoice('${voice.replace(/'/g, "''")}')`,
    `$s.Rate = ${rate}`,
    `$s.SetOutputToWaveFile('${wav.replace(/'/g, "''")}')`,
    `$s.Speak([IO.File]::ReadAllText('${txt.replace(/'/g, "''")}', [Text.Encoding]::UTF8))`,
    "$s.Dispose()",
  ].join("; ");
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { stdio: ["ignore", "ignore", "pipe"] });
  if (r.status !== 0) throw new Error(`SAPI failed: ${r.stderr.toString()}`);
}

const timeline = [];
for (const scene of scenes) {
  const wav = join(out, `${scene.id}.wav`);
  const recorded = findFile(join(ROOT, "voice", scene.id), ["wav", "mp3", "m4a"]);
  const raw = recorded ?? join(tmp, `${scene.id}.sapi.wav`);
  if (!recorded) synthesize(scene.narration, raw);
  // One format for every scene: 48 kHz stereo, leading/trailing silence trimmed.
  ffmpeg([
    "-i", raw,
    "-af", "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse",
    "-ar", "48000", "-ac", "2", wav,
  ]);
  const voiceSeconds = duration(wav);
  timeline.push({ id: scene.id, voiceSeconds, seconds: +(LEAD + voiceSeconds + TAIL).toFixed(3), source: recorded ? "recorded" : "synthetic" });
  console.log(`voice ${scene.id} ${voiceSeconds.toFixed(1)}s ${recorded ? "(your recording)" : "(synthetic draft)"}`);
}

writeFileSync(join(BUILD, "timeline.json"), JSON.stringify(timeline, null, 2));
const total = timeline.reduce((a, t) => a + t.seconds, 0);
console.log(`total ${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")}`);

// Reading script for recording your own voice, one file per scene.
mkdirSync(OUT, { recursive: true });
const blocks = scenes.map((s) => {
  const draft = timeline.find((t) => t.id === s.id).voiceSeconds.toFixed(0);
  return `## ${s.id} · ${s.title} (draft ${draft} s)\n\n${s.narration}\n`;
});
writeFileSync(
  join(OUT, "script.md"),
  "# BlueRoot demo: narration\n\nRecord each block as voice/<id>.wav (or .m4a / .mp3), then run `npm run voice` and `npm run render`.\n\n" +
    blocks.join("\n"),
);
